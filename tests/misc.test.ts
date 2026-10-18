import { describe, expect, it } from 'vitest'
import { DT } from '../src/config'
import { Car } from '../src/game/Car'
import { GhostPlayer, GhostRecorder } from '../src/game/Ghost'
import {
  catmullRomLoop,
  mulberry32,
  pointToSegment,
  resampleLoop,
  wrapAngle,
} from '../src/game/math'
import { Track } from '../src/game/Track'
import { BUILTIN_TRACKS, randomTrack } from '../src/game/tracks'
import { ACHIEVEMENTS } from '../src/achievements'

describe('math helpers', () => {
  it('wrapAngle folds into (-PI, PI]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2)
    expect(wrapAngle(0.3)).toBeCloseTo(0.3)
  })

  it('pointToSegment clamps to the ends', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(pointToSegment({ x: -5, y: 3 }, a, b).t).toBe(0)
    expect(pointToSegment({ x: 15, y: 0 }, a, b).dist).toBeCloseTo(5)
    expect(pointToSegment({ x: 4, y: 2 }, a, b).dist).toBeCloseTo(2)
  })

  it('seeded rng is deterministic', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 5; i++) expect(a()).toBe(b())
  })

  it('resampleLoop spaces points evenly', () => {
    const loop = catmullRomLoop(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 400 },
        { x: 0, y: 400 },
      ],
      30,
    )
    const pts = resampleLoop(loop, 20)
    const gaps = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length]
      return Math.hypot(q.x - p.x, q.y - p.y)
    })
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length
    for (const g of gaps) expect(Math.abs(g - mean)).toBeLessThan(mean * 0.2)
  })
})

describe('track validation', () => {
  it('rejects a track that crosses itself', () => {
    const bowtie = new Track({
      id: 'x',
      name: 'bowtie',
      width: 150,
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 1000 },
        { x: 1000, y: 0 },
        { x: 0, y: 1000 },
      ],
    })
    expect(bowtie.validate().ok).toBe(false)
  })

  it('rejects hairpins too tight for the width', () => {
    const tight = new Track({
      id: 'y',
      name: 'tight',
      width: 220,
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 120 },
        { x: 0, y: 120 },
      ],
    })
    expect(tight.validate().ok).toBe(false)
  })

  it('every built-in track starts heading along the first segment', () => {
    for (const def of BUILTIN_TRACKS) {
      const t = new Track(def)
      const p0 = t.center[0]
      const p1 = t.center[1]
      expect(t.start.angle).toBeCloseTo(Math.atan2(p1.y - p0.y, p1.x - p0.x), 5)
    }
  })
})

describe('randomTrack', () => {
  it('always produces a valid, deterministic circuit', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const def = randomTrack(seed * 31)
      expect(new Track(def).validate().ok).toBe(true)
      expect(def.points).toEqual(randomTrack(seed * 31).points)
    }
  })
})

describe('ghosts', () => {
  it('replays a recording with interpolation and ends when the lap is over', () => {
    const rec = new GhostRecorder()
    for (let i = 0; i < 31; i++) rec.sample(i * 10, 0, 0)
    const data = rec.finish(1.0)
    const player = new GhostPlayer(data)
    const mid = player.at(0.5)!
    expect(mid.x).toBeCloseTo(150, 0)
    expect(player.at(5)).toBeNull()
    expect(player.at(-1)).toBeNull()
  })
})

describe('ghost lap deltas', () => {
  it('reports when the ghost was at a given point on the track', () => {
    const track = new Track(BUILTIN_TRACKS[0])
    const car = new Car(track)
    const rec = new GhostRecorder()
    const samples: { t: number; arc: number }[] = []
    for (let i = 1; i <= 180; i++) {
      car.update(DT, { throttle: 1, steer: 0 })
      if (i % 2 === 0) {
        rec.sample(car.pos.x, car.pos.y, car.angle)
        samples.push({ t: i * DT, arc: car.distance })
      }
    }
    const ghost = new GhostPlayer(rec.finish(3))
    ghost.bindTrack(track)
    const probe = samples[samples.length >> 1]
    // the first sample is at t = 2 ticks, so allow for the half-second-ish indexing offset
    expect(ghost.timeAtArc(probe.arc)!).toBeCloseTo(probe.t, 1)
    expect(ghost.timeAtArc(-5000)).toBeNull()
    expect(ghost.timeAtArc(1e9)).toBeNull()
  })
})

describe('achievements', () => {
  it('has unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
