import { DT } from '../config'
import { Car } from '../game/Car'
import { mulberry32, type Rng } from '../game/math'
import type { Track } from '../game/Track'
import { brainControls } from './Brain'
import type { NeuralNetwork } from './NeuralNetwork'

export interface SimOptions {
  /** simulated seconds before the generation is called off */
  maxTime: number
  /** seconds without making progress before a car is retired */
  stallTime: number
  /** randomise start position/heading a little so brains learn to be robust */
  jitter: boolean
  rng: Rng
}

/** Sensible time limit for a track: enough for about one and a half good laps. */
export function defaultMaxTime(track: Track): number {
  return Math.max(30, Math.min(80, (track.length / 300) * 1.5))
}

export function defaultSimOptions(track: Track, seed = 1): SimOptions {
  return { maxTime: defaultMaxTime(track), stallTime: 3, jitter: true, rng: mulberry32(seed) }
}

/**
 * One generation of cars driving their brains around a track, all at once and without
 * colliding with each other. Call `step()` per tick (the UI does this a few times a frame to
 * fast-forward), or `run()` to finish it headlessly.
 */
export class GenerationSim {
  readonly cars: Car[]
  time = 0
  aliveCount: number
  private readonly bestDistance: number[]
  private readonly lastProgress: number[]

  constructor(
    readonly track: Track,
    readonly nets: NeuralNetwork[],
    readonly opts: SimOptions,
  ) {
    this.cars = nets.map((_, i) => {
      const car = new Car(track, { name: `#${i + 1}`, number: i + 1 })
      const lateral = opts.jitter ? (opts.rng() - 0.5) * track.width * 0.3 : 0
      const heading = opts.jitter ? (opts.rng() - 0.5) * 0.12 : 0
      car.placeAt(0, lateral, heading)
      return car
    })
    this.aliveCount = this.cars.length
    this.bestDistance = this.cars.map(() => 0)
    this.lastProgress = this.cars.map(() => 0)
  }

  get done(): boolean {
    return this.aliveCount === 0 || this.time >= this.opts.maxTime
  }

  /** Advance every living car by one physics tick. */
  step() {
    if (this.done) return
    this.time += DT
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]
      if (car.dead) continue
      car.update(DT, brainControls(this.nets[i], car))

      if (!car.onTrack) {
        this.kill(car)
        continue
      }
      if (car.distance > this.bestDistance[i] + 6) {
        this.bestDistance[i] = car.distance
        this.lastProgress[i] = this.time
      } else if (this.time - this.lastProgress[i] > this.opts.stallTime) {
        this.kill(car)
      }
    }
  }

  private kill(car: Car) {
    car.dead = true
    this.aliveCount--
  }

  run(): this {
    while (!this.done) this.step()
    return this
  }

  /** Fitness per brain: how far it got along the track. Faster cars get further in the time limit. */
  fitness(): number[] {
    return this.cars.map((c) => Math.max(0, c.distance))
  }

  /** Fastest single lap any car managed (seconds), or null if nobody completed one. */
  bestLap(): number | null {
    let best: number | null = null
    for (const c of this.cars) {
      const b = c.bestLap
      if (b !== null && (best === null || b < best)) best = b
    }
    return best
  }

  /** Index of the car currently furthest along (ties go to the living). */
  leaderIndex(): number {
    let best = 0
    for (let i = 1; i < this.cars.length; i++) {
      const a = this.cars[i]
      const b = this.cars[best]
      if (a.dead === b.dead ? a.distance > b.distance : !a.dead) best = i
    }
    return best
  }
}
