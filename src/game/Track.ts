import { catmullRomLoop, pointToSegment, type Vec2 } from './math'

/** Control points for the default circuit (world units). */
const DEFAULT_CONTROL_POINTS: Vec2[] = [
  { x: 0, y: 0 },
  { x: 500, y: -40 },
  { x: 900, y: 80 },
  { x: 1150, y: 380 },
  { x: 950, y: 650 },
  { x: 600, y: 560 },
  { x: 380, y: 760 },
  { x: -60, y: 800 },
  { x: -380, y: 560 },
  { x: -300, y: 260 },
]

export interface Edge {
  a: Vec2
  b: Vec2
}

export interface Projection {
  /** index of the nearest centerline sample */
  index: number
  /** distance from the car to the centerline */
  dist: number
}

export class Track {
  readonly center: Vec2[]
  readonly left: Vec2[] = []
  readonly right: Vec2[] = []
  /** Both borders as segments; used for raycasts. */
  readonly edges: Edge[] = []

  constructor(
    controlPoints: Vec2[] = DEFAULT_CONTROL_POINTS,
    readonly width = 150,
    samplesPerSegment = 24,
  ) {
    this.center = catmullRomLoop(controlPoints, samplesPerSegment)
    const n = this.center.length
    const half = width / 2
    for (let i = 0; i < n; i++) {
      const prev = this.center[(i - 1 + n) % n]
      const next = this.center[(i + 1) % n]
      const tx = next.x - prev.x
      const ty = next.y - prev.y
      const len = Math.hypot(tx, ty) || 1
      const nx = -ty / len
      const ny = tx / len
      const c = this.center[i]
      this.left.push({ x: c.x + nx * half, y: c.y + ny * half })
      this.right.push({ x: c.x - nx * half, y: c.y - ny * half })
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      this.edges.push({ a: this.left[i], b: this.left[j] }, { a: this.right[i], b: this.right[j] })
    }
  }

  get length() {
    return this.center.length
  }

  /** Where the cars start: on the first centerline sample, facing the second. */
  get start(): { pos: Vec2; angle: number } {
    const a = this.center[0]
    const b = this.center[1]
    return { pos: { ...a }, angle: Math.atan2(b.y - a.y, b.x - a.x) }
  }

  /**
   * Nearest centerline sample to `p`.
   * Pass `hint` (last known index) to search a local window instead of the whole loop.
   */
  project(p: Vec2, hint?: number, window = 20): Projection {
    const n = this.center.length
    let best = { index: 0, dist: Infinity }
    const consider = (i: number) => {
      const idx = ((i % n) + n) % n
      const { dist } = pointToSegment(p, this.center[idx], this.center[(idx + 1) % n])
      if (dist < best.dist) best = { index: idx, dist }
    }
    if (hint === undefined) {
      for (let i = 0; i < n; i++) consider(i)
    } else {
      for (let i = hint - window; i <= hint + window; i++) consider(i)
    }
    return best
  }

  isOnTrack(p: Vec2, hint?: number): boolean {
    return this.project(p, hint).dist <= this.width / 2
  }
}
