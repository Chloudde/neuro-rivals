import { gaussian, type Rng } from '../game/math'

export interface BrainJSON {
  layers: number[]
  weights: number[]
}

/**
 * A tiny fully-connected feed-forward network with tanh activations.
 * All weights and biases live in one flat array, laid out layer by layer as
 * [neuron0 incoming weights..., neuron0 bias, neuron1 incoming weights..., neuron1 bias, ...].
 * A flat genome makes mutation and crossover trivial and serialization tiny.
 */
export class NeuralNetwork {
  readonly layers: number[]
  readonly weights: Float64Array
  /** Activations from the most recent forward pass, one array per layer (index 0 = the input). */
  readonly activations: Float64Array[]

  constructor(layers: number[], weights?: ArrayLike<number>) {
    this.layers = [...layers]
    const size = NeuralNetwork.genomeSize(layers)
    this.weights = new Float64Array(size)
    if (weights) {
      if (weights.length !== size) {
        throw new Error(`Weight count ${weights.length} does not match layers (${size})`)
      }
      this.weights.set(weights as ArrayLike<number>)
    }
    this.activations = layers.map((n) => new Float64Array(n))
  }

  static genomeSize(layers: number[]): number {
    let total = 0
    for (let l = 1; l < layers.length; l++) total += (layers[l - 1] + 1) * layers[l]
    return total
  }

  static random(layers: number[], rng: Rng): NeuralNetwork {
    const net = new NeuralNetwork(layers)
    let k = 0
    for (let l = 1; l < layers.length; l++) {
      const scale = 1 / Math.sqrt(layers[l - 1])
      for (let o = 0; o < layers[l]; o++) {
        for (let i = 0; i < layers[l - 1]; i++) net.weights[k++] = gaussian(rng) * scale * 1.4
        net.weights[k++] = 0
      }
    }
    return net
  }

  forward(input: ArrayLike<number>): Float64Array {
    const { layers, weights, activations } = this
    activations[0].set(input as ArrayLike<number>)
    let k = 0
    for (let l = 1; l < layers.length; l++) {
      const prev = activations[l - 1]
      const out = activations[l]
      const inN = layers[l - 1]
      for (let o = 0; o < layers[l]; o++) {
        let sum = 0
        for (let i = 0; i < inN; i++) sum += prev[i] * weights[k++]
        sum += weights[k++]
        out[o] = Math.tanh(sum)
      }
    }
    return activations[layers.length - 1]
  }

  clone(): NeuralNetwork {
    return new NeuralNetwork(this.layers, this.weights)
  }

  /** Perturb each weight with probability `rate` by Gaussian noise of size `strength`. */
  mutate(rate: number, strength: number, rng: Rng): this {
    const w = this.weights
    for (let i = 0; i < w.length; i++) {
      if (rng() < rate) {
        // mostly small nudges, occasionally a big jolt to escape local optima
        w[i] += gaussian(rng) * strength * (rng() < 0.04 ? 4 : 1)
      }
    }
    return this
  }

  /** Neuron-wise crossover: each neuron (with all its incoming weights) comes from one parent. */
  static crossover(a: NeuralNetwork, b: NeuralNetwork, rng: Rng): NeuralNetwork {
    const child = new NeuralNetwork(a.layers)
    let k = 0
    for (let l = 1; l < a.layers.length; l++) {
      const block = a.layers[l - 1] + 1
      for (let o = 0; o < a.layers[l]; o++) {
        const src = rng() < 0.5 ? a : b
        for (let i = 0; i < block; i++, k++) child.weights[k] = src.weights[k]
      }
    }
    return child
  }

  toJSON(digits = 4): BrainJSON {
    const f = 10 ** digits
    return {
      layers: [...this.layers],
      weights: Array.from(this.weights, (v) => Math.round(v * f) / f),
    }
  }

  static fromJSON(json: BrainJSON): NeuralNetwork {
    return new NeuralNetwork(json.layers, json.weights)
  }
}
