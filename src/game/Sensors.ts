import { raySegment, type Vec2 } from './math'
import type { Track } from './Track'

/**
 * Distance-sensing rays fanned out in front of a car.
 * Readings are normalised to 0..1 (1 = nothing within range): exactly the shape a neural network
 * wants as input. Only the track borders near the car are tested, which keeps this cheap enough to
 * run for a whole population every physics tick.
 */
export class Sensors {
  readonly readings: number[]
  /** World-space ray endpoints, for debug drawing (refreshed by `update`). */
  readonly hits: Vec2[]
  private readonly dirs: Vec2[]

  constructor(
    readonly rayCount = 9,
    readonly fov = (Math.PI * 200) / 180,
    readonly range = 320,
  ) {
    this.readings = new Array(rayCount).fill(1)
    this.hits = Array.from({ length: rayCount }, () => ({ x: 0, y: 0 }))
    this.dirs = Array.from({ length: rayCount }, () => ({ x: 1, y: 0 }))
  }

  /** `segment` is the car's current centerline segment index (from Track.project). */
  update(pos: Vec2, angle: number, track: Track, segment: number) {
    const n = track.count
    const w = track.sensorWindow(this.range)
    const first = this.rayCount === 1 ? 0 : -this.fov / 2
    const step = this.rayCount === 1 ? 0 : this.fov / (this.rayCount - 1)

    for (let r = 0; r < this.rayCount; r++) {
      const a = angle + first + step * r
      const d = this.dirs[r]
      d.x = Math.cos(a)
      d.y = Math.sin(a)
      let nearest = this.range
      for (let k = -w; k <= w; k++) {
        const i = (((segment + k) % n) + n) % n
        const j = i + 1 === n ? 0 : i + 1
        let t = raySegment(pos, d, track.left[i], track.left[j])
        if (t !== null && t < nearest) nearest = t
        t = raySegment(pos, d, track.right[i], track.right[j])
        if (t !== null && t < nearest) nearest = t
      }
      this.readings[r] = nearest / this.range
      this.hits[r].x = pos.x + d.x * nearest
      this.hits[r].y = pos.y + d.y * nearest
    }
  }
}
