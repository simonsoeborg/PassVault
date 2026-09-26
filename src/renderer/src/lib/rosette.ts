// A deterministic guilloche rosette for a vault id: the vault's printed fingerprint.
// The same id always draws the same rosette, on every device that opens the file.

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fnv1a(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

function toPath(points: Array<[number, number]>, close = true): string {
  let d = ''
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return close ? `${d}Z` : d
}

/**
 * Guilloche linework gets its density from repeated impressions of one curve at
 * small rotations, not from the curve itself — which also keeps every vault's
 * rosette equally rich instead of leaving that to the seed.
 */
function impressions(points: Array<[number, number]>, count: number, lobes: number): string {
  const step = (Math.PI * 2) / (lobes * count)
  let d = ''
  for (let copy = 0; copy < count; copy++) {
    const angle = step * copy
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    d += toPath(points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]))
  }
  return d
}

export interface RosetteGeometry {
  /** Hypotrochoid body. */
  a: string
  /** Epitrochoid counter-layer, drawn misregistered while locked. */
  b: string
  /** Interlaced wave border. */
  ring: string[]
}

const cache = new Map<string, RosetteGeometry>()

export function rosetteFor(id: string, detail: 'full' | 'small' = 'full'): RosetteGeometry {
  const key = `${id}:${detail}`
  const cached = cache.get(key)
  if (cached) return cached

  const rand = mulberry32(fnv1a(id || 'passvault'))
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  const small = detail === 'small'
  const steps = small ? 620 : 2600

  // Body: hypotrochoid with q lobes, R = q and r = p coprime so the curve closes.
  // The small format keeps the same seed but far fewer lobes: at badge size a dense
  // interlace fills in to a solid disc, the way fine linework does when printed too small.
  const q = small ? 7 + (between(11, 19) % 5) : between(11, 19)
  let p = small ? 2 + (between(3, 9) % 3) : 3 + (between(3, 9) % Math.max(2, q - 7))
  while (gcd(p, q) !== 1 || p >= q - 3) p = p + 1 < q - 3 ? p + 1 : 2
  const dA = small ? 0.85 + rand() * 0.25 : 0.55 + rand() * 0.4
  const pointsA: Array<[number, number]> = []
  {
    const R = q
    const r = p
    const d = dA * r
    const turns = (2 * Math.PI * r) / gcd(R, r)
    const scale = 58 / (R - r + d)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * turns
      const k = ((R - r) / r) * t
      pointsA.push([((R - r) * Math.cos(t) + d * Math.cos(k)) * scale, ((R - r) * Math.sin(t) - d * Math.sin(k)) * scale])
    }
  }

  // Counter-layer: epitrochoid with a different lobe count.
  const q2 = between(7, 13)
  let p2 = between(2, 5)
  while (gcd(p2, q2) !== 1) p2 = p2 + 1
  const pointsB: Array<[number, number]> = []
  {
    const R = q2
    const r = p2
    const d = (0.35 + rand() * 0.45) * r
    const turns = (2 * Math.PI * r) / gcd(R, r)
    const scale = 76 / (R + r + d)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * turns
      const k = ((R + r) / r) * t
      pointsB.push([((R + r) * Math.cos(t) - d * Math.cos(k)) * scale, ((R + r) * Math.sin(t) - d * Math.sin(k)) * scale])
    }
  }

  // Border: interlaced sine bands around a circle.
  const waves = small ? 9 + (between(36, 64) % 7) : between(36, 64)
  const bands = small ? 1 : 5
  const amplitude = small ? 4.5 + rand() * 2 : 2.2 + rand() * 1.6
  const ring: string[] = []
  const ringSteps = small ? 360 : 1440
  for (let band = 0; band < bands; band++) {
    const phase = (band / bands) * Math.PI * 2
    const points: Array<[number, number]> = []
    for (let i = 0; i <= ringSteps; i++) {
      const theta = (i / ringSteps) * Math.PI * 2
      const radius = 88 + amplitude * Math.sin(waves * theta + phase)
      points.push([radius * Math.cos(theta), radius * Math.sin(theta)])
    }
    ring.push(toPath(points))
  }

  const geometry = {
    a: small ? toPath(pointsA) : impressions(pointsA, 4, q),
    b: small ? toPath(pointsB) : impressions(pointsB, 2, q2),
    ring,
  }
  cache.set(key, geometry)
  return geometry
}

/** Human-checkable vault code, e.g. PV-8F3A-21C9. */
export function vaultCode(vaultId: string): string {
  const hex = vaultId.toUpperCase().padEnd(8, '0')
  return `PV-${hex.slice(0, 4)}-${hex.slice(4, 8)}`
}
