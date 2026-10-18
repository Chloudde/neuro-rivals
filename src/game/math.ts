export interface Vec2 {
  x: number
  y: number
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Distance from point p to segment ab, plus the clamped position t in [0,1] along it. */
export function pointToSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number } {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  const t = lenSq === 0 ? 0 : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1)
  const cx = a.x + abx * t
  const cy = a.y + aby * t
  return { dist: Math.hypot(p.x - cx, p.y - cy), t }
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
