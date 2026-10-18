export interface Vec2 {
  x: number
  y: number
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a <= -Math.PI) a += Math.PI * 2
  return a
}

/** Seeded PRNG (mulberry32) so training and tests are reproducible. */
export type Rng = () => number
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard-normal sample via Box-Muller. */
export function gaussian(rng: Rng): number {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface SegmentHit {
  dist: number
  /** position along the segment in [0,1] */
  t: number
  /** closest point on the segment */
  x: number
  y: number
}

/** Closest point on segment ab to point p. */
export function pointToSegment(p: Vec2, a: Vec2, b: Vec2): SegmentHit {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  const t = lenSq === 0 ? 0 : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1)
  const x = a.x + abx * t
  const y = a.y + aby * t
  return { dist: Math.hypot(p.x - x, p.y - y), t, x, y }
}

/**
 * Ray (origin o, direction d) vs segment ab.
 * Returns distance along the ray to the hit, or null if there is none.
 */
export function raySegment(o: Vec2, d: Vec2, a: Vec2, b: Vec2): number | null {
  const sx = b.x - a.x
  const sy = b.y - a.y
  const denom = d.x * sy - d.y * sx
  if (Math.abs(denom) < 1e-9) return null
  const t = ((a.x - o.x) * sy - (a.y - o.y) * sx) / denom
  const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / denom
  return t >= 0 && u >= 0 && u <= 1 ? t : null
}

/** Closed Catmull-Rom spline through the control points, `perSegment` samples between each pair. */
export function catmullRomLoop(points: Vec2[], perSegment: number): Vec2[] {
  const out: Vec2[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return out
}

/** Resample a closed polyline into points spaced (almost exactly) `spacing` apart along its length. */
export function resampleLoop(poly: Vec2[], spacing: number): Vec2[] {
  const n = poly.length
  const cum: number[] = [0]
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y))
  }
  const total = cum[n]
  const count = Math.max(8, Math.round(total / spacing))
  const step = total / count
  const out: Vec2[] = []
  let seg = 0
  for (let k = 0; k < count; k++) {
    const s = k * step
    while (seg < n - 1 && cum[seg + 1] < s) seg++
    const a = poly[seg]
    const b = poly[(seg + 1) % n]
    const len = cum[seg + 1] - cum[seg] || 1
    const t = (s - cum[seg]) / len
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}
