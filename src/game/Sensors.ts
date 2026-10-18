import { raySegment, type Vec2 } from './math'
import type { Track } from './Track'

/**
 * Distance-sensing rays fanned out in front of a car.
 * Readings are normalised to 0..1 (1 = nothing within range), which is exactly
 * the shape a neural network wants as input.
 */
export class Sensors {
  readonly readings: number[]

  constructor(
    readonly rayCount = 7,
    readonly fov = Math.PI * (200 / 180),
    readonly range = 300,
  ) {
    this.readings = new Array(rayCount).fill(1)
  }

  /** World-space ray endpoints for debug drawing (filled by `update`). */
  readonly hits: Vec2[] = []

  update(pos: Vec2, angle: number, track: Track) {
    this.hits.length = 0
    for (let i = 0; i < this.rayCount; i++) {
      const frac = this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1)
      const a = angle - this.fov / 2 + frac * this.fov
      const dir = { x: Math.cos(a), y: Math.sin(a) }

      let nearest = this.range
      for (const e of track.edges) {
        const t = raySegment(pos, dir, e.a, e.b)
        if (t !== null && t < nearest) nearest = t
      }
      this.readings[i] = nearest / this.range
      this.hits.push({ x: pos.x + dir.x * nearest, y: pos.y + dir.y * nearest })
    }
  }
}
