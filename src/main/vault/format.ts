// PassVault file format, version 1.
//
//   offset  size  field
//   0       4     magic "PVLT"
//   4       2     format version (u16 LE) = 1
//   6       16    vault id
//   22      1     kdf id: 1 = Argon2id v1.3
//   23      4     memory in KiB (u32 LE)
//   27      4     iterations (u32 LE)
//   31      1     parallelism
//   32      32    salt
//   64      1     cipher id: 1 = XChaCha20-Poly1305
//   65      24    nonce (fresh on every save)
//   89      32    HMAC-SHA256(headerKey, bytes 0..89)
//   121     n+16  XChaCha20-Poly1305 ciphertext and tag, associated data = bytes 0..121
//
// Plaintext: u32 LE json length, UTF-8 JSON, zero padding to a 4 KiB boundary
// so the file size reveals only a coarse bucket of the vault's contents.

import {
  NONCE_LEN,
  SALT_LEN,
  TAG_LEN,
  aeadDecrypt,
  aeadEncrypt,
  concatBytes,
  constantTimeEqual,
  deriveSubKeys,
  kdfWithinBounds,
  mac,
  randomBytes,
  wipe,
  wipeSubKeys,
  type KdfParams,
  type SubKeys,
} from './crypto'
import { validateVaultData } from './validate'
import type { VaultData } from '../../shared/types'

export const MAGIC = new Uint8Array([0x50, 0x56, 0x4c, 0x54])
export const FORMAT_VERSION = 1
export const HEADER_LEN = 89
export const MAC_LEN = 32
export const PREAMBLE_LEN = HEADER_LEN + MAC_LEN
export const PAD_BLOCK = 4096
export const MAX_FILE_BYTES = 256 * 1024 * 1024

const KDF_ARGON2ID = 1
const CIPHER_XCHACHA20_POLY1305 = 1

export interface VaultHeader {
  version: number
  vaultId: Uint8Array
  kdf: KdfParams
  nonce: Uint8Array
}

export class VaultFormatError extends Error {
  constructor(
    readonly code: 'NOT_A_VAULT' | 'UNSUPPORTED' | 'WRONG_PASSWORD' | 'CORRUPT',
    message: string,
  ) {
    super(message)
    this.name = 'VaultFormatError'
  }
}

export function encodeHeader(header: VaultHeader): Uint8Array {
  const out = new Uint8Array(HEADER_LEN)
  const view = new DataView(out.buffer)
  out.set(MAGIC, 0)
  view.setUint16(4, header.version, true)
  out.set(header.vaultId, 6)
  out[22] = KDF_ARGON2ID
  view.setUint32(23, header.kdf.memoryKiB, true)
  view.setUint32(27, header.kdf.iterations, true)
  out[31] = header.kdf.parallelism
  out.set(header.kdf.salt, 32)
  out[64] = CIPHER_XCHACHA20_POLY1305
  out.set(header.nonce, 65)
  return out
}

export function parseHeader(file: Uint8Array): VaultHeader {
  if (file.length < PREAMBLE_LEN + TAG_LEN) throw new VaultFormatError('NOT_A_VAULT', 'This file is too short to be a PassVault vault.')
  for (let i = 0; i < MAGIC.length; i++) {
    if (file[i] !== MAGIC[i]) throw new VaultFormatError('NOT_A_VAULT', 'This file is not a PassVault vault.')
  }
  const view = new DataView(file.buffer, file.byteOffset, HEADER_LEN)
  const version = view.getUint16(4, true)
  if (version !== FORMAT_VERSION) {
    throw new VaultFormatError('UNSUPPORTED', `This vault uses format version ${version}. Update PassVault to open it.`)
  }
  if (file[22] !== KDF_ARGON2ID) throw new VaultFormatError('UNSUPPORTED', 'Unknown key derivation function.')
  if (file[64] !== CIPHER_XCHACHA20_POLY1305) throw new VaultFormatError('UNSUPPORTED', 'Unknown cipher.')
  const kdf: KdfParams = {
    memoryKiB: view.getUint32(23, true),
    iterations: view.getUint32(27, true),
    parallelism: file[31],
    salt: file.slice(32, 32 + SALT_LEN),
  }
  if (!kdfWithinBounds(kdf)) throw new VaultFormatError('CORRUPT', 'The vault header has invalid key derivation settings.')
  return {
    version,
    vaultId: file.slice(6, 22),
    kdf,
    nonce: file.slice(65, 65 + NONCE_LEN),
  }
}

export function encodePlaintext(data: VaultData): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(data))
  const total = Math.ceil((json.length + 4) / PAD_BLOCK) * PAD_BLOCK
  const out = new Uint8Array(total)
  new DataView(out.buffer).setUint32(0, json.length, true)
  out.set(json, 4)
  wipe(json)
  return out
}

export function decodePlaintext(plaintext: Uint8Array): VaultData {
  if (plaintext.length < 4) throw new VaultFormatError('CORRUPT', 'The vault contents are truncated.')
  const length = new DataView(plaintext.buffer, plaintext.byteOffset, 4).getUint32(0, true)
  if (length > plaintext.length - 4) throw new VaultFormatError('CORRUPT', 'The vault contents are truncated.')
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext.subarray(4, 4 + length)))
  } catch {
    throw new VaultFormatError('CORRUPT', 'The vault contents could not be read.')
  }
  const result = validateVaultData(parsed)
  if (!result.ok) throw new VaultFormatError('CORRUPT', `The vault contents are invalid: ${result.error}`)
  return result.value
}

export interface SealInput {
  data: VaultData
  vaultId: Uint8Array
  kdf: KdfParams
  keys: SubKeys
}

export function sealVault({ data, vaultId, kdf, keys }: SealInput): Uint8Array {
  const header = encodeHeader({ version: FORMAT_VERSION, vaultId, kdf, nonce: randomBytes(NONCE_LEN) })
  const headerMac = mac(keys.headerKey, header)
  const aad = concatBytes(header, headerMac)
  const plaintext = encodePlaintext(data)
  try {
    const nonce = header.subarray(65, 65 + NONCE_LEN)
    return concatBytes(aad, aeadEncrypt(keys.fileKey, nonce, plaintext, aad))
  } finally {
    wipe(plaintext)
  }
}

export interface OpenedVault {
  header: VaultHeader
  data: VaultData
}

/**
 * Opens a vault with an already-derived root key. The header MAC is checked first,
 * so a wrong password is reported separately from a damaged body.
 */
export function openVault(file: Uint8Array, rootKey: Uint8Array): OpenedVault {
  if (file.length > MAX_FILE_BYTES) throw new VaultFormatError('CORRUPT', 'The vault file is unreasonably large.')
  const header = parseHeader(file)
  const keys = deriveSubKeys(rootKey)
  try {
    const expected = mac(keys.headerKey, file.subarray(0, HEADER_LEN))
    if (!constantTimeEqual(expected, file.subarray(HEADER_LEN, PREAMBLE_LEN))) {
      throw new VaultFormatError('WRONG_PASSWORD', 'That password does not open this vault.')
    }
    let plaintext: Uint8Array
    try {
      plaintext = aeadDecrypt(keys.fileKey, header.nonce, file.subarray(PREAMBLE_LEN), file.subarray(0, PREAMBLE_LEN))
    } catch {
      throw new VaultFormatError('CORRUPT', 'The password is right, but the vault contents are damaged. Restore the file from a backup or an older synced version.')
    }
    try {
      return { header, data: decodePlaintext(plaintext) }
    } finally {
      wipe(plaintext)
    }
  } finally {
    wipeSubKeys(keys)
  }
}

/** Identifies which key derivation a file needs, so a cached key can be checked against a changed file. */
export function kdfFingerprint(kdf: KdfParams): string {
  return `${kdf.memoryKiB}:${kdf.iterations}:${kdf.parallelism}:${Buffer.from(kdf.salt).toString('hex')}`
}

export function vaultIdHex(vaultId: Uint8Array): string {
  return Buffer.from(vaultId).toString('hex')
}
