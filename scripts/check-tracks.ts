import { Track } from '../src/game/Track'
import { BUILTIN_TRACKS } from '../src/game/tracks'
for (const d of BUILTIN_TRACKS) {
  const t = new Track(d)
  const r = t.validate()
  console.log(
    d.id.padEnd(15),
    'ok=' + r.ok,
    'len=' + Math.round(r.length),
    'minR=' + Math.round(r.minRadius),
    'minGap=' + Math.round(r.minGap),
    'w=' + d.width,
    r.issues.join(' | '),
  )
}
