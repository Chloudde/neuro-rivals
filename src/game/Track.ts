import { catmullRomLoop, pointToSegment, resampleLoop, wrapAngle, type Vec2 } from './math'

/** Serializable description of a circuit: a closed loop of control points plus a width. */
export interface TrackDef {
  id: string
  name: string
  /** Control points of a closed Catmull-Rom spline (world units). */
  points: Vec2[]
  width: number
  /** 1 (easy) .. 5 (brutal); purely informational. */
  difficulty?: number
  blurb?: string
  custom?: boolean
}

export interface Projection {
  /** index of the segment (centerline sample i -> i+1) the point is closest to */
  index: number
  /** position along that segment, 0..1 */
  t: number
  /** distance from the point to the centerline */
  dist: number
  /** closest point on the centerline */
  x: number
  y: number
  /** arc-length position of the closest point, 0..length */
  s: number
}

export interface TrackReport {
  ok: boolean
  issues: string[]
  length: number
  minRadius: number
  minGap: number
}

/** Distance between centerline samples (world units). */
const SAMPLE_SPACING = 16
/** Width of the gravel/grass run-off between the asphalt edge and the barrier. */
export const RUNOFF = 60

export class Track {
  readonly id: string
  readonly name: string
  readonly width: number
  readonly center: Vec2[]
  readonly normals: Vec2[] = []
  readonly left: Vec2[] = []
  readonly right: Vec2[] = []
  readonly barrierLeft: Vec2[] = []
  readonly barrierRight: Vec2[] = []
  /** cum[i] = arc length from sample 0 to sample i. */
  readonly cum: number[] = []
  readonly segLen: number[] = []
  /** total loop length */
  readonly length: number
  readonly barrierDist: number

  constructor(readonly def: TrackDef) {
    this.id = def.id
    this.name = def.name
    this.width = def.width
    this.barrierDist = def.width / 2 + RUNOFF

    const dense = catmullRomLoop(def.points, 40)
    this.center = resampleLoop(dense, SAMPLE_SPACING)
    const n = this.center.length
    const half = def.width / 2

    let acc = 0
    for (let i = 0; i < n; i++) {
      this.cum.push(acc)
      const a = this.center[i]
      const b = this.center[(i + 1) % n]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      this.segLen.push(len)
      acc += len
    }
    this.length = acc

    for (let i = 0; i < n; i++) {
      const prev = this.center[(i - 1 + n) % n]
      const next = this.center[(i + 1) % n]
      const tx = next.x - prev.x
      const ty = next.y - prev.y
      const len = Math.hypot(tx, ty) || 1
      const nx = -ty / len
      const ny = tx / len
      this.normals.push({ x: nx, y: ny })
      const c = this.center[i]
      this.left.push({ x: c.x + nx * half, y: c.y + ny * half })
      this.right.push({ x: c.x - nx * half, y: c.y - ny * half })
      this.barrierLeft.push({ x: c.x + nx * this.barrierDist, y: c.y + ny * this.barrierDist })
      this.barrierRight.push({ x: c.x - nx * this.barrierDist, y: c.y - ny * this.barrierDist })
    }
  }

  /** Number of centerline samples. */
  get count() {
    return this.center.length
  }

  /** Heading (radians) of the centerline at sample i. */
  headingAt(i: number): number {
    const n = this.count
    const a = this.center[((i % n) + n) % n]
    const b = this.center[(((i + 1) % n) + n) % n]
    return Math.atan2(b.y - a.y, b.x - a.x)
  }

  /** Binary search: segment index containing arc position s (s wrapped into [0,length)). */
  indexAtArc(s: number): number {
    const L = this.length
    s = ((s % L) + L) % L
    let lo = 0
    let hi = this.cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.cum[mid] <= s) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  /** World position + heading at arc position `s`, offset sideways by `lateral` (positive = left). */
  pointAt(s: number, lateral = 0): { pos: Vec2; angle: number; index: number } {
    const n = this.count
    const L = this.length
    const wrapped = ((s % L) + L) % L
    const i = this.indexAtArc(wrapped)
    const t = (wrapped - this.cum[i]) / (this.segLen[i] || 1)
    const a = this.center[i]
    const b = this.center[(i + 1) % n]
    const na = this.normals[i]
    const nb = this.normals[(i + 1) % n]
    const nx = na.x + (nb.x - na.x) * t
    const ny = na.y + (nb.y - na.y) * t
    const nl = Math.hypot(nx, ny) || 1
    return {
      pos: {
        x: a.x + (b.x - a.x) * t + (nx / nl) * lateral,
        y: a.y + (b.y - a.y) * t + (ny / nl) * lateral,
      },
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      index: i,
    }
  }

  /** Start/finish line: the first centerline sample, facing along the track. */
  get start(): { pos: Vec2; angle: number } {
    const p = this.pointAt(0)
    return { pos: p.pos, angle: p.angle }
  }

  /**
   * Nearest centerline segment to `p`.
   * Pass `hint` (the segment index from last frame) to search only a local window.
   */
  project(p: Vec2, hint?: number, window = 14): Projection {
    const n = this.count
    let bestDist = Infinity
    let bestIdx = 0
    let bestT = 0
    let bx = 0
    let by = 0
    const consider = (i: number) => {
      const idx = ((i % n) + n) % n
      const h = pointToSegment(p, this.center[idx], this.center[(idx + 1) % n])
      if (h.dist < bestDist) {
        bestDist = h.dist
        bestIdx = idx
        bestT = h.t
        bx = h.x
        by = h.y
      }
    }
    if (hint === undefined) {
      for (let i = 0; i < n; i++) consider(i)
    } else {
      for (let i = hint - window; i <= hint + window; i++) consider(i)
    }
    return {
      index: bestIdx,
      t: bestT,
      dist: bestDist,
      x: bx,
      y: by,
      s: this.cum[bestIdx] + bestT * this.segLen[bestIdx],
    }
  }

  isOnTrack(p: Vec2, hint?: number): boolean {
    return this.project(p, hint).dist <= this.width / 2
  }

  /** How many samples either side of a segment a ray of the given range might touch. */
  sensorWindow(range: number): number {
    return Math.ceil(range / (this.length / this.count)) + 2
  }

  /** Is this circuit well-formed enough to drive on? */
  validate(): TrackReport {
    const issues: string[] = []
    const n = this.count
    const half = this.width / 2

    // tightest bend: circumscribed-circle radius through samples i-2, i, i+2
    let minRadius = Infinity
    const k = 2
    for (let i = 0; i < n; i++) {
      const a = this.center[(i - k + n) % n]
      const b = this.center[i]
      const c = this.center[(i + k) % n]
      const ab = Math.hypot(b.x - a.x, b.y - a.y)
      const bc = Math.hypot(c.x - b.x, c.y - b.y)
      const ca = Math.hypot(a.x - c.x, a.y - c.y)
      const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
      if (area2 < 1e-6) continue
      const r = (ab * bc * ca) / (2 * area2)
      if (r < minRadius) minRadius = r
    }

    // closest approach between parts of the track that are far apart along the loop
    let minGap = Infinity
    const farArc = this.width * 3
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const arc = Math.min(this.cum[j] - this.cum[i], this.length - (this.cum[j] - this.cum[i]))
        if (arc < farArc) continue
        const d = Math.hypot(
          this.center[i].x - this.center[j].x,
          this.center[i].y - this.center[j].y,
        )
        if (d < minGap) minGap = d
      }
    }

    if (this.length < this.width * 8) issues.push('Track is too short.')
    if (minRadius < half * 1.15) issues.push('A corner is too tight for this track width.')
    if (minGap < this.width * 1.35) issues.push('Two parts of the track are too close or overlap.')
    if (this.def.points.length < 4) issues.push('Needs at least 4 control points.')

    return { ok: issues.length === 0, issues, length: this.length, minRadius, minGap }
  }

  /** Signed angle between the centerline heading at `index` and the given heading. */
  headingError(index: number, angle: number): number {
    return wrapAngle(angle - this.headingAt(index))
  }
}
