import { brainControls } from '../ai/Brain'
import type { NeuralNetwork } from '../ai/NeuralNetwork'
import { DT } from '../config'
import { Car, DEFAULT_SPEC, type CarSpec, type Controls } from './Car'
import { GHOST_HZ, GhostRecorder, type GhostData } from './Ghost'
import type { Track } from './Track'

export interface Entrant {
  id: string
  name: string
  color: string
  number: number
  /** undefined = the human player */
  net?: NeuralNetwork
  /** multiplies top speed and acceleration (AI difficulty handicap) */
  pace?: number
  /** explicit handling overrides (the player's chosen chassis) */
  spec?: Partial<CarSpec>
}

export interface RaceConfig {
  track: Track
  laps: number
  entrants: Entrant[]
  /** where the player starts on the grid: 'front' (pole) or 'back' */
  playerStart?: 'front' | 'back'
  /** cars bump each other */
  collisions?: boolean
  /** seconds on the countdown before GO */
  countdown?: number
}

export type RaceState = 'countdown' | 'racing' | 'finished'

export type RaceEvent =
  | { type: 'countdown'; n: number }
  | { type: 'go' }
  | { type: 'lap'; car: RaceCar; lap: number; time: number; isBest: boolean; ghost?: GhostData }
  | { type: 'finish'; car: RaceCar; rank: number }
  | { type: 'impact'; x: number; y: number; strength: number }
  | { type: 'recover'; car: RaceCar }

export interface RaceCar {
  entrant: Entrant
  car: Car
  isPlayer: boolean
  /** 1-based current race position */
  position: number
  /** consecutive seconds spent (nearly) stationary or off the road: used to un-stick AI */
  stuckTime: number
  /** final classification once the car has finished, else 0 */
  finishRank: number
}

const GRID_ROW_GAP = 62
const GRID_FIRST_GAP = 36
const AFTER_FINISH_WAIT = 7

export class Race {
  readonly track: Track
  readonly laps: number
  readonly cars: RaceCar[]
  readonly player: RaceCar | undefined
  state: RaceState = 'countdown'
  /** seconds since GO */
  time = 0
  /** seconds until GO (counts down while state === 'countdown') */
  countdownLeft: number
  events: RaceEvent[] = []

  private readonly collisions: boolean
  private lastCountdownInt = Infinity
  private finishedCount = 0
  private playerFinishedAt: number | null = null
  private tick = 0
  private readonly recorder = new GhostRecorder()
  private recordingLap = false

  constructor(cfg: RaceConfig) {
    this.track = cfg.track
    this.laps = cfg.laps
    this.collisions = cfg.collisions ?? true
    this.countdownLeft = cfg.countdown ?? 3.2

    // grid order: AIs first (as given), player at the front or the back
    const ordered = [...cfg.entrants]
    const playerIdx = ordered.findIndex((e) => !e.net)
    if (playerIdx >= 0) {
      const [p] = ordered.splice(playerIdx, 1)
      if ((cfg.playerStart ?? 'front') === 'front') ordered.unshift(p)
      else ordered.push(p)
    }

    this.cars = ordered.map((entrant, slot) => {
      const pace = entrant.pace ?? 1
      const car = new Car(this.track, {
        name: entrant.name,
        color: entrant.color,
        number: entrant.number,
        spec: {
          maxSpeed: DEFAULT_SPEC.maxSpeed * pace,
          accel: DEFAULT_SPEC.accel * (0.6 + 0.4 * pace),
          ...entrant.spec,
        },
      })
      const row = Math.floor(slot / 2)
      const side = slot % 2 === 0 ? 1 : -1
      car.placeAt(-(GRID_FIRST_GAP + row * GRID_ROW_GAP), side * this.track.width * 0.2)
      return {
        entrant,
        car,
        isPlayer: !entrant.net,
        position: slot + 1,
        stuckTime: 0,
        finishRank: 0,
      }
    })
    this.player = this.cars.find((c) => c.isPlayer)
  }

  /** Cars in current race order. */
  standings(): RaceCar[] {
    return [...this.cars].sort((a, b) => this.compare(a, b))
  }

  private compare(a: RaceCar, b: RaceCar): number {
    if (a.car.finished && b.car.finished) return a.car.finishTime - b.car.finishTime
    if (a.car.finished) return -1
    if (b.car.finished) return 1
    return b.car.distance - a.car.distance
  }

  /** Seconds the car is behind the car directly ahead (rough, from distance and current speed). */
  gapAhead(rc: RaceCar): number | null {
    const order = this.standings()
    const i = order.indexOf(rc)
    if (i <= 0) return null
    const ahead = order[i - 1]
    if (ahead.car.finished || rc.car.finished) return null
    return (ahead.car.distance - rc.car.distance) / Math.max(120, rc.car.speed)
  }

  drainEvents(): RaceEvent[] {
    const e = this.events
    this.events = []
    return e
  }

  /** Put the player back on the road, facing the right way (R key). */
  recoverPlayer() {
    if (!this.player || this.state === 'countdown') return
    this.player.car.recover()
    this.events.push({ type: 'recover', car: this.player })
  }

  /** Advance the race by one fixed timestep. */
  step(playerControls: Controls) {
    this.tick++
    if (this.state === 'countdown') {
      this.countdownLeft -= DT
      const whole = Math.ceil(this.countdownLeft)
      if (whole < this.lastCountdownInt && whole > 0) {
        this.lastCountdownInt = whole
        this.events.push({ type: 'countdown', n: whole })
      }
      if (this.countdownLeft <= 0) {
        this.state = 'racing'
        this.events.push({ type: 'go' })
      }
      return
    }

    this.time += DT
    for (const rc of this.cars) this.driveCar(rc, playerControls)
    if (this.collisions) this.resolveCollisions()
    this.updatePositions()
    this.recordGhost()

    if (this.state === 'racing') {
      const everyoneDone = this.cars.every((c) => c.car.finished)
      const playerDoneLongAgo =
        this.playerFinishedAt !== null && this.time - this.playerFinishedAt > AFTER_FINISH_WAIT
      // with no human, the race simply ends when the winner crosses the line
      const noHumanDone = !this.player && this.finishedCount > 0
      if (everyoneDone || playerDoneLongAgo || noHumanDone) this.endRace()
    }
  }

  private driveCar(rc: RaceCar, playerControls: Controls) {
    const { car } = rc
    const wasLaps = car.lapsCompleted

    let controls: Controls
    if (car.finished) {
      // cool-down lap: the player coasts, AIs keep trundling round on their brains
      controls = rc.isPlayer ? { throttle: -0.15, steer: 0 } : brainControls(rc.entrant.net!, car)
      if (!rc.isPlayer)
        controls = { ...controls, throttle: Math.min(controls.throttle, 0.45), nitro: false }
    } else if (rc.isPlayer) {
      controls = playerControls
    } else {
      controls = brainControls(rc.entrant.net!, car)
    }
    car.update(DT, controls)

    if (!rc.isPlayer && !car.finished) this.unstick(rc)

    if (car.impact > 0) {
      this.events.push({ type: 'impact', x: car.pos.x, y: car.pos.y, strength: car.impact })
      car.impact = 0
    }

    if (car.lapsCompleted > wasLaps && car.lapsCompleted >= 1) this.onLapCrossed(rc)
  }

  /** AI cars that wedge themselves into the grass or a wall get a tow back to the road. */
  private unstick(rc: RaceCar) {
    const { car } = rc
    const bad = !car.onTrack || Math.abs(car.speed) < 12
    rc.stuckTime = bad ? rc.stuckTime + DT : Math.max(0, rc.stuckTime - DT * 2)
    if (rc.stuckTime > (car.onTrack ? 2.5 : 3.5)) {
      rc.stuckTime = 0
      car.recover(70)
      this.events.push({ type: 'recover', car: rc })
    }
  }

  private onLapCrossed(rc: RaceCar) {
    const { car } = rc
    const lap = car.lapsCompleted
    const lapTime = car.lapTimes[car.lapTimes.length - 1]
    // lap 1 includes the run from the grid, so it only counts as a "best lap" in a 1-lap race
    const valid = lap >= 2 || this.laps === 1

    if (rc.isPlayer) {
      let ghost: GhostData | undefined
      if (this.recordingLap) ghost = this.recorder.finish(lapTime)
      this.recorder.reset()
      this.recordingLap = true // from the line onward every lap is a full flying lap
      const prevBest = Math.min(...car.lapTimes.slice(0, -1), Infinity)
      this.events.push({
        type: 'lap',
        car: rc,
        lap,
        time: lapTime,
        isBest: valid && lapTime < prevBest,
        ghost: valid ? ghost : undefined,
      })
    } else {
      this.events.push({ type: 'lap', car: rc, lap, time: lapTime, isBest: false })
    }

    if (lap >= this.laps && !car.finished) {
      car.finished = true
      // interpolate the finish moment back from the overshoot past the line
      const over = car.distance - this.laps * this.track.length
      car.finishTime = car.time - over / Math.max(60, car.speed)
      this.finishedCount++
      rc.finishRank = this.finishedCount
      if (rc.isPlayer) this.playerFinishedAt = this.time
      this.events.push({ type: 'finish', car: rc, rank: rc.finishRank })
    }
  }

  private recordGhost() {
    if (!this.player || !this.recordingLap || this.player.car.finished) return
    if (this.tick % Math.round(60 / GHOST_HZ) !== 0) return
    const c = this.player.car
    this.recorder.sample(c.pos.x, c.pos.y, c.angle)
  }

  private updatePositions() {
    const order = this.standings()
    order.forEach((rc, i) => (rc.position = i + 1))
  }

  private endRace() {
    this.state = 'finished'
    // classify anyone still out on track by distance covered
    const order = this.standings()
    order.forEach((rc, i) => {
      rc.position = i + 1
      if (!rc.finishRank) rc.finishRank = i + 1
    })
  }

  /** Two-circle-per-car bumper collisions: push apart and trade a little momentum. */
  private resolveCollisions() {
    const R = Car.RADIUS * 2
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i].car
        const b = this.cars[j].car
        if (Math.abs(a.pos.x - b.pos.x) > 40 || Math.abs(a.pos.y - b.pos.y) > 40) continue
        const ca = a.circles()
        const cb = b.circles()
        for (const p of ca) {
          for (const q of cb) {
            const dx = q.x - p.x
            const dy = q.y - p.y
            const d = Math.hypot(dx, dy)
            if (d >= R || d < 1e-4) continue
            const nx = dx / d
            const ny = dy / d
            const push = (R - d) / 2
            a.pos.x -= nx * push
            a.pos.y -= ny * push
            b.pos.x += nx * push
            b.pos.y += ny * push
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
            if (rel < 0) {
              const imp = -(1 + 0.25) * rel * 0.5
              a.vx -= nx * imp
              a.vy -= ny * imp
              b.vx += nx * imp
              b.vy += ny * imp
              const strength = Math.min(1, -rel / 220)
              if (strength > 0.05) {
                this.events.push({
                  type: 'impact',
                  x: (p.x + q.x) / 2,
                  y: (p.y + q.y) / 2,
                  strength,
                })
              }
            }
          }
        }
      }
    }
  }
}
