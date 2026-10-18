import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYERS } from '../src/ai/Brain'
import { Population } from '../src/ai/Evolution'
import { NeuralNetwork } from '../src/ai/NeuralNetwork'
import { defaultSimOptions, GenerationSim } from '../src/ai/Trainer'
import { mulberry32 } from '../src/game/math'
import { Track } from '../src/game/Track'
import { BUILTIN_TRACKS } from '../src/game/tracks'

describe('NeuralNetwork', () => {
  it('produces tanh-bounded outputs of the right size', () => {
    const net = NeuralNetwork.random(DEFAULT_LAYERS, mulberry32(1))
    const out = net.forward(new Array(DEFAULT_LAYERS[0]).fill(0.5))
    expect(out.length).toBe(DEFAULT_LAYERS[DEFAULT_LAYERS.length - 1])
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1)
  })

  it('round-trips through JSON', () => {
    const net = NeuralNetwork.random([4, 5, 2], mulberry32(2))
    const copy = NeuralNetwork.fromJSON(JSON.parse(JSON.stringify(net.toJSON(6))))
    const input = [0.1, -0.4, 0.9, 0.3]
    const a = Array.from(net.forward(input))
    const b = Array.from(copy.forward(input))
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4))
  })

  it('rejects weights of the wrong length', () => {
    expect(() => new NeuralNetwork([3, 2], [1, 2, 3])).toThrow()
  })

  it('mutation changes weights, crossover mixes parents', () => {
    const rng = mulberry32(3)
    const a = NeuralNetwork.random([6, 6, 3], rng)
    const b = NeuralNetwork.random([6, 6, 3], rng)
    const m = a.clone().mutate(1, 0.5, rng)
    expect(Array.from(m.weights)).not.toEqual(Array.from(a.weights))
    const c = NeuralNetwork.crossover(a, b, rng)
    const fromA = c.weights.filter((w, i) => w === a.weights[i]).length
    const fromB = c.weights.filter((w, i) => w === b.weights[i]).length
    expect(fromA).toBeGreaterThan(0)
    expect(fromB).toBeGreaterThan(0)
  })
})

describe('Population', () => {
  it('keeps its size and carries elites over unchanged', () => {
    const rng = mulberry32(4)
    const pop = new Population({ layers: [3, 4, 2], size: 20, eliteCount: 2, rng })
    const fitness = pop.brains.map((_, i) => i) // brain 19 is best
    const bestWeights = Array.from(pop.brains[19].weights)
    pop.evolve(fitness)
    expect(pop.brains.length).toBe(20)
    expect(pop.generation).toBe(1)
    expect(Array.from(pop.brains[0].weights)).toEqual(bestWeights)
  })

  it('serialises and restores', () => {
    const pop = new Population({ layers: [3, 4, 2], size: 6, rng: mulberry32(5) })
    pop.evolve([1, 2, 3, 4, 5, 6])
    const copy = Population.fromJSON(JSON.parse(JSON.stringify(pop.toJSON())))
    expect(copy.generation).toBe(pop.generation)
    expect(copy.brains.length).toBe(6)
    expect(copy.history.length).toBe(1)
  })
})

describe('evolution on a real track', () => {
  it('improves the best fitness within a handful of generations', () => {
    const track = new Track(BUILTIN_TRACKS[0])
    const pop = new Population({ layers: DEFAULT_LAYERS, size: 40, rng: mulberry32(11) })
    const bests: number[] = []
    for (let g = 0; g < 8; g++) {
      const sim = new GenerationSim(track, pop.brains, {
        ...defaultSimOptions(track, g),
        maxTime: 12,
      })
      sim.run()
      bests.push(Math.max(...sim.fitness()))
      pop.evolve(sim.fitness(), sim.bestLap())
    }
    expect(bests[bests.length - 1]).toBeGreaterThan(bests[0])
  })
})
