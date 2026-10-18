/**
 * Headless sanity check: run AI-only races with the shipped brains and report how they cope with
 * a standing start, traffic and collisions.
 *
 *   npm run sim -- --laps 3 --rivals 6 --tier legend
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NeuralNetwork } from '../src/ai/NeuralNetwork'
import { DT } from '../src/config'
import { Race, type Entrant } from '../src/game/Race'
import { Track } from '../src/game/Track'
import { BUILTIN_TRACKS } from '../src/game/tracks'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const laps = Number(args.get('laps') ?? 3)
const rivals = Number(args.get('rivals') ?? 6)
const tier = (args.get('tier') ?? 'legend') as 'rookie' | 'pro' | 'legend'
const pace = { rookie: 0.78, pro: 0.92, legend: 1 }[tier]
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/ai/pretrained')

for (const def of BUILTIN_TRACKS) {
  const file = resolve(dir, `${def.id}.json`)
  if (!existsSync(file)) {
    console.log(`${def.id}: no brains`)
    continue
  }
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const nets: NeuralNetwork[] = data.tiers[tier].elites.map(
    (w: number[]) => new NeuralNetwork(data.layers, w),
  )
  const track = new Track(def)
  const entrants: Entrant[] = Array.from({ length: rivals }, (_, i) => ({
    id: `ai${i}`,
    name: `AI${i}`,
    color: '#fff',
    number: i + 1,
    net: nets[i % nets.length],
    pace: pace * (0.985 + (i % 3) * 0.01),
  }))
  const race = new Race({ track, laps, entrants, collisions: true, countdown: 0.1 })

  let recoveries = 0
  let impacts = 0
  const limit = 60 * 60 * 6
  for (let t = 0; t < limit && race.state !== 'finished'; t++) {
    race.step({ throttle: 0, steer: 0 })
    for (const e of race.drainEvents()) {
      if (e.type === 'recover') recoveries++
      if (e.type === 'impact') impacts++
    }
  }
  const order = race.standings()
  const finished = order.filter((c) => c.car.finished)
  const times = finished.map((c) => c.car.finishTime.toFixed(1)).join(', ')
  console.log(
    `${def.id.padEnd(14)} ${tier}  finished ${finished.length}/${rivals}  race ${race.time.toFixed(0)}s (${(race.time / DT / 60).toFixed(0)} min-sim)  ` +
      `recoveries ${recoveries}  impacts ${impacts}  times [${times}]`,
  )
}
