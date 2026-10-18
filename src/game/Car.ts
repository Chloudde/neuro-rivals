import { clamp, type Vec2 } from './math'
import { Sensors } from './Sensors'
import type { Track } from './Track'

/** What a driver (human or AI) tells the car each tick. */
export interface Controls {
  /** -1 (brake/reverse) .. 1 (full throttle) */
  throttle: number
  /** -1 (left) .. 1 (right) */
  steer: number
  /** hold to burn the nitro meter for extra acceleration and top speed */
  nitro?: boolean
}

export interface CarSpec {
  maxSpeed: number
  accel: number
  brake: number
  turnRate: number
  /** sideways grip: higher = less drifting */
  grip: number
}

export const DEFAULT_SPEC: CarSpec = {
  maxSpeed: 420,
  accel: 400,
  brake: 700,
  turnRate: 2.7,
  grip: 6.5,
}

export type CarClassId = 'balanced' | 'speedster' | 'handler'

export interface CarClass {
  id: CarClassId
  label: string
  blurb: string
  spec: Partial<CarSpec>
}

/** Chassis the player can pick in the garage. Rivals always drive the balanced one. */
export const CAR_CLASSES: CarClass[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'No weaknesses. The one the AIs trained on.',
    spec: {},
  },
  {
    id: 'speedster',
    label: 'Speedster',
    blurb: 'Higher top speed, slides more in corners.',
    spec: { maxSpeed: 448, accel: 370, turnRate: 2.45, grip: 5.4 },
  },
  {
    id: 'handler',
    label: 'Handler',
    blurb: 'Grippy and punchy out of corners, lower top speed.',
    spec: { maxSpeed: 398, accel: 440, turnRate: 3.0, grip: 8 },
  },
]

export const NITRO_DRAIN = 0.4 // meter per second while boosting
export const NITRO_REGEN = 0.07
const STEER_RESPONSE = 11
/** forward speed lost per unit of sideways slip scrubbed off by the tyres */
const SLIP_DRAG = 0.55

export interface CarOptions {
  name?: string
  color?: string
  number?: number
  spec?: Partial<CarSpec>
}

export class Car {
  readonly name: string
  readonly color: string
  readonly number: number
  readonly spec: CarSpec

  pos: Vec2 = { x: 0, y: 0 }
  angle = 0
  vx = 0
  vy = 0
  /** velocity along the car's heading */
  speed = 0
  /** velocity sideways (slip); non-zero while drifting */
  lateral = 0
  /** smoothed steering position, -1..1 */
  steerState = 0

  onTrack = true
  skid = false
  braking = false
  nitro = 1
  nitroActive = false

  /** current centerline segment, tracked incrementally */
  trackIndex = 0
  /** arc position within the lap, 0..track.length */
  private lastS = 0
  /** total distance travelled along the track, unwrapped (negative on the grid before the line) */
  distance = 0
  /** seconds of simulated time since this car was reset */
  time = 0

  lapsCompleted = 0
  lapTimes: number[] = []
  private lapStart = 0
  finished = false
  finishTime = 0

  /** set by the trainer when the car crashes out */
  dead = false
  /** transient: strength of the latest barrier/car impact (consumed by effects & audio) */
  impact = 0

  readonly sensors = new Sensors()
  readonly width = 18
  readonly length = 34

  constructor(
    private readonly track: Track,
    opts: CarOptions = {},
  ) {
    this.name = opts.name ?? 'Car'
    this.color = opts.color ?? '#ff4d4d'
    this.number = opts.number ?? 0
    this.spec = { ...DEFAULT_SPEC, ...opts.spec }
    this.placeAt(0)
  }

  /** Put the car on the centerline (plus a sideways offset) at arc position `s`, at rest. */
  placeAt(s: number, lateral = 0, headingJitter = 0) {
    const p = this.track.pointAt(s, lateral)
    this.pos = { ...p.pos }
    this.angle = p.angle + headingJitter
    this.vx = this.vy = this.speed = this.lateral = this.steerState = 0
    this.trackIndex = p.index
    this.distance = s
    this.lastS = ((s % this.track.length) + this.track.length) % this.track.length
    this.time = 0
    this.lapsCompleted = Math.floor(s / this.track.length)
    this.lapTimes = []
    this.lapStart = 0
    this.finished = false
    this.dead = false
    this.nitro = 1
    this.nitroActive = false
    this.onTrack = true
    this.sensors.update(this.pos, this.angle, this.track, this.trackIndex)
  }

  /** Drop the car back on the nearest bit of road, facing the right way (keeps race progress). */
  recover(speed = 40) {
    const proj = this.track.project(this.pos)
    const p = this.track.pointAt(proj.s)
    this.pos = { ...p.pos }
    this.angle = p.angle
    this.vx = Math.cos(this.angle) * speed
    this.vy = Math.sin(this.angle) * speed
    this.speed = speed
    this.lateral = 0
    this.steerState = 0
    this.trackIndex = p.index
    this.lastS = proj.s
    this.onTrack = true
  }

  /** Current lap number (1-based), clamped to the race length by the caller. */
  get lap() {
    return Math.max(0, this.lapsCompleted) + 1
  }

  get bestLap(): number | null {
    return this.lapTimes.length ? Math.min(...this.lapTimes) : null
  }

  /** Time into the current lap. */
  get lapTime() {
    return this.time - this.lapStart
  }

  /** Centres of the two collision circles (front and rear). */
  circles(): [Vec2, Vec2] {
    const c = Math.cos(this.angle) * 9
    const s = Math.sin(this.angle) * 9
    return [
      { x: this.pos.x + c, y: this.pos.y + s },
      { x: this.pos.x - c, y: this.pos.y - s },
    ]
  }
  static readonly RADIUS = 10.5

  update(dt: number, controls: Controls) {
    const { spec } = this
    this.time += dt
    const throttle = clamp(controls.throttle, -1, 1)
    const steerIn = clamp(controls.steer, -1, 1)
    this.steerState += (steerIn - this.steerState) * Math.min(1, STEER_RESPONSE * dt)

    // --- nitro meter
    const boosting = !!controls.nitro && throttle > 0.2 && this.nitro > 0.01 && this.speed > 40
    this.nitroActive = boosting
    this.nitro = boosting
      ? Math.max(0, this.nitro - NITRO_DRAIN * dt)
      : Math.min(1, this.nitro + NITRO_REGEN * dt)

    // --- steering: authority grows with speed and fades a little at the limit
    const sp = this.speed
    const authority =
      clamp(Math.abs(sp) / 110, 0, 1) * (1 - 0.38 * clamp(Math.abs(sp) / spec.maxSpeed, 0, 1.3))
    this.angle += this.steerState * spec.turnRate * authority * (sp >= 0 ? 1 : -1) * dt

    // --- split world velocity into forward / sideways parts of the *new* heading.
    // The velocity vector hasn't rotated yet, so turning hard leaves sideways slip = drift.
    const fx = Math.cos(this.angle)
    const fy = Math.sin(this.angle)
    const rx = -fy
    const ry = fx
    let vf = this.vx * fx + this.vy * fy
    let vl = this.vx * rx + this.vy * ry

    const boost = boosting ? 1.9 : 1
    if (throttle > 0) vf += spec.accel * boost * throttle * dt
    else if (throttle < 0) vf += (vf > 0 ? spec.brake : spec.brake * 0.45) * throttle * dt

    vf -= vf * (this.onTrack ? 0.32 : 2.2) * dt
    const cap = spec.maxSpeed * (boosting ? 1.22 : 1) * (this.onTrack ? 1 : 0.4)
    if (vf > cap) vf -= (vf - cap) * Math.min(1, 5 * dt)
    vf = Math.max(vf, -spec.maxSpeed * 0.3)

    // tyres scrub off sideways slip, and the friction costs forward speed too:
    // that's what makes flinging the car round a corner slower than lifting off and turning in
    const slipBefore = vl
    vl *= Math.exp(-spec.grip * (this.onTrack ? 1 : 0.45) * dt)
    const scrubbed = Math.abs(slipBefore - vl)
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), scrubbed * SLIP_DRAG)
    this.braking = throttle < -0.1 && vf > 5

    this.vx = fx * vf + rx * vl
    this.vy = fy * vf + ry * vl
    this.pos.x += this.vx * dt
    this.pos.y += this.vy * dt
    this.speed = vf
    this.lateral = vl
    this.skid = Math.abs(vl) > 50 || (throttle < -0.5 && vf > 160)

    this.updateTrackState()
    this.sensors.update(this.pos, this.angle, this.track, this.trackIndex)
  }

  private updateTrackState() {
    const track = this.track
    const L = track.length
    const proj = track.project(this.pos, this.trackIndex)

    // keep inside the barrier
    if (proj.dist > track.barrierDist) {
      const nx = (this.pos.x - proj.x) / proj.dist
      const ny = (this.pos.y - proj.y) / proj.dist
      this.pos.x = proj.x + nx * track.barrierDist
      this.pos.y = proj.y + ny * track.barrierDist
      const out = this.vx * nx + this.vy * ny
      if (out > 0) {
        this.vx -= nx * out * 1.35
        this.vy -= ny * out * 1.35
        this.vx *= 0.8
        this.vy *= 0.8
        this.impact = Math.max(this.impact, clamp(out / 250, 0.1, 1))
      }
    }

    // unwrap the arc position into total distance travelled
    let ds = proj.s - this.lastS
    if (ds > L / 2) ds -= L
    else if (ds < -L / 2) ds += L
    this.distance += ds
    this.lastS = proj.s
    this.trackIndex = proj.index
    this.onTrack = proj.dist <= track.width / 2 - 2

    // lap bookkeeping
    const laps = Math.floor(this.distance / L)
    if (laps > this.lapsCompleted) {
      this.lapsCompleted = laps
      if (laps >= 1) {
        this.lapTimes.push(this.time - this.lapStart)
        this.lapStart = this.time
      }
    }
  }
}
