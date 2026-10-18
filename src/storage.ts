import type { PopulationJSON } from './ai/Evolution'
import type { BrainJSON } from './ai/NeuralNetwork'
import type { CarClassId } from './game/Car'
import type { GhostData } from './game/Ghost'
import type { TrackDef } from './game/Track'

const PREFIX = 'neuro-rivals:'

/** localStorage can throw (private mode, quota, blocked): never let that crash the game. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- settings

export interface Settings {
  playerName: string
  carColor: string
  carClass: CarClassId
  /** race after dark: headlights and a dim track */
  night: boolean
  volume: number
  muted: boolean
  /** 0 hidden, 1 player's rays, 2 every car's rays */
  sensorMode: 0 | 1 | 2
  showGhost: boolean
  screenShake: boolean
  laps: number
  rivals: number
  difficulty: 'rookie' | 'pro' | 'legend' | 'rival'
  startPosition: 'front' | 'back'
  trackId: string
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: 'You',
  carColor: '#ff4d4d',
  carClass: 'balanced',
  night: false,
  volume: 0.5,
  muted: false,
  sensorMode: 0,
  showGhost: true,
  screenShake: true,
  laps: 3,
  rivals: 5,
  difficulty: 'pro',
  startPosition: 'front',
  trackId: 'neon-loop',
}

let settingsCache: Settings | null = null
export function getSettings(): Settings {
  if (!settingsCache)
    settingsCache = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) }
  return settingsCache
}
export function updateSettings(patch: Partial<Settings>) {
  settingsCache = { ...getSettings(), ...patch }
  save('settings', settingsCache)
}

// ----------------------------------------------------------------- records

export interface TrackRecords {
  /** best valid lap in seconds */
  bestLap?: number
  bestLapBy?: string
  /** best total race time per lap count, vs. anyone */
  bestRace?: Record<string, number>
  wins: number
  races: number
}

export function getRecords(trackId: string): TrackRecords {
  return { wins: 0, races: 0, ...load<Partial<TrackRecords>>(`records:${trackId}`, {}) }
}
export function saveRecords(trackId: string, rec: TrackRecords) {
  save(`records:${trackId}`, rec)
}

export function getGhost(trackId: string): GhostData | null {
  return load<GhostData | null>(`ghost:${trackId}`, null)
}
export function saveGhost(trackId: string, ghost: GhostData) {
  save(`ghost:${trackId}`, ghost)
}

// ------------------------------------------------------------- local rivals

/** The rival the player trains locally: a full evolving population plus its top brains. */
export interface RivalSave {
  trackId: string
  generation: number
  population: PopulationJSON
  elites: BrainJSON[]
  bestLap: number | null
  updated: number
}

export function getRival(trackId: string): RivalSave | null {
  return load<RivalSave | null>(`rival:${trackId}`, null)
}
export function saveRival(rival: RivalSave): boolean {
  return save(`rival:${rival.trackId}`, rival)
}
export function deleteRival(trackId: string) {
  remove(`rival:${trackId}`)
}

// ------------------------------------------------------------ championship

export interface Championship {
  trackIds: string[]
  /** index of the next race to run */
  index: number
  laps: number
  rivals: number
  difficulty: 'rookie' | 'pro' | 'legend' | 'rival'
  /** driver id -> points */
  points: Record<string, number>
  /** driver id -> display info, so standings survive renames */
  drivers: Record<string, { name: string; color: string }>
  /** per finished race: ordered driver ids */
  results: { trackId: string; order: string[] }[]
}

export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4]

export function getChampionship(): Championship | null {
  return load<Championship | null>('championship', null)
}
export function saveChampionship(c: Championship | null) {
  if (c) save('championship', c)
  else remove('championship')
}

// ------------------------------------------------------------ achievements

export function getAchievements(): Record<string, number> {
  return load<Record<string, number>>('achievements', {})
}

/** Unlock an achievement; returns true only the first time. */
export function unlockAchievement(id: string): boolean {
  const all = getAchievements()
  if (all[id]) return false
  all[id] = Date.now()
  save('achievements', all)
  return true
}

// ------------------------------------------------------------ custom tracks

export function getCustomTracks(): TrackDef[] {
  return load<TrackDef[]>('custom-tracks', [])
}
export function saveCustomTracks(tracks: TrackDef[]) {
  save('custom-tracks', tracks)
}
