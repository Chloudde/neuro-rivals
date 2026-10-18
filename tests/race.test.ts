import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYERS } from '../src/ai/Brain'
import { NeuralNetwork } from '../src/ai/NeuralNetwork'
import { Race, type Entrant } from '../src/game/Race'
import { mulberry32 } from '../src/game/math'
import { Track } from '../src/game/Track'
import { BUILTIN_TRACKS } from '../src/game/tracks'

const track = new Track(BUILTIN_TRACKS[0])
const rng = mulberry32(9)

function entrants(aiCount: number): Entrant[] {
  const list: Entrant[] = [{ id: 'p', name: 'You', color: '#f00', number: 0 }]
  for (let i = 0; i < aiCount; i++) {
    list.push({
      id: `a${i}`,
      name: `AI${i}`,
      color: '#0f0',
      number: i + 1,
      net: NeuralNetwork.random(DEFAULT_LAYERS, rng),
    })
  }
  return list
}

describe('Race', () => {
  it('starts in countdown, then goes green', () => {
    const race = new Race({ track, laps: 1, entrants: entrants(2), countdown: 0.5 })
    expect(race.state).toBe('countdown')
    for (let i = 0; i < 40; i++) race.step({ throttle: 0, steer: 0 })
    expect(race.state).toBe('racing')
    const types = race.drainEvents().map((e) => e.type)
    expect(types).toContain('go')
  })

  it('freezes cars until GO and grids them behind the line', () => {
    const race = new Race({ track, laps: 1, entrants: entrants(3), countdown: 1 })
    for (const rc of race.cars) expect(rc.car.distance).toBeLessThan(0)
    race.step({ throttle: 1, steer: 0 })
    expect(race.player!.car.speed).toBe(0)
  })

  it('puts the player on pole or at the back as requested', () => {
    const front = new Race({ track, laps: 1, entrants: entrants(3), playerStart: 'front' })
    const back = new Race({ track, laps: 1, entrants: entrants(3), playerStart: 'back' })
    expect(front.cars[0].isPlayer).toBe(true)
    expect(back.cars[back.cars.length - 1].isPlayer).toBe(true)
  })

  it('lets a flat-out player finish a lap race and ranks them', () => {
    const race = new Race({ track, laps: 1, entrants: entrants(1), countdown: 0.1 })
    // the player just holds throttle and steers toward the next centerline point
    for (let i = 0; i < 60 * 120 && race.state !== 'finished'; i++) {
      const c = race.player!.car
      const next = track.center[(c.trackIndex + 6) % track.count]
      const want = Math.atan2(next.y - c.pos.y, next.x - c.pos.x)
      let err = want - c.angle
      while (err > Math.PI) err -= Math.PI * 2
      while (err < -Math.PI) err += Math.PI * 2
      race.step({ throttle: 0.7, steer: Math.max(-1, Math.min(1, err * 2.5)) })
    }
    expect(race.player!.car.finished).toBe(true)
    expect(race.state).toBe('finished')
    expect(race.player!.finishRank).toBeGreaterThan(0)
  })

  it('only treats flying laps as best-lap candidates and records a ghost for them', () => {
    const race = new Race({ track, laps: 3, entrants: entrants(0), countdown: 0.05 })
    const lapEvents: { lap: number; isBest: boolean; hasGhost: boolean }[] = []
    for (let i = 0; i < 60 * 150 && race.state !== 'finished'; i++) {
      const c = race.player!.car
      const next = track.center[(c.trackIndex + 6) % track.count]
      let err = Math.atan2(next.y - c.pos.y, next.x - c.pos.x) - c.angle
      while (err > Math.PI) err -= Math.PI * 2
      while (err < -Math.PI) err += Math.PI * 2
      race.step({ throttle: 0.7, steer: Math.max(-1, Math.min(1, err * 2.5)) })
      for (const e of race.drainEvents()) {
        if (e.type === 'lap') lapEvents.push({ lap: e.lap, isBest: e.isBest, hasGhost: !!e.ghost })
      }
    }
    expect(lapEvents.length).toBe(3)
    // lap 1 starts from the grid: never a best lap, never a ghost
    expect(lapEvents[0]).toMatchObject({ lap: 1, isBest: false, hasGhost: false })
    // lap 2 is the first flying lap, so it is a best by definition and carries a ghost
    expect(lapEvents[1]).toMatchObject({ lap: 2, isBest: true, hasGhost: true })
  })

  it('separates overlapping cars', () => {
    const race = new Race({ track, laps: 1, entrants: entrants(1), countdown: 0.05 })
    for (let i = 0; i < 10; i++) race.step({ throttle: 0, steer: 0 })
    const [a, b] = race.cars
    b.car.pos = { x: a.car.pos.x + 3, y: a.car.pos.y }
    race.step({ throttle: 0, steer: 0 })
    expect(Math.hypot(a.car.pos.x - b.car.pos.x, a.car.pos.y - b.car.pos.y)).toBeGreaterThan(8)
  })
})
