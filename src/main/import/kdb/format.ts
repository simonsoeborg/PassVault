// The KeePass 1.x database format (.kdb), as implemented by KeePass 1 itself and
// by KeePassXC's KeePass1Reader. Nothing here is guessed: the header layout, the
// key transform, the field tables and the packed date arithmetic all follow that
// reader, and the fixtures in tests/fixtures/keepass1 are files KeePass wrote.
//
//   offset  size  field
//   0       4     signature 1 = 0x9AA2D903 (u32 LE, as are all integers here)
//   4       4     signature 2 = 0xB54BFB65
//   8       4     flags: bit 1 SHA2, bit 2 Rijndael/AES, bit 4 ArcFour, bit 8 Twofish
//   12      4     version; only the top three bytes are significant
//   16      16    master seed
//   32      16    encryption IV
//   48      4     group count
//   52      4     entry count
//   56      32    SHA-256 of the decrypted payload
//   88      32    transform seed
//   120     4     transform rounds
//   124     ...   payload, encrypted CBC with PKCS#7 padding
//
// The payload is `group count` group records then `entry count` entry records,
// each a run of (u16 field type, u32 field size, bytes) ending at type 0xFFFF.

import { cbc, unsafe as aes } from '@noble/ciphers/aes.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { ImportError } from '../errors'
import { twofishCbcDecrypt } from './twofish'

export const SIGNATURE_1 = 0x9aa2d903
export const SIGNATURE_2 = 0xb54bfb65
export const HEADER_LEN = 124

const FILE_VERSION = 0x0003_0002
const VERSION_CRITICAL_MASK = 0xffff_ff00
const FLAG_SHA2 = 1
const FLAG_RIJNDAEL = 2
const FLAG_ARCFOUR = 4
const FLAG_TWOFISH = 8

// The key transform runs in the main process, so its cost is a frozen window.
// Measured here at roughly 235 ms per million rounds, this cap bounds a hostile
// file to a few seconds. KeePass 1 shipped 6,000 rounds by default.
const MAX_ROUNDS = 10_000_000
const MAX_RECORDS = 500_000
const MAX_FIELD_BYTES = 64 * 1024 * 1024

export type KdbCipher = 'aes' | 'twofish'

export interface KdbHeader {
  flags: number
  version: number
  cipher: KdbCipher
  masterSeed: Uint8Array
  encryptionIV: Uint8Array
  groupCount: number
  entryCount: number
  contentsHash: Uint8Array
  transformSeed: Uint8Array
  transformRounds: number
}

export interface KdbGroup {
  groupId: number
  name: string
  level: number
  createdAt: number | null
  updatedAt: number | null
}

export interface KdbEntry {
  groupId: number
  icon: number
  title: string
  url: string
  username: string
  password: string
  notes: string
  createdAt: number | null
  updatedAt: number | null
  binaryName: string
  binaryData: Uint8Array | null
}

export function looksLikeKdb(file: Uint8Array): boolean {
  if (file.length < HEADER_LEN) return false
  const view = new DataView(file.buffer, file.byteOffset, HEADER_LEN)
  return view.getUint32(0, true) === SIGNATURE_1 && view.getUint32(4, true) === SIGNATURE_2
}

export function parseHeader(file: Uint8Array): KdbHeader {
  if (file.length < HEADER_LEN + 16) {
    throw new ImportError('NOT_A_DATABASE', 'This file is too short to be a KeePass 1 database.')
  }
  const view = new DataView(file.buffer, file.byteOffset, HEADER_LEN)
  if (view.getUint32(0, true) !== SIGNATURE_1 || view.getUint32(4, true) !== SIGNATURE_2) {
    throw new ImportError('NOT_A_DATABASE', 'This file is not a KeePass 1 database.')
  }
  const flags = view.getUint32(8, true)
  const version = view.getUint32(12, true)
  if ((version & VERSION_CRITICAL_MASK) !== (FILE_VERSION & VERSION_CRITICAL_MASK)) {
    throw new ImportError('UNSUPPORTED', `This KeePass 1 database uses format version ${version.toString(16)}, which PassVault cannot read.`)
  }

  let cipher: KdbCipher
  if (flags & FLAG_RIJNDAEL) cipher = 'aes'
  else if (flags & FLAG_TWOFISH) cipher = 'twofish'
  else if (flags & FLAG_ARCFOUR) {
    throw new ImportError('UNSUPPORTED', 'This database is encrypted with ArcFour, which KeePass itself dropped. Re-save it as AES in KeePass, then import it here.')
  } else {
    throw new ImportError('UNSUPPORTED', 'This database uses an encryption method PassVault does not recognise.')
  }
  if (!(flags & FLAG_SHA2)) {
    throw new ImportError('UNSUPPORTED', 'This database does not use SHA-256 for its key, which every readable KeePass 1 database does.')
  }

  const transformRounds = view.getUint32(120, true)
  if (transformRounds < 1 || transformRounds > MAX_ROUNDS) {
    throw new ImportError('CORRUPT', 'The database header asks for an impossible number of key transformation rounds.')
  }
  const groupCount = view.getUint32(48, true)
  const entryCount = view.getUint32(52, true)
  if (groupCount > MAX_RECORDS || entryCount > MAX_RECORDS) {
    throw new ImportError('CORRUPT', 'The database header claims more groups or entries than PassVault will read.')
  }

  return {
    flags,
    version,
    cipher,
    masterSeed: file.slice(16, 32),
    encryptionIV: file.slice(32, 48),
    groupCount,
    entryCount,
    contentsHash: file.slice(56, 88),
    transformSeed: file.slice(88, 120),
    transformRounds,
  }
}

/** KeePass 1 combines password and key file before any stretching. */
export function compositeKey(passwordBytes: Uint8Array, keyFileKey: Uint8Array | null): Uint8Array {
  if (!keyFileKey) return sha256(passwordBytes)
  if (passwordBytes.length === 0) return keyFileKey
  const combined = new Uint8Array(64)
  combined.set(sha256(passwordBytes), 0)
  combined.set(keyFileKey, 32)
  return sha256(combined)
}

/** 32 raw bytes are the key; 64 hex characters decode to it; anything else is hashed. */
export function keyFileKey(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 32) return bytes.slice()
  if (bytes.length === 64) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    if (/^[0-9a-fA-F]{64}$/.test(text)) {
      const out = new Uint8Array(32)
      for (let i = 0; i < 32; i++) out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16)
      return out
    }
  }
  return sha256(bytes)
}

/**
 * The composite key is encrypted with AES-256-ECB under the transform seed, once
 * per round, then hashed; the master seed is mixed in last.
 */
export function finalKey(composite: Uint8Array, header: KdbHeader): Uint8Array {
  // The two halves are each their own ECB block, encrypted round after round
  // under one expanded key: a fresh cipher object per round would be thousands
  // of key expansions for nothing.
  const expanded = aes.expandKeyLE(header.transformSeed)
  let left = composite.slice(0, 16)
  let right = composite.slice(16, 32)
  for (let round = 0; round < header.transformRounds; round++) {
    left = aes.encryptBlock(expanded, left)
    right = aes.encryptBlock(expanded, right)
  }
  const data = new Uint8Array(32)
  data.set(left, 0)
  data.set(right, 16)
  const transformed = sha256(data)
  const combined = new Uint8Array(header.masterSeed.length + transformed.length)
  combined.set(header.masterSeed, 0)
  combined.set(transformed, header.masterSeed.length)
  return sha256(combined)
}

/** Returns the decrypted payload, or null when this key does not open the file. */
export function decryptPayload(file: Uint8Array, header: KdbHeader, key: Uint8Array): Uint8Array | null {
  const body = file.subarray(HEADER_LEN)
  if (body.length === 0 || body.length % 16 !== 0) {
    throw new ImportError('CORRUPT', 'The encrypted part of this database is truncated.')
  }
  let plaintext: Uint8Array
  try {
    plaintext =
      header.cipher === 'twofish'
        ? twofishCbcDecrypt(key, header.encryptionIV, body)
        : cbc(key, header.encryptionIV).decrypt(body)
  } catch {
    // A wrong key usually shows up here first, as padding that decodes to nonsense.
    return null
  }
  const hash = sha256(plaintext)
  for (let i = 0; i < 32; i++) {
    if (hash[i] !== header.contentsHash[i]) return null
  }
  return plaintext
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

const utf8 = new TextDecoder('utf-8', { fatal: false })

class Cursor {
  offset = 0
  constructor(readonly data: Uint8Array) {}

  get view(): DataView {
    return new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength)
  }

  field(): { type: number; bytes: Uint8Array } {
    if (this.offset + 6 > this.data.length) {
      throw new ImportError('CORRUPT', 'The database ended in the middle of a record.')
    }
    const type = this.view.getUint16(this.offset, true)
    const size = this.view.getUint32(this.offset + 2, true)
    this.offset += 6
    if (size > MAX_FIELD_BYTES || this.offset + size > this.data.length) {
      throw new ImportError('CORRUPT', 'A field in this database runs past the end of the file.')
    }
    const bytes = this.data.subarray(this.offset, this.offset + size)
    this.offset += size
    return { type, bytes }
  }
}

/** KeePass 1 strings are UTF-8 and NUL-terminated, with the NUL counted in the field size. */
function str(bytes: Uint8Array): string {
  const end = bytes.indexOf(0)
  return utf8.decode(end === -1 ? bytes : bytes.subarray(0, end))
}

function u32(bytes: Uint8Array): number {
  if (bytes.length !== 4) throw new ImportError('CORRUPT', 'A numeric field in this database has the wrong size.')
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
}

/**
 * Five bytes hold year, month, day, hour, minute and second packed end to end.
 * KeePass writes 2999-12-28 23:59:59 to mean "no date", which becomes null.
 */
export function dateFromPacked(bytes: Uint8Array): number | null {
  if (bytes.length !== 5) return null
  const [b1, b2, b3, b4, b5] = bytes
  const year = (b1 << 6) | (b2 >> 2)
  const month = ((b2 & 0x03) << 2) | (b3 >> 6)
  const day = (b3 >> 1) & 0x1f
  const hour = ((b3 & 0x01) << 4) | (b4 >> 4)
  const minute = ((b4 & 0x0f) << 2) | (b5 >> 6)
  const second = b5 & 0x3f
  if (year === 2999 && month === 12 && day === 28 && hour === 23 && minute === 59 && second === 59) return null
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null
  const time = Date.UTC(year, month - 1, day, hour, minute, second)
  return Number.isFinite(time) ? time : null
}

export function parsePayload(plaintext: Uint8Array, header: KdbHeader): { groups: KdbGroup[]; entries: KdbEntry[] } {
  const cursor = new Cursor(plaintext)
  const groups: KdbGroup[] = []
  const entries: KdbEntry[] = []

  for (let i = 0; i < header.groupCount; i++) {
    const group: KdbGroup = { groupId: 0, name: '', level: 0, createdAt: null, updatedAt: null }
    for (;;) {
      const { type, bytes } = cursor.field()
      if (type === 0xffff) break
      switch (type) {
        case 0x0001:
          group.groupId = u32(bytes)
          break
        case 0x0002:
          group.name = str(bytes)
          break
        case 0x0003:
          group.createdAt = dateFromPacked(bytes)
          break
        case 0x0004:
          group.updatedAt = dateFromPacked(bytes)
          break
        case 0x0008:
          if (bytes.length !== 2) throw new ImportError('CORRUPT', 'A group level field has the wrong size.')
          group.level = new DataView(bytes.buffer, bytes.byteOffset, 2).getUint16(0, true)
          break
        default:
          break // 0x0000 padding, 0x0005/0x0006 access and expiry times, 0x0007 icon, 0x0009 flags
      }
    }
    groups.push(group)
  }

  for (let i = 0; i < header.entryCount; i++) {
    const entry: KdbEntry = {
      groupId: 0,
      icon: 0,
      title: '',
      url: '',
      username: '',
      password: '',
      notes: '',
      createdAt: null,
      updatedAt: null,
      binaryName: '',
      binaryData: null,
    }
    for (;;) {
      const { type, bytes } = cursor.field()
      if (type === 0xffff) break
      switch (type) {
        case 0x0002:
          entry.groupId = u32(bytes)
          break
        case 0x0003:
          entry.icon = u32(bytes)
          break
        case 0x0004:
          entry.title = str(bytes)
          break
        case 0x0005:
          entry.url = str(bytes)
          break
        case 0x0006:
          entry.username = str(bytes)
          break
        case 0x0007:
          entry.password = str(bytes)
          break
        case 0x0008:
          entry.notes = str(bytes)
          break
        case 0x0009:
          entry.createdAt = dateFromPacked(bytes)
          break
        case 0x000a:
          entry.updatedAt = dateFromPacked(bytes)
          break
        case 0x000d:
          entry.binaryName = str(bytes)
          break
        case 0x000e:
          if (bytes.length > 0) entry.binaryData = bytes.slice()
          break
        default:
          break // 0x0001 uuid, 0x000b access time, 0x000c expiry
      }
    }
    entries.push(entry)
  }

  return { groups, entries }
}

/**
 * KeePass 1 stores groups as a flat list with a depth level; a group's parent is
 * the nearest earlier group exactly one level shallower.
 */
export function parentOf(groups: KdbGroup[], index: number): number | null {
  const level = groups[index].level
  if (level === 0) return null
  for (let j = index - 1; j >= 0; j--) {
    if (groups[j].level < level) return groups[j].level === level - 1 ? j : null
  }
  return null
}

/**
 * KeePass 1 hashed the master password in the Windows code page, so a database
 * made on Windows with a non-ASCII password needs that encoding, not UTF-8.
 */
export function passwordEncodings(password: string): Uint8Array[] {
  const seen = new Set<string>()
  const out: Uint8Array[] = []
  const add = (bytes: Uint8Array) => {
    const key = bytes.join(',')
    if (seen.has(key)) return
    seen.add(key)
    out.push(bytes)
  }
  add(windows1252(password))
  add(latin1(password))
  add(new TextEncoder().encode(password))
  return out
}

// The 0x80–0x9F range is all that separates Windows-1252 from Latin-1.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
]

function windows1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const high = CP1252_HIGH.indexOf(code)
    out[i] = high !== -1 ? 0x80 + high : code <= 0xff ? code : 0x3f
  }
  return out
}

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    out[i] = code <= 0xff ? code : 0x3f
  }
  return out
}
