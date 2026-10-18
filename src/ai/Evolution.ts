import { mulberry32, type Rng } from '../game/math'
import type { BrainJSON } from './NeuralNetwork'
import { NeuralNetwork } from './NeuralNetwork'

export interface PopulationOptions {
  size: number
  layers: number[]
  /** best brains copied unchanged into the next generation */
  eliteCount: number
  /** probability that any given weight mutates */
  mutationRate: number
  /** std-dev of a mutation */
  mutationStrength: number
  /** fraction of each generation replaced by brand-new random brains */
  immigrantRate: number
  rng: Rng
}

export interface GenStat {
  generation: number
  best: number
  avg: number
  /** fastest lap anyone set that generation (seconds), if any */
  bestLap: number | null
}

export interface PopulationJSON {
  layers: number[]
  generation: number
  brains: number[][]
  history: GenStat[]
  bestEver: { fitness: number; weights: number[] } | null
}

export const DEFAULT_POP_OPTIONS = {
  size: 80,
  eliteCount: 4,
  mutationRate: 0.12,
  mutationStrength: 0.35,
  immigrantRate: 0.05,
}

/** A population of brains plus the machinery to breed the next generation from fitness scores. */
export class Population {
  brains: NeuralNetwork[]
  generation = 0
  history: GenStat[] = []
  bestEver: { fitness: number; net: NeuralNetwork } | null = null
  /** generations since the best fitness last improved noticeably */
  stagnation = 0
  /** top brains of the most recently evaluated generation, best first */
  lastElites: NeuralNetwork[] = []

  readonly opts: PopulationOptions

  constructor(opts: Partial<PopulationOptions> & { layers: number[] }) {
    this.opts = {
      ...DEFAULT_POP_OPTIONS,
      rng: Math.random,
      ...opts,
    }
    this.brains = Array.from({ length: this.opts.size }, () =>
      NeuralNetwork.random(this.opts.layers, this.opts.rng),
    )
  }

  /** Mutation strength grows while progress is stalled, to shake the population loose. */
  get effectiveStrength(): number {
    return this.opts.mutationStrength * (1 + Math.min(this.stagnation, 12) * 0.12)
  }

  private tournament(order: number[], k = 4): number {
    const { rng } = this.opts
    // `order` is sorted best-first, so the lowest sampled position wins
    let pos = Math.floor(rng() * order.length)
    for (let i = 1; i < k; i++) pos = Math.min(pos, Math.floor(rng() * order.length))
    return order[pos]
  }

  /**
   * Record the fitness of the current generation and breed the next one in place.
   * `bestLap` is just carried into the history for the charts.
   */
  evolve(fitness: number[], bestLap: number | null = null): GenStat {
    const { rng, eliteCount, mutationRate, size, immigrantRate, layers } = this.opts
    const order = fitness.map((_, i) => i).sort((a, b) => fitness[b] - fitness[a])
    const best = fitness[order[0]]
    const avg = fitness.reduce((s, v) => s + v, 0) / fitness.length

    const improved = !this.bestEver || best > this.bestEver.fitness * 1.01
    if (!this.bestEver || best > this.bestEver.fitness) {
      this.bestEver = { fitness: best, net: this.brains[order[0]].clone() }
    }
    this.stagnation = improved ? 0 : this.stagnation + 1

    const stat: GenStat = { generation: this.generation, best, avg, bestLap }
    this.history.push(stat)
    this.lastElites = order.slice(0, Math.max(eliteCount, 8)).map((i) => this.brains[i].clone())

    const strength = this.effectiveStrength
    const next: NeuralNetwork[] = []
    for (let i = 0; i < Math.min(eliteCount, order.length); i++)
      next.push(this.brains[order[i]].clone())

    const immigrants = Math.round(size * immigrantRate)
    const breeders = order.slice(0, Math.max(2, Math.ceil(order.length * 0.5)))
    while (next.length < size - immigrants) {
      const a = this.brains[this.tournament(breeders)]
      let child: NeuralNetwork
      if (rng() < 0.7) {
        const b = this.brains[this.tournament(breeders)]
        child = NeuralNetwork.crossover(a, b, rng)
      } else {
        child = a.clone()
      }
      next.push(child.mutate(mutationRate, strength, rng))
    }
    while (next.length < size) next.push(NeuralNetwork.random(layers, rng))

    this.brains = next
    this.generation++
    return stat
  }

  toJSON(): PopulationJSON {
    return {
      layers: [...this.opts.layers],
      generation: this.generation,
      brains: this.brains.map((b) => b.toJSON().weights),
      history: this.history.slice(-400),
      bestEver: this.bestEver
        ? { fitness: this.bestEver.fitness, weights: this.bestEver.net.toJSON().weights }
        : null,
    }
  }

  static fromJSON(json: PopulationJSON, opts: Partial<PopulationOptions> = {}): Population {
    const pop = new Population({ ...opts, layers: json.layers, size: json.brains.length })
    pop.brains = json.brains.map((w) => new NeuralNetwork(json.layers, w))
    pop.generation = json.generation
    pop.history = json.history
    if (json.bestEver) {
      pop.bestEver = {
        fitness: json.bestEver.fitness,
        net: new NeuralNetwork(json.layers, json.bestEver.weights),
      }
    }
    return pop
  }

  /** Re-seed the population around a known-good brain (used when resuming from shipped tiers). */
  seedFrom(nets: BrainJSON[], rng: Rng = mulberry32(1)) {
    const base = nets.map((n) => NeuralNetwork.fromJSON(n))
    this.brains = this.brains.map((_, i) => {
      const parent = base[i % base.length]
      return i < base.length ? parent.clone() : parent.clone().mutate(0.1, 0.25, rng)
    })
  }
}
