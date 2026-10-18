import { RIVAL_COLORS, RIVAL_NAMES, type RivalPool } from '../ai/rivals'
import type { CarSpec } from './Car'
import type { Entrant } from './Race'

export interface EntrantOptions {
  playerName?: string
  playerColor?: string
  playerSpec?: Partial<CarSpec>
  /** include the human player */
  player: boolean
  rivals: number
  pool: RivalPool | null
}

/** Build the grid: the player (optionally) plus `rivals` AI cars driven by the pool's brains. */
export function makeEntrants(opts: EntrantOptions): Entrant[] {
  const entrants: Entrant[] = []
  if (opts.player) {
    entrants.push({
      id: 'player',
      name: opts.playerName || 'You',
      color: opts.playerColor ?? '#ff4d4d',
      number: 0,
      spec: opts.playerSpec,
    })
  }
  const pool = opts.pool
  if (pool && pool.nets.length) {
    for (let i = 0; i < opts.rivals; i++) {
      entrants.push({
        id: `ai${i}`,
        name: RIVAL_NAMES[i % RIVAL_NAMES.length],
        color: RIVAL_COLORS[i % RIVAL_COLORS.length],
        number: i + 1,
        net: pool.nets[i % pool.nets.length],
        // a touch of spread so the field isn't a conga line of clones
        pace: pool.pace * (0.985 + (i % 3) * 0.01),
      })
    }
  }
  return entrants
}
