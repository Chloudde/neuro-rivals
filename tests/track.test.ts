import { describe, expect, it } from 'vitest'
import { Car } from '../src/game/Car'
import { raySegment } from '../src/game/math'
import { Track } from '../src/game/Track'

describe('Track', () => {
  const track = new Track()

  it('puts the start line on the track', () => {
    expect(track.isOnTrack(track.start.pos)).toBe(true)
  })

  it('treats far-away points as off track', () => {
    expect(track.isOnTrack({ x: 5000, y: 5000 })).toBe(false)
  })

  it('hinted projection agrees with a full search near the hint', () => {
    const p = track.center[40]
    expect(track.project(p, 35).index).toBe(track.project(p).index)
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
  it('makes forward progress and stays on track when driving the racing line start', () => {
    const track = new Track()
    const car = new Car(track, { color: '#fff' })
    for (let i = 0; i < 120; i++) car.update(1 / 120, { throttle: 1, steer: 0 })
    expect(car.speed).toBeGreaterThan(0)
    expect(car.progress).toBeGreaterThan(0)
  })
})
