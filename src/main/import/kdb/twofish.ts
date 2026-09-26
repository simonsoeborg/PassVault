// Twofish, enough of it to read a KeePass 1 database that chose Twofish over AES.
// Twofish exists in no JavaScript runtime and in no audited library we depend on,
// so it is implemented here from the specification and checked on every run
// against 303 published test vectors (tests/fixtures/twofish-256.json).
//
// Reference: Schneier et al., "Twofish: A 128-Bit Block Cipher" (1998), §4.

const BLOCK = 16
const ROUNDS = 16
const SUBKEYS = 40

// The 4-bit permutations the q boxes are built from (spec §4.3.5, table 6).
const Q0_T = [
  [0x8, 0x1, 0x7, 0xd, 0x6, 0xf, 0x3, 0x2, 0x0, 0xb, 0x5, 0x9, 0xe, 0xc, 0xa, 0x4],
  [0xe, 0xc, 0xb, 0x8, 0x1, 0x2, 0x3, 0x5, 0xf, 0x4, 0xa, 0x6, 0x7, 0x0, 0x9, 0xd],
  [0xb, 0xa, 0x5, 0xe, 0x6, 0xd, 0x9, 0x0, 0xc, 0x8, 0xf, 0x3, 0x2, 0x4, 0x7, 0x1],
  [0xd, 0x7, 0xf, 0x4, 0x1, 0x2, 0x6, 0xe, 0x9, 0xb, 0x3, 0x0, 0x8, 0x5, 0xc, 0xa],
]
const Q1_T = [
  [0x2, 0x8, 0xb, 0xd, 0xf, 0x7, 0x6, 0xe, 0x3, 0x1, 0x9, 0x4, 0x0, 0xa, 0xc, 0x5],
  [0x1, 0xe, 0x2, 0xb, 0x4, 0xc, 0x3, 0x7, 0x6, 0xd, 0xa, 0x5, 0xf, 0x9, 0x0, 0x8],
  [0x4, 0xc, 0x7, 0x5, 0x1, 0x6, 0x9, 0xa, 0x0, 0xe, 0xd, 0x8, 0x2, 0xb, 0x3, 0xf],
  [0xb, 0x9, 0x5, 0x1, 0xc, 0x3, 0xd, 0xe, 0x6, 0x4, 0x7, 0xf, 0x2, 0x0, 0x8, 0xa],
]

const ror4 = (x: number): number => ((x >> 1) | (x << 3)) & 0xf

function buildQ(t: number[][]): Uint8Array {
  const q = new Uint8Array(256)
  for (let x = 0; x < 256; x++) {
    const a0 = x >> 4
    const b0 = x & 0xf
    const a1 = a0 ^ b0
    const b1 = (a0 ^ ror4(b0) ^ ((a0 << 3) & 0xf)) & 0xf
    const a2 = t[0][a1]
    const b2 = t[1][b1]
    const a3 = a2 ^ b2
    const b3 = (a2 ^ ror4(b2) ^ ((a2 << 3) & 0xf)) & 0xf
    q[x] = (t[3][b3] << 4) | t[2][a3]
  }
  return q
}

const Q0 = buildQ(Q0_T)
const Q1 = buildQ(Q1_T)

// GF(2^8) with x^8+x^6+x^5+x^3+1 for MDS, and x^8+x^6+x^3+x^2+1 for RS.
const MDS_POLY = 0x69
const RS_POLY = 0x4d

function gfMul(a: number, b: number, poly: number): number {
  let result = 0
  let x = a & 0xff
  let y = b & 0xff
  while (y) {
    if (y & 1) result ^= x
    const high = x & 0x80
    x = (x << 1) & 0xff
    if (high) x ^= poly
    y >>= 1
  }
  return result & 0xff
}

/** The MDS matrix turns four bytes into one word (spec §4.3.2). */
function mds(y0: number, y1: number, y2: number, y3: number): number {
  const m = (a: number, b: number) => gfMul(a, b, MDS_POLY)
  const z0 = y0 ^ m(y1, 0xef) ^ m(y2, 0x5b) ^ m(y3, 0x5b)
  const z1 = m(y0, 0x5b) ^ m(y1, 0xef) ^ m(y2, 0xef) ^ y3
  const z2 = m(y0, 0xef) ^ m(y1, 0x5b) ^ y2 ^ m(y3, 0xef)
  const z3 = m(y0, 0xef) ^ y1 ^ m(y2, 0xef) ^ m(y3, 0x5b)
  return ((z0 | (z1 << 8) | (z2 << 16) | (z3 << 24)) >>> 0) >>> 0
}

const RS = [
  [0x01, 0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e],
  [0xa4, 0x56, 0x82, 0xf3, 0x1e, 0xc6, 0x68, 0xe5],
  [0x02, 0xa1, 0xfc, 0xc1, 0x47, 0xae, 0x3d, 0x19],
  [0xa4, 0x55, 0x87, 0x5a, 0x58, 0xdb, 0x9e, 0x03],
]

/** The RS matrix turns eight key bytes into the four bytes of one S word. */
function rsEncode(key: Uint8Array, offset: number): number {
  const out = [0, 0, 0, 0]
  for (let row = 0; row < 4; row++) {
    let acc = 0
    for (let col = 0; col < 8; col++) acc ^= gfMul(key[offset + col], RS[row][col], RS_POLY)
    out[row] = acc
  }
  return ((out[0] | (out[1] << 8) | (out[2] << 16) | (out[3] << 24)) >>> 0) >>> 0
}

const rol = (x: number, n: number): number => (((x << n) | (x >>> (32 - n))) >>> 0) >>> 0
const ror = (x: number, n: number): number => (((x >>> n) | (x << (32 - n))) >>> 0) >>> 0
const byte = (word: number, n: number): number => (word >>> (n * 8)) & 0xff

/**
 * h applies the q permutations, xors in one key word per level from the top down,
 * and finishes through the MDS matrix (spec §4.3.2).
 */
function h(x: number, l: number[], k: number): number {
  let y0 = byte(x, 0)
  let y1 = byte(x, 1)
  let y2 = byte(x, 2)
  let y3 = byte(x, 3)

  if (k === 4) {
    y0 = Q1[y0] ^ byte(l[3], 0)
    y1 = Q0[y1] ^ byte(l[3], 1)
    y2 = Q0[y2] ^ byte(l[3], 2)
    y3 = Q1[y3] ^ byte(l[3], 3)
  }
  if (k >= 3) {
    y0 = Q1[y0] ^ byte(l[2], 0)
    y1 = Q1[y1] ^ byte(l[2], 1)
    y2 = Q0[y2] ^ byte(l[2], 2)
    y3 = Q0[y3] ^ byte(l[2], 3)
  }
  y0 = Q1[Q0[Q0[y0] ^ byte(l[1], 0)] ^ byte(l[0], 0)]
  y1 = Q0[Q0[Q1[y1] ^ byte(l[1], 1)] ^ byte(l[0], 1)]
  y2 = Q1[Q1[Q0[y2] ^ byte(l[1], 2)] ^ byte(l[0], 2)]
  y3 = Q0[Q1[Q1[y3] ^ byte(l[1], 3)] ^ byte(l[0], 3)]

  return mds(y0, y1, y2, y3)
}

export interface TwofishKey {
  subkeys: number[]
  sbox: number[]
  k: number
}

function word(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0) >>> 0
}

export function twofishKey(key: Uint8Array): TwofishKey {
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new RangeError('Twofish keys are 16, 24 or 32 bytes')
  }
  const k = key.length / 8
  const me: number[] = []
  const mo: number[] = []
  for (let i = 0; i < k; i++) {
    me.push(word(key, i * 8))
    mo.push(word(key, i * 8 + 4))
  }
  // S is the RS-encoded key, taken in reverse order (spec §4.3.1).
  const sbox: number[] = []
  for (let i = k - 1; i >= 0; i--) sbox.push(rsEncode(key, i * 8))

  const RHO = 0x01010101
  const subkeys: number[] = []
  for (let i = 0; i < SUBKEYS / 2; i++) {
    const a = h(Math.imul(2 * i, RHO) >>> 0, me, k)
    const b = rol(h((Math.imul(2 * i + 1, RHO) >>> 0) >>> 0, mo, k), 8)
    subkeys.push((a + b) >>> 0)
    subkeys.push(rol((a + 2 * b) >>> 0, 9))
  }
  return { subkeys, sbox, k }
}

const g = (x: number, key: TwofishKey): number => h(x, key.sbox, key.k)

export function twofishEncryptBlock(key: TwofishKey, block: Uint8Array, offset = 0): Uint8Array {
  const { subkeys } = key
  let r0 = (word(block, offset) ^ subkeys[0]) >>> 0
  let r1 = (word(block, offset + 4) ^ subkeys[1]) >>> 0
  let r2 = (word(block, offset + 8) ^ subkeys[2]) >>> 0
  let r3 = (word(block, offset + 12) ^ subkeys[3]) >>> 0

  for (let round = 0; round < ROUNDS; round++) {
    const t0 = g(r0, key)
    const t1 = g(rol(r1, 8), key)
    const f0 = (t0 + t1 + subkeys[2 * round + 8]) >>> 0
    const f1 = (t0 + 2 * t1 + subkeys[2 * round + 9]) >>> 0
    const y2 = ror((r2 ^ f0) >>> 0, 1)
    const y3 = (rol(r3, 1) ^ f1) >>> 0
    r2 = r0
    r3 = r1
    r0 = y2
    r1 = y3
  }

  // The last swap is undone as part of the output whitening.
  return writeWords([(r2 ^ subkeys[4]) >>> 0, (r3 ^ subkeys[5]) >>> 0, (r0 ^ subkeys[6]) >>> 0, (r1 ^ subkeys[7]) >>> 0])
}

export function twofishDecryptBlock(key: TwofishKey, block: Uint8Array, offset = 0): Uint8Array {
  const { subkeys } = key
  let r2 = (word(block, offset) ^ subkeys[4]) >>> 0
  let r3 = (word(block, offset + 4) ^ subkeys[5]) >>> 0
  let r0 = (word(block, offset + 8) ^ subkeys[6]) >>> 0
  let r1 = (word(block, offset + 12) ^ subkeys[7]) >>> 0

  for (let round = ROUNDS - 1; round >= 0; round--) {
    const x0 = r2
    const x1 = r3
    const t0 = g(x0, key)
    const t1 = g(rol(x1, 8), key)
    const f0 = (t0 + t1 + subkeys[2 * round + 8]) >>> 0
    const f1 = (t0 + 2 * t1 + subkeys[2 * round + 9]) >>> 0
    const x2 = (rol(r0, 1) ^ f0) >>> 0
    const x3 = ror((r1 ^ f1) >>> 0, 1)
    r0 = x0
    r1 = x1
    r2 = x2
    r3 = x3
  }

  return writeWords([(r0 ^ subkeys[0]) >>> 0, (r1 ^ subkeys[1]) >>> 0, (r2 ^ subkeys[2]) >>> 0, (r3 ^ subkeys[3]) >>> 0])
}

function writeWords(words: number[]): Uint8Array {
  const out = new Uint8Array(BLOCK)
  for (let i = 0; i < 4; i++) {
    out[i * 4] = words[i] & 0xff
    out[i * 4 + 1] = (words[i] >>> 8) & 0xff
    out[i * 4 + 2] = (words[i] >>> 16) & 0xff
    out[i * 4 + 3] = (words[i] >>> 24) & 0xff
  }
  return out
}

/** CBC decryption with PKCS#7 padding, which is what KeePass 1 writes. */
export function twofishCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (iv.length !== BLOCK) throw new RangeError('Twofish needs a 16-byte IV')
  if (data.length === 0 || data.length % BLOCK !== 0) throw new RangeError('Twofish input must be whole blocks')
  const schedule = twofishKey(key)
  const out = new Uint8Array(data.length)
  let previous = iv
  for (let offset = 0; offset < data.length; offset += BLOCK) {
    const plain = twofishDecryptBlock(schedule, data, offset)
    for (let i = 0; i < BLOCK; i++) out[offset + i] = plain[i] ^ previous[i]
    previous = data.subarray(offset, offset + BLOCK)
  }
  const pad = out[out.length - 1]
  if (pad < 1 || pad > BLOCK || pad > out.length) throw new RangeError('Invalid padding')
  for (let i = out.length - pad; i < out.length; i++) {
    if (out[i] !== pad) throw new RangeError('Invalid padding')
  }
  return out.subarray(0, out.length - pad)
}
