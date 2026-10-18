import { getAchievements, load, save, unlockAchievement } from './storage'
import { notify } from './ui/dom'

export interface AchievementDef {
  id: string
  title: string
  desc: string
  icon: string
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-race', title: 'On the grid', desc: 'Finish your first race.', icon: '🏁' },
  { id: 'first-win', title: 'First blood', desc: 'Win a race against the AI.', icon: '🥇' },
  { id: 'beat-legend', title: 'Giant killer', desc: 'Beat the Legend drivers.', icon: '🗡️' },
  {
    id: 'comeback',
    title: 'Comeback kid',
    desc: 'Win after starting at the back of the grid.',
    icon: '📈',
  },
  { id: 'photo-finish', title: 'Photo finish', desc: 'Win by less than 0.3 seconds.', icon: '📸' },
  { id: 'lap-record', title: 'Purple sector', desc: 'Set a personal best lap.', icon: '⏱️' },
  {
    id: 'grand-tour',
    title: 'Grand tour',
    desc: 'Win a race on every built-in circuit.',
    icon: '🌍',
  },
  { id: 'trainer', title: 'Proud parent', desc: 'Train a rival to generation 25.', icon: '🧠' },
  {
    id: 'master-trainer',
    title: 'Evolution engineer',
    desc: 'Train a rival to generation 100.',
    icon: '🧬',
  },
  {
    id: 'rival-slayer',
    title: 'Student becomes master',
    desc: 'Beat a rival you trained yourself.',
    icon: '🎓',
  },
  {
    id: 'designer',
    title: 'Track designer',
    desc: 'Test drive a circuit you drew yourself.',
    icon: '✏️',
  },
  { id: 'champion', title: 'World champion', desc: 'Win a championship.', icon: '🏆' },
]

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

/** Unlock and return the definition if it was newly earned (so callers can announce it). */
export function award(id: string): AchievementDef | null {
  return unlockAchievement(id) ? (achievementById(id) ?? null) : null
}

/** Award an achievement and pop a notification if it is new. */
export function grant(id: string): boolean {
  const a = award(id)
  if (a) notify(`Achievement unlocked: ${a.title}`, a.desc, a.icon)
  return !!a
}

export function earnedCount(): number {
  return Object.keys(getAchievements()).length
}

/** Records which circuits the player has won on, for the "grand tour" achievement. */
export function recordWin(trackId: string, builtinIds: string[]): boolean {
  const won = load<string[]>('wins-on', [])
  if (!won.includes(trackId)) won.push(trackId)
  save('wins-on', won)
  return builtinIds.every((id) => won.includes(id))
}
