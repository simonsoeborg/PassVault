// RFC 4226 (HOTP) and RFC 6238 (TOTP).

import { hmac } from '@noble/hashes/hmac.js'
import { sha1 } from '@noble/hashes/legacy.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import type { TotpCode } from '../shared/types'

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TotpConfig {
  secret: Uint8Array
  algorithm: TotpAlgorithm
  digits: number
  period: number
  issuer?: string
  account?: string
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('Not a valid base32 secret')
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const char of clean) {
    buffer = (buffer << 5) | BASE32.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

export function parseTotp(input: string): TotpConfig {
  const value = input.trim()
  if (!value) throw new Error('Empty TOTP secret')
  if (/^otpauth:\/\//i.test(value)) {
    const url = new URL(value)
    if (url.hostname.toLowerCase() !== 'totp') throw new Error('Only time-based (TOTP) codes are supported')
    const secret = url.searchParams.get('secret')
    if (!secret) throw new Error('The otpauth link has no secret')
    const algorithm = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase()
    if (algorithm !== 'SHA1' && algorithm !== 'SHA256' && algorithm !== 'SHA512') throw new Error('Unsupported TOTP algorithm')
    const digits = Number(url.searchParams.get('digits') ?? 6)
    const period = Number(url.searchParams.get('period') ?? 30)
    if (!Number.isInteger(digits) || digits < 6 || digits > 8) throw new Error('TOTP digits must be 6, 7 or 8')
    if (!Number.isInteger(period) || period < 10 || period > 300) throw new Error('TOTP period must be between 10 and 300 seconds')
    const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const [issuerFromLabel, account] = label.includes(':') ? label.split(':', 2) : [undefined, label]
    return {
      secret: base32Decode(secret),
      algorithm,
      digits,
      period,
      issuer: url.searchParams.get('issuer') ?? issuerFromLabel,
      account: account || undefined,
    }
  }
  return { secret: base32Decode(value), algorithm: 'SHA1', digits: 6, period: 30 }
}

function hashFor(algorithm: TotpAlgorithm) {
  return algorithm === 'SHA256' ? sha256 : algorithm === 'SHA512' ? sha512 : sha1
}

export function hotp(secret: Uint8Array, counter: number, algorithm: TotpAlgorithm = 'SHA1', digits = 6): string {
  const message = new Uint8Array(8)
  const view = new DataView(message.buffer)
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)
  const digest = hmac(hashFor(algorithm), secret, message)
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, '0')
}

export function totp(config: TotpConfig, now = Date.now()): TotpCode {
  const periodMs = config.period * 1000
  const counter = Math.floor(now / periodMs)
  return {
    code: hotp(config.secret, counter, config.algorithm, config.digits),
    period: config.period,
    expiresAt: (counter + 1) * periodMs,
  }
}
