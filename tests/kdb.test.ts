import { createCipheriv, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectFormat, importDatabase } from '../src/main/import'
import { dateFromPacked, parseHeader } from '../src/main/import/kdb/format'
import { twofishDecryptBlock, twofishEncryptBlock, twofishKey } from '../src/main/import/kdb/twofish'

const DIR = join(__dirname, 'fixtures', 'keepass1')
const read = (name: string) => new Uint8Array(readFileSync(join(DIR, name)))
const hex = (value: string) => Uint8Array.from(value.match(/../g)!.map((b) => Number.parseInt(b, 16)))
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex').toUpperCase()

let counter = 0
const newId = () => `id${++counter}`
const open = (file: string, password: string, keyFile?: string) =>
  importDatabase({
    file: read(file),
    password,
    keyFile: keyFile ? read(keyFile) : undefined,
    rootFolderId: 'root',
    now: 1_700_000_000_000,
    newId,
  })

// Published vectors, extracted from Botan's twofish.vec (303 with 256-bit keys).
const VECTORS: Array<{ key: string; in: string; out: string }> = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'twofish-256.json'), 'utf8'),
)

describe('twofish', () => {
  it('matches every published 256-bit test vector', () => {
    expect(VECTORS.length).toBeGreaterThan(300)
    for (const vector of VECTORS) {
      const schedule = twofishKey(hex(vector.key))
      expect(toHex(twofishEncryptBlock(schedule, hex(vector.in)))).toBe(vector.out)
      expect(toHex(twofishDecryptBlock(schedule, hex(vector.out)))).toBe(vector.in)
    }
  })
})

describe('keepass 1 header', () => {
  it('reads the header of a real database', () => {
    const header = parseHeader(read('basic.kdb'))
    expect(header.cipher).toBe('aes')
    expect(header.masterSeed).toHaveLength(16)
    expect(header.encryptionIV).toHaveLength(16)
    expect(header.contentsHash).toHaveLength(32)
    expect(header.transformSeed).toHaveLength(32)
    expect(header.transformRounds).toBeGreaterThan(0)
    expect(header.groupCount).toBeGreaterThan(0)
  })

  it('sees Twofish in the file that uses it', () => {
    expect(parseHeader(read('Twofish.kdb')).cipher).toBe('twofish')
  })

  it('tells .kdb and .kdbx apart by their bytes', () => {
    expect(detectFormat(read('basic.kdb'))).toBe('kdb')
    expect(detectFormat(new Uint8Array([0x03, 0xd9, 0xa2, 0x9a, 0x67, 0xfb, 0x4b, 0xb5, 0, 0, 0, 0]))).toBe('kdbx')
    expect(detectFormat(new TextEncoder().encode('not a database at all'))).toBe(null)
  })

  it('unpacks the packed five-byte date', () => {
    // 2012-03-04 05:06:07, packed the way KeePass 1 writes it.
    const y = 2012
    const packed = Uint8Array.from([
      y >> 6,
      ((y & 0x3f) << 2) | (3 >> 2),
      ((3 & 0x03) << 6) | (4 << 1) | (5 >> 4),
      ((5 & 0x0f) << 4) | (6 >> 2),
      ((6 & 0x03) << 6) | 7,
    ])
    expect(dateFromPacked(packed)).toBe(Date.UTC(2012, 2, 4, 5, 6, 7))
    // KeePass writes this exact moment to mean "no date".
    const never = Uint8Array.from([2999 >> 6, ((2999 & 0x3f) << 2) | (12 >> 2), ((12 & 3) << 6) | (28 << 1) | 1, (15 << 4) | (59 >> 2), ((59 & 3) << 6) | 59])
    expect(dateFromPacked(never)).toBe(null)
  })
})

describe('keepass 1 import', () => {
  it('opens a database KeePass itself wrote', async () => {
    const result = await open('basic.kdb', 'masterpw')
    expect(result.format).toBe('kdb')
    expect(result.folders.map((folder) => folder.name)).toEqual(['Internet', 'Subgroup 1', 'Unexpanded', 'abc', 'Subgroup 2', 'eMail'])
    // Seven records in the file: two are KeePass's own bookkeeping and one is blank.
    expect(result.report.entries).toBe(4)
    expect(result.report.skipped).toBe(1)
    expect(result.entries.map((entry) => entry.title)).toContain('Test entry')
  })

  it('rebuilds the nesting the level fields describe', async () => {
    const result = await open('basic.kdb', 'masterpw')
    const byName = new Map(result.folders.map((folder) => [folder.name, folder]))
    const parentNameOf = (name: string) => {
      const parentId = byName.get(name)!.parentId
      return parentId === 'root' ? 'root' : result.folders.find((folder) => folder.id === parentId)!.name
    }
    expect(parentNameOf('Internet')).toBe('root')
    expect(parentNameOf('Subgroup 1')).toBe('Internet')
    expect(parentNameOf('Unexpanded')).toBe('Subgroup 1')
    expect(parentNameOf('abc')).toBe('Unexpanded')
    expect(parentNameOf('Subgroup 2')).toBe('Internet')
    expect(parentNameOf('eMail')).toBe('root')
  })

  it('carries every value of an entry across', async () => {
    const result = await open('basic.kdb', 'masterpw')
    const entry = result.entries.find((candidate) => candidate.title === 'Test entry')!
    expect(entry.type).toBe('login')
    expect(entry.fields.username).toBe('I')
    expect(entry.fields.url).toBe('http://example.com/')
    expect(entry.fields.password).toHaveLength(14)
    expect(entry.notes).toContain('Lorem ipsum')
    expect(entry.folderId).toBe(result.folders.find((folder) => folder.name === 'Internet')!.id)
    expect(entry.createdAt).toBeGreaterThan(Date.UTC(2000, 0, 1))
    // attachment.txt is not a private key, so it stays behind and is counted.
    expect(result.report.attachmentsSkipped).toBe(1)
  })

  it('drops KeePass’s own bookkeeping entries without counting them as skipped', async () => {
    const result = await open('Twofish.kdb', 'masterpw')
    expect(result.entries).toHaveLength(0)
    expect(result.report.skipped).toBe(0)
  })

  it('decrypts a Twofish database', async () => {
    // The fixture holds one group and no user entries; decrypting it at all is the test.
    const result = await open('Twofish.kdb', 'masterpw')
    expect(result.format).toBe('kdb')
    expect(result.folders.map((folder) => folder.name)).toEqual(['Twofish'])
  })

  it('accepts all three key file shapes', async () => {
    // 32 raw bytes, 64 hex characters, and a file of any other length that gets hashed.
    for (const [database, keyFile] of [
      ['FileKeyBinary.kdb', 'FileKeyBinary.key'],
      ['FileKeyHex.kdb', 'FileKeyHex.key'],
      ['FileKeyHashed.kdb', 'FileKeyHashed.key'],
    ] as const) {
      const result = await open(database, '', keyFile)
      expect(result.folders.length, database).toBeGreaterThan(0)
    }
  })

  it('refuses the right key file against the wrong database', async () => {
    await expect(open('FileKeyBinary.kdb', '', 'FileKeyHex.key')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('accepts a password and a key file together', async () => {
    const result = await open('CompositeKey.kdb', 'mypassword', 'FileKeyHex.key')
    expect(result.folders.length).toBeGreaterThan(0)
    // Either half alone must not open it.
    await expect(open('CompositeKey.kdb', 'mypassword')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
    await expect(open('CompositeKey.kdb', '', 'FileKeyHex.key')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('opens a database whose password was typed on a Windows code page', async () => {
    // KeePass 1 hashed this password as Windows-1252, not UTF-8. Reading the group
    // name back proves the right bytes were hashed, not merely that nothing threw.
    const result = await open('CP-1252.kdb', '„password”')
    expect(result.folders.map((folder) => folder.name)).toEqual(['CP-1252'])
  })

  it('refuses a wrong password', async () => {
    await expect(open('basic.kdb', 'not the password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('refuses a damaged file, which this format cannot tell from a wrong password', async () => {
    const file = read('basic.kdb')
    file[200] ^= 0x01
    await expect(
      importDatabase({ file, password: 'masterpw', rootFolderId: 'root', now: 1, newId }),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('refuses a file that is not a database', async () => {
    await expect(
      importDatabase({ file: new TextEncoder().encode('hello'.repeat(50)), password: 'x', rootFolderId: 'root', now: 1, newId }),
    ).rejects.toMatchObject({ code: 'NOT_A_DATABASE' })
  })
})

// ---------------------------------------------------------------------------
// A .kdb writer, for edge cases no fixture covers. It uses node:crypto rather
// than the reader's own @noble path, so a round trip also cross-checks the
// cipher and key derivation against a second implementation.
// ---------------------------------------------------------------------------

interface BuiltGroup {
  id: number
  name: string
  level: number
}

interface BuiltEntry {
  groupId: number
  title?: string
  username?: string
  url?: string
  password?: string
  notes?: string
  icon?: number
  binaryName?: string
  binaryData?: Uint8Array
}

function field(type: number, bytes: Uint8Array): Buffer {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(type, 0)
  head.writeUInt32LE(bytes.length, 2)
  return Buffer.concat([head, Buffer.from(bytes)])
}

const textField = (type: number, value: string) => field(type, Buffer.concat([Buffer.from(value, 'utf8'), Buffer.from([0])]))
const u32Field = (type: number, value: number) => {
  const bytes = Buffer.alloc(4)
  bytes.writeUInt32LE(value >>> 0, 0)
  return field(type, bytes)
}
const END = field(0xffff, new Uint8Array(0))

function buildKdb(options: { groups: BuiltGroup[]; entries: BuiltEntry[]; password: string; rounds?: number }): Uint8Array {
  const rounds = options.rounds ?? 600
  const payload = Buffer.concat([
    ...options.groups.map((group) => {
      const level = Buffer.alloc(2)
      level.writeUInt16LE(group.level, 0)
      return Buffer.concat([u32Field(0x0001, group.id), textField(0x0002, group.name), field(0x0008, level), END])
    }),
    ...options.entries.map((entry) =>
      Buffer.concat([
        u32Field(0x0002, entry.groupId),
        u32Field(0x0003, entry.icon ?? 0),
        textField(0x0004, entry.title ?? ''),
        textField(0x0005, entry.url ?? ''),
        textField(0x0006, entry.username ?? ''),
        textField(0x0007, entry.password ?? ''),
        textField(0x0008, entry.notes ?? ''),
        ...(entry.binaryName === undefined ? [] : [textField(0x000d, entry.binaryName)]),
        ...(entry.binaryData === undefined ? [] : [field(0x000e, entry.binaryData)]),
        END,
      ]),
    ),
  ])

  const masterSeed = Buffer.alloc(16, 0x11)
  const transformSeed = Buffer.alloc(32, 0x22)
  const iv = Buffer.alloc(16, 0x33)

  let left = createHash('sha256').update(Buffer.from(options.password, 'utf8')).digest().subarray(0, 16)
  let right = createHash('sha256').update(Buffer.from(options.password, 'utf8')).digest().subarray(16, 32)
  for (let i = 0; i < rounds; i++) {
    for (const half of [0, 1]) {
      const cipher = createCipheriv('aes-256-ecb', transformSeed, null)
      cipher.setAutoPadding(false)
      const source = half === 0 ? left : right
      const encrypted = Buffer.concat([cipher.update(source), cipher.final()])
      if (half === 0) left = encrypted
      else right = encrypted
    }
  }
  const transformed = createHash('sha256').update(Buffer.concat([left, right])).digest()
  const key = createHash('sha256').update(Buffer.concat([masterSeed, transformed])).digest()

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const body = Buffer.concat([cipher.update(payload), cipher.final()])

  const header = Buffer.alloc(124)
  header.writeUInt32LE(0x9aa2d903, 0)
  header.writeUInt32LE(0xb54bfb65, 4)
  header.writeUInt32LE(1 | 2, 8) // SHA2 + Rijndael
  header.writeUInt32LE(0x00030002, 12)
  masterSeed.copy(header, 16)
  iv.copy(header, 32)
  header.writeUInt32LE(options.groups.length, 48)
  header.writeUInt32LE(options.entries.length, 52)
  createHash('sha256').update(payload).digest().copy(header, 56)
  transformSeed.copy(header, 88)
  header.writeUInt32LE(rounds, 120)

  return new Uint8Array(Buffer.concat([header, body]))
}

const importBuilt = (options: Parameters<typeof buildKdb>[0]) =>
  importDatabase({ file: buildKdb(options), password: options.password, rootFolderId: 'root', now: 1_700_000_000_000, newId })

describe('keepass 1 edge cases', () => {
  it('round-trips a database built with a second implementation', async () => {
    const result = await importBuilt({
      password: 'built',
      groups: [{ id: 7, name: 'Servers', level: 0 }],
      entries: [{ groupId: 7, title: 'box', username: 'root', password: 'hunter2', url: 'https://example.net' }],
    })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].fields.password).toBe('hunter2')
    expect(result.folders.map((folder) => folder.name)).toEqual(['Servers'])
  })

  it('puts an entry whose group is missing at the top rather than losing it', async () => {
    const result = await importBuilt({
      password: 'built',
      groups: [{ id: 7, name: 'Servers', level: 0 }],
      entries: [{ groupId: 999, title: 'orphan', password: 'x' }],
    })
    expect(result.entries[0].title).toBe('orphan')
    expect(result.entries[0].folderId).toBe('root')
  })

  it('keeps a group whose level jumps by more than one', async () => {
    // KeePassXC rejects the whole file here; an importer should salvage instead.
    const result = await importBuilt({
      password: 'built',
      groups: [
        { id: 1, name: 'Top', level: 0 },
        { id: 2, name: 'Jumped', level: 3 },
      ],
      entries: [],
    })
    expect(result.folders.map((folder) => folder.name)).toEqual(['Top', 'Jumped'])
    expect(result.folders[1].parentId).toBe('root')
  })

  it('imports an entry titled Meta-Info when it is not actually bookkeeping', async () => {
    const result = await importBuilt({
      password: 'built',
      groups: [{ id: 1, name: 'G', level: 0 }],
      entries: [
        // Real bookkeeping: dropped.
        { groupId: 1, title: 'Meta-Info', username: 'SYSTEM', url: '$', notes: 'KPX_GROUP_TREE_STATE', binaryName: 'bin-stream', binaryData: Uint8Array.from([1, 2]) },
        // Someone's own entry that happens to share the title: kept.
        { groupId: 1, title: 'Meta-Info', username: 'simon', password: 'secret' },
        // Bookkeeping shape but a custom icon, which KeePass never writes: kept.
        { groupId: 1, title: 'Meta-Info', username: 'SYSTEM', url: '$', notes: 'x', binaryName: 'bin-stream', binaryData: Uint8Array.from([3]), icon: 5 },
      ],
    })
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].fields.password).toBe('secret')
  })

  it('refuses a key transform that would freeze the app', async () => {
    const file = buildKdb({ password: 'built', groups: [{ id: 1, name: 'G', level: 0 }], entries: [], rounds: 600 })
    new DataView(file.buffer).setUint32(120, 20_000_000, true)
    await expect(importDatabase({ file, password: 'built', rootFolderId: 'root', now: 1, newId })).rejects.toMatchObject({ code: 'CORRUPT' })
  })

  it('turns every malformed file into a clean error, never a crash', async () => {
    const cases: Array<[string, (file: Uint8Array) => Uint8Array, string]> = [
      ['truncated mid-payload', (file) => file.slice(0, 300), 'WRONG_PASSWORD'],
      ['header only', (file) => file.slice(0, 124), 'NOT_A_DATABASE'],
      ['payload not whole blocks', (file) => file.slice(0, file.length - 3), 'CORRUPT'],
      ['absurd group count', (file) => (new DataView(file.buffer).setUint32(48, 4_000_000_000, true), file), 'CORRUPT'],
      ['inflated entry count', (file) => (new DataView(file.buffer).setUint32(52, 9999, true), file), 'CORRUPT'],
      ['zero rounds', (file) => (new DataView(file.buffer).setUint32(120, 0, true), file), 'CORRUPT'],
      ['no cipher flag', (file) => (new DataView(file.buffer).setUint32(8, 0, true), file), 'UNSUPPORTED'],
      ['arcfour', (file) => (new DataView(file.buffer).setUint32(8, 1 | 4, true), file), 'UNSUPPORTED'],
      ['a later format version', (file) => (new DataView(file.buffer).setUint32(12, 0x00040002, true), file), 'UNSUPPORTED'],
    ]
    for (const [name, mutate, code] of cases) {
      const file = mutate(read('basic.kdb'))
      await expect(
        importDatabase({ file, password: 'masterpw', rootFolderId: 'root', now: 1, newId }),
        name,
      ).rejects.toMatchObject({ code, name: 'ImportError' })
    }
  })
})
