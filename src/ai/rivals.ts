import { getRival } from '../storage'
import type { NeuralNetwork } from './NeuralNetwork'
import { getPretrained, pretrainedBrains, toNets, type Tier } from './pretrained'

export type Difficulty = 'rookie' | 'pro' | 'legend' | 'rival'

export interface DifficultyInfo {
  id: Difficulty
  label: string
  blurb: string
  /** multiplies the AI cars' top speed and acceleration */
  pace: number
  tier?: Tier
}

export const DIFFICULTIES: DifficultyInfo[] = [
  {
    id: 'rookie',
    label: 'Rookie',
    blurb: 'Fresh from generation one. Wobbly, slow, but learning.',
    pace: 0.78,
    tier: 'rookie',
  },
  {
    id: 'pro',
    label: 'Pro',
    blurb: 'A few hundred generations of experience. Solid and consistent.',
    pace: 0.92,
    tier: 'pro',
  },
  {
    id: 'legend',
    label: 'Legend',
    blurb: 'Fully evolved. They know every corner on this track.',
    pace: 1,
    tier: 'legend',
  },
  {
    id: 'rival',
    label: 'My Rival',
    blurb: 'The drivers YOU trained in the Lab. They keep evolving.',
    pace: 1,
  },
]

export function difficultyInfo(id: Difficulty): DifficultyInfo {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]
}

export interface RivalPool {
  nets: NeuralNetwork[]
  pace: number
  /** where the brains came from, for the setup screen */
  source: string
  /** false when we had to fall back to something weaker than asked for */
  exact: boolean
}

/** Pick the brains that will drive the rival cars for this track and difficulty. */
export function getRivalPool(trackId: string, difficulty: Difficulty): RivalPool | null {
  const info = difficultyInfo(difficulty)

  if (difficulty === 'rival') {
    const saved = getRival(trackId)
    if (saved && saved.elites.length) {
      return {
        nets: toNets(saved.elites),
        pace: info.pace,
        source: `Your rival, generation ${saved.generation}`,
        exact: true,
      }
    }
    // nothing trained yet: start them off at rookie level, as promised
    const rookie = pretrainedBrains(trackId, 'rookie')
    if (rookie)
      return {
        nets: toNets(rookie),
        pace: difficultyInfo('rookie').pace,
        source: 'Untrained rival (rookie brains). Train them in the Lab!',
        exact: false,
      }
    return null
  }

  const brains = pretrainedBrains(trackId, info.tier!)
  if (!brains) return null
  const generalist = getPretrained(trackId)?.generalist ?? false
  return {
    nets: toNets(brains),
    pace: info.pace,
    source: generalist
      ? 'All-rounder brains (not specialised for this track)'
      : `${info.label} brains`,
    exact: !generalist,
  }
}

export const RIVAL_NAMES = [
  'Axon',
  'Volt',
  'Delta',
  'Nexus',
  'Tensor',
  'Sigma',
  'Cortex',
  'Gradient',
  'Neuron',
  'Vector',
]

export const RIVAL_COLORS = [
  '#4da6ff',
  '#ffd24d',
  '#4dff9a',
  '#c66bff',
  '#ff8f4d',
  '#4dfff0',
  '#ff6bb5',
  '#b5ff4d',
]
