import type { BrainJSON } from './NeuralNetwork'
import { NeuralNetwork } from './NeuralNetwork'

export type Tier = 'rookie' | 'pro' | 'legend'

interface Snapshot {
  generation: number
  fitness: number
  bestLap: number | null
  elites: number[][]
}

export interface PretrainedFile {
  id: string
  layers: number[]
  generations: number
  trackLength: number | null
  tiers: Record<Tier, Snapshot>
}

// Brains shipped with the game, produced offline by `npm run train`.
const files = import.meta.glob<PretrainedFile>('./pretrained/*.json', {
  eager: true,
  import: 'default',
})

const byId = new Map<string, PretrainedFile>()
for (const [path, file] of Object.entries(files)) {
  const id = path.split('/').pop()!.replace('.json', '')
  byId.set(id, file)
}

/** Shipped brains for this track, falling back to the all-rounder trained on every circuit. */
export function getPretrained(
  trackId: string,
): { file: PretrainedFile; generalist: boolean } | null {
  const own = byId.get(trackId)
  if (own) return { file: own, generalist: false }
  const gen = byId.get('generalist')
  return gen ? { file: gen, generalist: true } : null
}

export function pretrainedBrains(trackId: string, tier: Tier): BrainJSON[] | null {
  const found = getPretrained(trackId)
  if (!found) return null
  const snap = found.file.tiers[tier]
  return snap.elites.map((weights) => ({ layers: found.file.layers, weights }))
}

export function toNets(brains: BrainJSON[]): NeuralNetwork[] {
  return brains.map((b) => NeuralNetwork.fromJSON(b))
}
