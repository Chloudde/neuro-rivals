import { mulberry32 } from './math'
import { Track, type TrackDef } from './Track'

/** The built-in circuits. Control points trace a closed loop; the first point is the start line. */
export const BUILTIN_TRACKS: TrackDef[] = [
  {
    id: 'neon-loop',
    name: 'Neon Loop',
    blurb: 'Wide, flowing and forgiving. A perfect place to meet your rivals.',
    difficulty: 1,
    width: 170,
    points: [
      { x: 0, y: 0 },
      { x: 700, y: -80 },
      { x: 1400, y: -60 },
      { x: 2000, y: 200 },
      { x: 2250, y: 700 },
      { x: 2000, y: 1150 },
      { x: 1400, y: 1300 },
      { x: 900, y: 1000 },
      { x: 400, y: 1250 },
      { x: -300, y: 1250 },
      { x: -800, y: 900 },
      { x: -850, y: 350 },
      { x: -500, y: 0 },
    ],
  },
  {
    id: 'hairpin-hills',
    name: 'Hairpin Hills',
    blurb: 'Sweepers, a nasty V-bend and a long run back. Brake early.',
    difficulty: 3,
    width: 150,
    points: [
      { x: 0, y: 0 },
      { x: 800, y: -100 },
      { x: 1500, y: 0 },
      { x: 1900, y: 350 },
      { x: 1800, y: 800 },
      { x: 1300, y: 950 },
      { x: 1100, y: 740 },
      { x: 850, y: 740 },
      { x: 650, y: 950 },
      { x: 900, y: 1400 },
      { x: 400, y: 1700 },
      { x: -300, y: 1600 },
      { x: -700, y: 1200 },
      { x: -600, y: 700 },
      { x: -1000, y: 400 },
      { x: -800, y: -50 },
      { x: -400, y: -150 },
    ],
  },
  {
    id: 'speedway-gp',
    name: 'Speedway GP',
    blurb: 'Huge straights, a deep bay and flat-out corners. Pure speed.',
    difficulty: 2,
    width: 165,
    points: [
      { x: 0, y: 0 },
      { x: 1000, y: -50 },
      { x: 2000, y: -50 },
      { x: 2900, y: 100 },
      { x: 3300, y: 500 },
      { x: 3000, y: 900 },
      { x: 2600, y: 980 },
      { x: 2330, y: 1150 },
      { x: 2330, y: 1470 },
      { x: 2000, y: 1750 },
      { x: 1000, y: 1800 },
      { x: 0, y: 1700 },
      { x: -700, y: 1400 },
      { x: -900, y: 900 },
      { x: -700, y: 400 },
      { x: -300, y: 100 },
    ],
  },
  {
    id: 'serpent',
    name: 'The Serpent',
    blurb: 'A long, snaking technical circuit. Rhythm over raw speed.',
    difficulty: 4,
    width: 135,
    points: [
      { x: 0, y: 0 },
      { x: 600, y: -150 },
      { x: 1200, y: 0 },
      { x: 1500, y: 400 },
      { x: 1200, y: 800 },
      { x: 600, y: 700 },
      { x: 300, y: 1100 },
      { x: 700, y: 1500 },
      { x: 1400, y: 1600 },
      { x: 2000, y: 1900 },
      { x: 2500, y: 1500 },
      { x: 2400, y: 900 },
      { x: 2800, y: 500 },
      { x: 2600, y: -100 },
      { x: 2000, y: -400 },
      { x: 1200, y: -700 },
      { x: 400, y: -600 },
      { x: -300, y: -500 },
      { x: -700, y: -100 },
      { x: -600, y: 250 },
      { x: -250, y: 200 },
    ],
  },
  {
    id: 'pretzel-pass',
    name: 'Pretzel Pass',
    blurb: 'Tight, twisty and narrow. Only the sharpest brains survive.',
    difficulty: 5,
    width: 125,
    points: [
      { x: 0, y: 0 },
      { x: 500, y: -250 },
      { x: 1000, y: -100 },
      { x: 1100, y: 350 },
      { x: 700, y: 600 },
      { x: 300, y: 450 },
      { x: -50, y: 800 },
      { x: 200, y: 1250 },
      { x: 750, y: 1350 },
      { x: 1250, y: 1150 },
      { x: 1700, y: 1350 },
      { x: 2000, y: 900 },
      { x: 1750, y: 400 },
      { x: 1950, y: -100 },
      { x: 1500, y: -450 },
      { x: 900, y: -650 },
      { x: 200, y: -650 },
      { x: -400, y: -450 },
      { x: -650, y: -50 },
      { x: -450, y: 300 },
      { x: -150, y: 150 },
    ],
  },
]

export function findBuiltin(id: string): TrackDef | undefined {
  return BUILTIN_TRACKS.find((t) => t.id === id)
}

/**
 * A random closed circuit: a wobbly ring of control points around a centre, re-rolled until it
 * passes validation (no pinched corners, no self-overlap). Deterministic for a given seed.
 */
export function randomTrack(seed: number, name = 'Random circuit'): TrackDef {
  const rng = mulberry32(seed)
  for (let attempt = 0; attempt < 200; attempt++) {
    const n = 9 + Math.floor(rng() * 6)
    const scale = 900 + rng() * 700
    // a few low-frequency bumps give long sweeping features; per-point noise adds the kinks
    const bumps = [1, 2, 3].map(() => ({ amp: 0.1 + rng() * 0.22, phase: rng() * Math.PI * 2 }))
    const points = Array.from({ length: n }, (_, i) => {
      const a = ((i + (rng() - 0.5) * 0.35) / n) * Math.PI * 2
      let r = 1
      bumps.forEach((b, k) => (r += b.amp * Math.sin((k + 2) * a + b.phase)))
      r *= 0.9 + rng() * 0.2
      return {
        x: Math.round(Math.cos(a) * r * scale * 1.35),
        y: Math.round(Math.sin(a) * r * scale),
      }
    })
    const def: TrackDef = {
      id: `random-${seed.toString(36)}`,
      name,
      width: 130 + Math.round(rng() * 4) * 10,
      points,
      custom: true,
      difficulty: 3,
      blurb: 'A randomly generated circuit.',
    }
    if (new Track(def).validate().ok) return def
  }
  // astronomically unlikely, but never return nothing
  return { ...BUILTIN_TRACKS[0], id: `random-${seed.toString(36)}`, name, custom: true }
}
