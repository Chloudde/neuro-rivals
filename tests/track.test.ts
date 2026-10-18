import { describe, expect, it } from 'vitest'
import { DT } from '../src/config'
import { Car } from '../src/game/Car'
import { raySegment } from '../src/game/math'
import { Track } from '../src/game/Track'
import { BUILTIN_TRACKS } from '../src/game/tracks'

describe('built-in tracks', () => {
  for (const def of BUILTIN_TRACKS) {
    it(`${def.id} is valid`, () => {
      const report = new Track(def).validate()
      expect(report.issues).toEqual([])
      expect(report.ok).toBe(true)
    })
  }
})

describe('Track', () => {
  const track = new Track(BUILTIN_TRACKS[0])

  it('puts the start line on the track', () => {
    expect(track.isOnTrack(track.start.pos)).toBe(true)
  })

  it('treats far-away points as off track', () => {
    expect(track.isOnTrack({ x: 9000, y: 9000 })).toBe(false)
  })

  it('hinted projection agrees with a full search near the hint', () => {
    const p = track.center[40]
    expect(track.project(p, 35).index).toBe(track.project(p).index)
  })

  it('pointAt wraps around the loop', () => {
    const a = track.pointAt(5)
    const b = track.pointAt(5 + track.length)
    expect(b.pos.x).toBeCloseTo(a.pos.x, 3)
    expect(b.pos.y).toBeCloseTo(a.pos.y, 3)
  })

  it('samples are evenly spaced', () => {
    const spacing = track.length / track.count
    for (const len of track.segLen) expect(Math.abs(len - spacing)).toBeLessThan(spacing * 0.35)
  })
})

describe('raySegment', () => {
  it('hits a segment straight ahead', () => {
    expect(
      raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: -5 }, { x: 10, y: 5 }),
    ).toBeCloseTo(10)
  })

  it('misses a segment behind the ray', () => {
    expect(
      raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -10, y: -5 }, { x: -10, y: 5 }),
    ).toBeNull()
  })
})

describe('Car', () => {
  const track = new Track(BUILTIN_TRACKS[0])

  it('accelerates and makes forward progress', () => {
    const car = new Car(track)
    for (let i = 0; i < 120; i++) car.update(DT, { throttle: 1, steer: 0 })
    expect(car.speed).toBeGreaterThan(100)
    expect(car.distance).toBeGreaterThan(50)
  })

  it('slows down far more on grass than on asphalt', () => {
    const road = new Car(track)
    const grass = new Car(track)
    grass.pos = { x: 5000, y: 5000 }
    grass.onTrack = false
    for (let i = 0; i < 90; i++) {
      road.update(DT, { throttle: 1, steer: 0 })
      grass.onTrack = false
      grass.update(DT, { throttle: 1, steer: 0 })
    }
    expect(road.speed).toBeGreaterThan(grass.speed)
  })

  it('counts laps when driven across the line', () => {
    const car = new Car(track)
    car.placeAt(track.length - 5)
    car.vx = Math.cos(car.angle) * 200
    car.vy = Math.sin(car.angle) * 200
    car.speed = 200
    for (let i = 0; i < 30; i++) car.update(DT, { throttle: 0.5, steer: 0 })
    expect(car.lapsCompleted).toBe(1)
    expect(car.lapTimes.length).toBe(1)
  })

  it('keeps cars inside the barrier', () => {
    const car = new Car(track)
    car.pos = { x: car.pos.x, y: car.pos.y - 900 }
    car.update(DT, { throttle: 0, steer: 0 })
    const d = track.project(car.pos).dist
    expect(d).toBeLessThanOrEqual(track.barrierDist + 1)
  })
})
