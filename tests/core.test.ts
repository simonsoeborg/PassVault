import { describe, expect, it } from 'vitest'
import { argon2id as nobleArgon2id } from '@noble/hashes/argon2.js'
import { deriveRootKey, deriveSubKeys, randomBytes } from '../src/main/vault/crypto'
import { PAD_BLOCK, PREAMBLE_LEN, VaultFormatError, openVault, parseHeader, sealVault } from '../src/main/vault/format'
import { base32Decode, hotp, parseTotp, totp } from '../src/main/totp'
import { generateSecret, DEFAULT_GENERATOR } from '../src/main/generator'
import type { VaultData } from '../src/shared/types'

const FAST_KDF = { memoryKiB: 19_456, iterations: 1, parallelism: 1 }

function sampleVault(): VaultData {
  const now = Date.now()
  return {
    schema: 1,
    name: 'Test vault',
    nameUpdatedAt: now,
    createdAt: now,
    folders: [{ id: 'f1', name: 'Infra', parentId: null, createdAt: now, updatedAt: now }],
    entries: [
      {
        id: 'e1',
        type: 'ssh',
        title: 'prod-db-primary',
        folderId: 'f1',
        tags: ['prod'],
        favorite: false,
        fields: { host: '10.0.4.12', port: '2222', username: 'deploy', auth: 'password', password: 'correct horse battery staple' },
        custom: [],
        notes: '',
        createdAt: now,
        updatedAt: now,
        trashedAt: null,
        history: [],
      },
    ],
    tombstones: [],
  }
}

async function sealed(password = 'hunter2 but longer') {
  const salt = randomBytes(32)
  const vaultId = randomBytes(16)
  const kdf = { ...FAST_KDF, salt }
  const root = await deriveRootKey(password, kdf)
  const file = sealVault({ data: sampleVault(), vaultId, kdf, keys: deriveSubKeys(root) })
  return { file, root, kdf, vaultId }
}

describe('key derivation', () => {
  it('matches an independent Argon2id implementation', async () => {
    const salt = new Uint8Array(32).fill(7)
    const ours = await deriveRootKey('pässwörd', { ...FAST_KDF, salt })
    const reference = nobleArgon2id(new TextEncoder().encode('pässwörd'.normalize('NFC')), salt, {
      m: FAST_KDF.memoryKiB,
      t: FAST_KDF.iterations,
      p: FAST_KDF.parallelism,
      dkLen: 32,
    })
    expect(Buffer.from(ours).toString('hex')).toBe(Buffer.from(reference).toString('hex'))
  })

  it('normalizes composed and decomposed input to the same key', async () => {
    const salt = new Uint8Array(32).fill(1)
    const composed = await deriveRootKey('café', { ...FAST_KDF, salt })
    const decomposed = await deriveRootKey('café', { ...FAST_KDF, salt })
    expect(Buffer.from(composed).equals(Buffer.from(decomposed))).toBe(true)
  })

  it('refuses hostile parameters', async () => {
    await expect(deriveRootKey('x', { memoryKiB: 64, iterations: 1, parallelism: 1, salt: new Uint8Array(32) })).rejects.toThrow()
    await expect(deriveRootKey('x', { memoryKiB: 8_000_000, iterations: 1, parallelism: 1, salt: new Uint8Array(32) })).rejects.toThrow()
  })
})

describe('vault file format', () => {
  it('round-trips vault data', async () => {
    const { file, root, vaultId } = await sealed()
    const opened = openVault(file, root)
    expect(opened.data.entries[0].fields.password).toBe('correct horse battery staple')
    expect(Buffer.from(opened.header.vaultId).equals(Buffer.from(vaultId))).toBe(true)
  })

  it('pads the encrypted body to 4 KiB blocks and never stores plaintext', async () => {
    const { file } = await sealed()
    expect((file.length - PREAMBLE_LEN - 16) % PAD_BLOCK).toBe(0)
    expect(Buffer.from(file).includes(Buffer.from('prod-db-primary'))).toBe(false)
    expect(Buffer.from(file).includes(Buffer.from('correct horse'))).toBe(false)
  })

  it('uses a fresh nonce on every save', async () => {
    const salt = randomBytes(32)
    const kdf = { ...FAST_KDF, salt }
    const keys = deriveSubKeys(await deriveRootKey('pw-pw-pw-pw', kdf))
    const vaultId = randomBytes(16)
    const a = sealVault({ data: sampleVault(), vaultId, kdf, keys })
    const b = sealVault({ data: sampleVault(), vaultId, kdf, keys })
    expect(Buffer.from(parseHeader(a).nonce).equals(Buffer.from(parseHeader(b).nonce))).toBe(false)
  })

  it('reports a wrong password distinctly', async () => {
    const { file, kdf } = await sealed('the right one')
    const wrong = await deriveRootKey('the wrong one', kdf)
    expect(() => openVault(file, wrong)).toThrowError(expect.objectContaining({ code: 'WRONG_PASSWORD' }))
  })

  it('detects a modified body as corruption', async () => {
    const { file, root } = await sealed()
    const tampered = file.slice()
    tampered[PREAMBLE_LEN + 5] ^= 0x01
    expect(() => openVault(tampered, root)).toThrowError(expect.objectContaining({ code: 'CORRUPT' }))
  })

  it('rejects a modified header before decrypting', async () => {
    const { file, root } = await sealed()
    const tampered = file.slice()
    tampered[27] ^= 0x01 // iterations
    expect(() => openVault(tampered, root)).toThrow(VaultFormatError)
  })

  it('rejects files that are not vaults', () => {
    expect(() => parseHeader(new TextEncoder().encode('hello world, this is not a vault at all, not even close to one, nope'.repeat(3)))).toThrowError(
      expect.objectContaining({ code: 'NOT_A_VAULT' }),
    )
  })
})

describe('totp', () => {
  const ascii = (s: string) => new TextEncoder().encode(s)

  it('matches RFC 6238 test vectors', () => {
    const sha1 = ascii('12345678901234567890')
    const sha256 = ascii('12345678901234567890123456789012')
    const sha512 = ascii('1234567890123456789012345678901234567890123456789012345678901234')
    const cases: Array<[number, string, string, string]> = [
      [59, '94287082', '46119246', '90693936'],
      [1111111109, '07081804', '68084774', '25091201'],
      [2000000000, '69279037', '90698825', '38618901'],
      [20000000000, '65353130', '77737706', '47863826'],
    ]
    for (const [time, a, b, c] of cases) {
      const counter = Math.floor(time / 30)
      expect(hotp(sha1, counter, 'SHA1', 8)).toBe(a)
      expect(hotp(sha256, counter, 'SHA256', 8)).toBe(b)
      expect(hotp(sha512, counter, 'SHA512', 8)).toBe(c)
    }
  })

  it('decodes base32 and otpauth links', () => {
    expect(Buffer.from(base32Decode('JBSWY3DPEHPK3PXP')).toString('hex')).toBe('48656c6c6f21deadbeef')
    const config = parseTotp('otpauth://totp/GitHub:simon?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30')
    expect(config.issuer).toBe('GitHub')
    expect(config.account).toBe('simon')
    const code = totp(config, 59_000)
    expect(code.code).toHaveLength(6)
    expect(code.expiresAt).toBe(60_000)
  })
})

describe('generator', () => {
  it('builds character passwords with every requested class and no ambiguous glyphs', () => {
    for (let i = 0; i < 50; i++) {
      const { value, entropyBits } = generateSecret({ ...DEFAULT_GENERATOR, length: 20 })
      expect(value).toHaveLength(20)
      expect(value).toMatch(/[A-Z]/)
      expect(value).toMatch(/[a-z]/)
      expect(value).toMatch(/[0-9]/)
      expect(value).not.toMatch(/[Il1O0o|]/)
      expect(entropyBits).toBeGreaterThan(100)
    }
  })

  it('builds passphrases from the EFF list', () => {
    const { value, entropyBits } = generateSecret({ ...DEFAULT_GENERATOR, mode: 'passphrase', words: 6, separator: '-' })
    expect(value.split('-')).toHaveLength(6)
    expect(entropyBits).toBe(77)
  })
})
