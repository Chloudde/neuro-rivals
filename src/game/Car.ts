import { clamp, type Vec2 } from './math'
import { Sensors } from './Sensors'
import type { Track } from './Track'

/** What a driver (human or AI) tells the car each tick. */
export interface Controls {
  /** -1 (brake/reverse) .. 1 (full throttle) */
  throttle: number
  /** -1 (left) .. 1 (right) */
  steer: number
}

export interface CarOptions {
  color: string
  maxSpeed?: number
  accel?: number
  brake?: number
  turnRate?: number
}

export class Car {
  pos: Vec2
  angle: number
  speed = 0
  onTrack = true
  /** nearest centerline index, tracked incrementally */
  trackIndex = 0
  /** total centerline samples travelled (can exceed track.length => laps) */
  progress = 0
  readonly sensors = new Sensors()

  readonly color: string
  readonly maxSpeed: number
  readonly accel: number
  readonly brake: number
  readonly turnRate: number

  readonly width = 18
  readonly length = 32

  constructor(
    private readonly track: Track,
    opts: CarOptions,
  ) {
    this.color = opts.color
    this.maxSpeed = opts.maxSpeed ?? 420
    this.accel = opts.accel ?? 380
    this.brake = opts.brake ?? 600
    this.turnRate = opts.turnRate ?? 2.6
    const s = track.start
    this.pos = { ...s.pos }
    this.angle = s.angle
  }

  get lap() {
    return Math.max(0, Math.floor(this.progress / this.track.length))
  }

  update(dt: number, controls: Controls) {
    const throttle = clamp(controls.throttle, -1, 1)
    const steer = clamp(controls.steer, -1, 1)

    if (throttle > 0) this.speed += this.accel * throttle * dt
    else if (throttle < 0) this.speed += this.brake * throttle * dt

    // rolling resistance, much heavier on the grass
    const drag = this.onTrack ? 0.35 : 2.4
    this.speed -= this.speed * drag * dt
    const cap = this.onTrack ? this.maxSpeed : this.maxSpeed * 0.35
    this.speed = clamp(this.speed, -this.maxSpeed * 0.3, cap)

    // steering authority scales with speed so you can't spin on the spot
    const grip = clamp(Math.abs(this.speed) / 120, 0, 1)
    this.angle += steer * this.turnRate * grip * Math.sign(this.speed || 1) * dt

    this.pos.x += Math.cos(this.angle) * this.speed * dt
    this.pos.y += Math.sin(this.angle) * this.speed * dt

    this.updateTrackState()
    this.sensors.update(this.pos, this.angle, this.track)
  }

  private updateTrackState() {
    const proj = this.track.project(this.pos, this.trackIndex)
    const n = this.track.length
    // signed index change, wrapped so crossing the start line is +1 not -(n-1)
    let delta = proj.index - this.trackIndex
    if (delta > n / 2) delta -= n
    else if (delta < -n / 2) delta += n
    this.progress += delta
    this.trackIndex = proj.index
    this.onTrack = proj.dist <= this.track.width / 2
  }
}
