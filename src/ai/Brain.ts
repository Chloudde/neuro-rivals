import type { Car, Controls } from '../game/Car'
import { clamp } from '../game/math'
import { NeuralNetwork } from './NeuralNetwork'

/** 9 distance rays + speed + sideways slip + nitro meter. */
export const BRAIN_INPUTS = 12
/** throttle, steering, nitro. */
export const BRAIN_OUTPUTS = 3
export const DEFAULT_LAYERS = [BRAIN_INPUTS, 12, 8, BRAIN_OUTPUTS]

const inputBuf = new Float64Array(BRAIN_INPUTS)

/** What the AI "sees": the same normalised sensor readings regardless of who is driving. */
export function brainInputs(car: Car): Float64Array {
  const r = car.sensors.readings
  const n = r.length
  for (let i = 0; i < n; i++) inputBuf[i] = r[i]
  inputBuf[n] = clamp(car.speed / (car.spec.maxSpeed * 1.3), -0.5, 1)
  inputBuf[n + 1] = clamp(car.lateral / 150, -1, 1)
  inputBuf[n + 2] = car.nitro
  return inputBuf
}

/** Run the network on the car's current senses and turn the outputs into driving controls. */
export function brainControls(net: NeuralNetwork, car: Car): Controls {
  const out = net.forward(brainInputs(car))
  return { throttle: out[0], steer: out[1], nitro: out[2] > 0.25 }
}
