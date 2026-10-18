import type { RivalSave } from '../storage'
import { mulberry32 } from '../game/math'
import type { Track } from '../game/Track'
import { DEFAULT_LAYERS } from './Brain'
import { Population, type PopulationOptions } from './Evolution'
import type { NeuralNetwork } from './NeuralNetwork'
import { defaultSimOptions, GenerationSim } from './Trainer'

export interface SessionOptions {
  size: number
  mutationRate: number
  mutationStrength: number
  seed: number
}

export const DEFAULT_SESSION: SessionOptions = {
  size: 80,
  mutationRate: 0.12,
  mutationStrength: 0.35,
  seed: Date.now() % 100000,
}

/**
 * A live evolution run on one track. The UI calls `advance()` with a tick budget each frame;
 * generations roll over automatically.
 */
export class TrainingSession {
  pop: Population
  sim: GenerationSim
  bestLapEver: number | null = null
  /** laps/time of the fastest car in the generation that just finished */
  lastGenBestLap: number | null = null
  /** called when a generation finishes evaluating, before the next one starts */
  onGeneration?: (gen: number) => void

  private seedCounter: number
  private rngSeed: number

  constructor(
    readonly track: Track,
    opts: Partial<SessionOptions> = {},
    resume?: RivalSave | null,
  ) {
    const o = { ...DEFAULT_SESSION, ...opts }
    this.rngSeed = o.seed
    this.seedCounter = o.seed
    const popOpts: Partial<PopulationOptions> = {
      mutationRate: o.mutationRate,
      mutationStrength: o.mutationStrength,
      rng: mulberry32(o.seed),
    }
    this.pop = resume
      ? Population.fromJSON(resume.population, {
          ...popOpts,
          size: resume.population.brains.length,
        })
      : new Population({ ...popOpts, layers: DEFAULT_LAYERS, size: o.size })
    if (resume) this.bestLapEver = resume.bestLap
    this.sim = this.newSim()
  }

  private newSim(): GenerationSim {
    return new GenerationSim(
      this.track,
      this.pop.brains,
      defaultSimOptions(this.track, this.seedCounter++),
    )
  }

  get generation() {
    return this.pop.generation
  }

  /** Change evolution parameters on the fly (takes effect from the next breeding). */
  setMutation(rate: number, strength: number) {
    this.pop.opts.mutationRate = rate
    this.pop.opts.mutationStrength = strength
  }

  /** Advance up to `ticks` physics steps, rolling over generations as needed. Returns generations completed. */
  advance(ticks: number, deadline = Infinity): number {
    let gens = 0
    for (let i = 0; i < ticks; i++) {
      this.sim.step()
      if (this.sim.done) {
        this.finishGeneration()
        gens++
        if (performance.now() > deadline) break
      } else if ((i & 63) === 0 && performance.now() > deadline) break
    }
    return gens
  }

  private finishGeneration() {
    const lap = this.sim.bestLap()
    this.lastGenBestLap = lap
    if (lap !== null && (this.bestLapEver === null || lap < this.bestLapEver))
      this.bestLapEver = lap
    this.pop.evolve(this.sim.fitness(), lap)
    this.onGeneration?.(this.pop.generation)
    this.sim = this.newSim()
  }

  /** Fill the population from known brains (extra slots are mutated copies) and restart the generation. */
  seedWith(nets: NeuralNetwork[]) {
    const { rng } = this.pop.opts
    this.pop.brains = this.pop.brains.map((_, i) => {
      const base = nets[i % nets.length]
      return i < nets.length ? base.clone() : base.clone().mutate(0.12, 0.2, rng)
    })
    this.sim = this.newSim()
  }

  /** Throw the population away and start from random brains. */
  reset(seed = this.rngSeed + 1) {
    this.rngSeed = seed
    this.seedCounter = seed
    const { mutationRate, mutationStrength, size } = this.pop.opts
    this.pop = new Population({
      layers: DEFAULT_LAYERS,
      size,
      mutationRate,
      mutationStrength,
      rng: mulberry32(seed),
    })
    this.bestLapEver = null
    this.lastGenBestLap = null
    this.sim = this.newSim()
  }

  toSave(): RivalSave {
    const elites = this.pop.lastElites.length
      ? this.pop.lastElites
      : this.pop.bestEver
        ? [this.pop.bestEver.net]
        : this.pop.brains.slice(0, 4)
    return {
      trackId: this.track.id,
      generation: this.pop.generation,
      population: this.pop.toJSON(),
      elites: elites.slice(0, 8).map((n) => n.toJSON(3)),
      bestLap: this.bestLapEver,
      updated: Date.now(),
    }
  }
}
