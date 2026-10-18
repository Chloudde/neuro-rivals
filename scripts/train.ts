/**
 * Headless neuroevolution trainer.
 *
 *   npm run train -- --track neon-loop --gens 80 --pop 100
 *   npm run train -- --track all --gens 120
 *   npm run train -- --track generalist --gens 150        (one brain trained on every built-in track)
 *
 * Writes src/ai/pretrained/<id>.json containing three snapshots of the evolving population
 * (rookie / pro / legend) that the game ships as rival difficulty tiers.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LAYERS } from '../src/ai/Brain'
import { Population } from '../src/ai/Evolution'
import { defaultSimOptions, GenerationSim } from '../src/ai/Trainer'
import { mulberry32 } from '../src/game/math'
import { Track } from '../src/game/Track'
import { BUILTIN_TRACKS } from '../src/game/tracks'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) {
    const next = process.argv[i + 1]
    if (next && !next.startsWith('--')) {
      args.set(a.slice(2), next)
      i++
    } else args.set(a.slice(2), 'true')
  }
}

const gens = Number(args.get('gens') ?? 80)
const popSize = Number(args.get('pop') ?? 100)
const seed = Number(args.get('seed') ?? 7)
const target = args.get('track') ?? 'all'
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/ai/pretrained')
mkdirSync(outDir, { recursive: true })

interface Snapshot {
  generation: number
  fitness: number
  bestLap: number | null
  elites: number[][]
}

function train(id: string, tracks: Track[]) {
  const multi = tracks.length > 1
  const rng = mulberry32(seed)
  const pop = new Population({ layers: DEFAULT_LAYERS, size: popSize, rng })
  const snaps: Snapshot[] = []
  const t0 = Date.now()

  for (let g = 0; g < gens; g++) {
    const fitness = new Array(popSize).fill(0)
    let bestLap: number | null = null
    for (const track of tracks) {
      const sim = new GenerationSim(track, pop.brains, defaultSimOptions(track, seed * 1000 + g))
      sim.run()
      const f = sim.fitness()
      // several tracks: average "laps completed" so long tracks don't dominate
      for (let i = 0; i < popSize; i++) fitness[i] += multi ? (f[i] / track.length) * 1000 : f[i]
      const lap = sim.bestLap()
      if (lap !== null && (bestLap === null || lap < bestLap)) bestLap = lap
    }
    for (let i = 0; i < popSize; i++) fitness[i] /= tracks.length

    const stat = pop.evolve(fitness, bestLap)
    snaps.push({
      generation: stat.generation,
      fitness: stat.best,
      bestLap,
      elites: pop.lastElites.slice(0, 8).map((n) => n.toJSON(3).weights),
    })
    const secs = ((Date.now() - t0) / 1000).toFixed(0)
    console.log(
      `[${id}] gen ${String(g).padStart(3)}  best ${stat.best.toFixed(0).padStart(6)}  avg ${stat.avg
        .toFixed(0)
        .padStart(
          6,
        )}  lap ${bestLap === null ? '  -  ' : bestLap.toFixed(2).padStart(5)}s  ${secs}s`,
    )
  }

  // pick tiers by fitness relative to the strongest generation
  const legend = snaps.reduce((a, b) => (b.fitness > a.fitness ? b : a))
  const firstAtLeast = (frac: number) =>
    snaps.find((s) => s.fitness >= legend.fitness * frac) ?? legend
  const pro = firstAtLeast(0.8)
  const rookie = firstAtLeast(0.5)

  const out = {
    id,
    layers: DEFAULT_LAYERS,
    generations: gens,
    trackLength: multi ? null : Math.round(tracks[0].length),
    tiers: { rookie, pro, legend },
  }
  writeFileSync(resolve(outDir, `${id}.json`), JSON.stringify(out))
  console.log(
    `[${id}] saved. rookie gen ${rookie.generation} (lap ${rookie.bestLap?.toFixed(1) ?? '-'}s), ` +
      `pro gen ${pro.generation} (lap ${pro.bestLap?.toFixed(1) ?? '-'}s), ` +
      `legend gen ${legend.generation} (lap ${legend.bestLap?.toFixed(1) ?? '-'}s)`,
  )
}

const all = BUILTIN_TRACKS.map((d) => new Track(d))
if (target === 'generalist') train('generalist', all)
else if (target === 'all') for (const t of all) train(t.id, [t])
else {
  const t = all.find((x) => x.id === target)
  if (!t)
    throw new Error(
      `Unknown track "${target}". Options: ${all.map((x) => x.id).join(', ')}, all, generalist`,
    )
  train(t.id, [t])
}
