import { randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto'
import { argon2id } from 'hash-wasm'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { KdfPreset } from '../../shared/types'

export const KEY_LEN = 32
export const SALT_LEN = 32
export const NONCE_LEN = 24
export const TAG_LEN = 16

export interface KdfParams {
  memoryKiB: number
  iterations: number
  parallelism: number
  salt: Uint8Array
}

/** Hard bounds applied to parameters read from a file, so a hostile header cannot exhaust memory. */
export const KDF_BOUNDS = {
  memoryKiB: { min: 19_456, max: 4_194_304 },
  iterations: { min: 1, max: 64 },
  parallelism: { min: 1, max: 16 },
} as const

export const KDF_PRESETS: Record<KdfPreset, Omit<KdfParams, 'salt'>> = {
  standard: { memoryKiB: 131_072, iterations: 3, parallelism: 1 },
  strong: { memoryKiB: 524_288, iterations: 4, parallelism: 1 },
}

const DOMAIN = new TextEncoder().encode('PassVault/v1')
const INFO_FILE = new TextEncoder().encode('file-encryption')
const INFO_HEADER = new TextEncoder().encode('header-authentication')

export function randomBytes(length: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(length))
}

export function wipe(...buffers: Array<Uint8Array | null | undefined>): void {
  for (const buffer of buffers) buffer?.fill(0)
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function kdfWithinBounds(params: Omit<KdfParams, 'salt'>): boolean {
  const { memoryKiB, iterations, parallelism } = params
  return (
    Number.isInteger(memoryKiB) &&
    Number.isInteger(iterations) &&
    Number.isInteger(parallelism) &&
    memoryKiB >= KDF_BOUNDS.memoryKiB.min &&
    memoryKiB <= KDF_BOUNDS.memoryKiB.max &&
    iterations >= KDF_BOUNDS.iterations.min &&
    iterations <= KDF_BOUNDS.iterations.max &&
    parallelism >= KDF_BOUNDS.parallelism.min &&
    parallelism <= KDF_BOUNDS.parallelism.max &&
    memoryKiB >= 8 * parallelism
  )
}

/**
 * Stretches the master password into the 32-byte root key with Argon2id.
 * The password is NFC-normalized so the same passphrase typed on macOS, Windows
 * and Linux keyboards derives the same key.
 */
export async function deriveRootKey(password: string, params: KdfParams): Promise<Uint8Array> {
  if (!kdfWithinBounds(params)) throw new RangeError('Key derivation parameters are out of bounds')
  if (params.salt.length !== SALT_LEN) throw new RangeError('Salt must be 32 bytes')
  const passwordBytes = new TextEncoder().encode(password.normalize('NFC'))
  try {
    const out = await argon2id({
      password: passwordBytes,
      salt: params.salt,
      memorySize: params.memoryKiB,
      iterations: params.iterations,
      parallelism: params.parallelism,
      hashLength: KEY_LEN,
      outputType: 'binary',
    })
    return new Uint8Array(out)
  } finally {
    wipe(passwordBytes)
  }
}

export interface SubKeys {
  fileKey: Uint8Array
  headerKey: Uint8Array
}

/** Splits the root key into independent keys for body encryption and header authentication. */
export function deriveSubKeys(rootKey: Uint8Array): SubKeys {
  if (rootKey.length !== KEY_LEN) throw new RangeError('Root key must be 32 bytes')
  return {
    fileKey: hkdf(sha256, rootKey, DOMAIN, INFO_FILE, KEY_LEN),
    headerKey: hkdf(sha256, rootKey, DOMAIN, INFO_HEADER, KEY_LEN),
  }
}

export function wipeSubKeys(keys: SubKeys | null | undefined): void {
  if (!keys) return
  wipe(keys.fileKey, keys.headerKey)
}

export function mac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data)
}

export function aeadEncrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).encrypt(plaintext)
}

/** Throws when the ciphertext or its associated data was modified. */
export function aeadDecrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext)
}

export function sha256Hex(data: Uint8Array): string {
  return Buffer.from(sha256(data)).toString('hex')
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
