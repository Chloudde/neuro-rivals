/**
 * Headless sanity check: run AI-only races with the shipped brains and report how they cope with
 * a standing start, traffic and collisions.
 *
 *   npm run sim -- --laps 3 --rivals 6 --tier legend
 *   npm run sim -- --brains generalist --random 8      (all-rounder on tracks it has never seen)
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NeuralNetwork } from '../src/ai/NeuralNetwork'
import { Race, type Entrant } from '../src/game/Race'
import { Track, type TrackDef } from '../src/game/Track'
import { BUILTIN_TRACKS, randomTrack } from '../src/game/tracks'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const laps = Number(args.get('laps') ?? 3)
const rivals = Number(args.get('rivals') ?? 6)
const tier = (args.get('tier') ?? 'legend') as 'rookie' | 'pro' | 'legend'
const brainsFrom = args.get('brains') // e.g. "generalist": use that file for every track
const randomCount = Number(args.get('random') ?? 0)
const pace = { rookie: 0.78, pro: 0.92, legend: 1 }[tier]
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/ai/pretrained')

const jobs: { def: TrackDef; brainsId: string }[] = []
if (!randomCount)
  for (const def of BUILTIN_TRACKS) jobs.push({ def, brainsId: brainsFrom ?? def.id })
for (let i = 0; i < randomCount; i++) {
  jobs.push({
    def: randomTrack(1000 + i * 77, `random-${i + 1}`),
    brainsId: brainsFrom ?? 'generalist',
  })
}

let totalRecoveries = 0
for (const { def, brainsId } of jobs) {
  const file = resolve(dir, `${brainsId}.json`)
  if (!existsSync(file)) {
    console.log(`${def.id}: no brains (${brainsId})`)
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
  totalRecoveries += recoveries
  const winner = race.standings()[0]
  const lapTimes = winner.car.lapTimes.map((t) => t.toFixed(1)).join(' / ')
  const done = race.state === 'finished' && winner.car.finished
  console.log(
    `${def.id.padEnd(14)} len ${String(Math.round(track.length)).padStart(5)}  ${done ? 'finished' : 'NOT FINISHED'}  ` +
      `winner laps [${lapTimes}]  recoveries ${recoveries}  impacts ${impacts}`,
  )
}
console.log(`total recoveries: ${totalRecoveries}`)
