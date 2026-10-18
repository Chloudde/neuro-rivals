import { getRivalPool } from '../ai/rivals'
import { Race } from '../game/Race'
import { makeEntrants } from '../game/setup'
import { Stepper } from '../game/Stepper'
import type { Track } from '../game/Track'
import { BUILTIN_TRACKS } from '../game/tracks'
import type { App } from './App'
import { RaceView } from './RaceView'

/** A self-playing AI race used as the animated backdrop for the menus. */
export class Attract {
  private view: RaceView | null = null
  private fallbackTrack: Track | null = null
  private stepper = new Stepper()
  private trackIdx: number
  private restartIn = 0

  constructor(
    private app: App,
    startTrackId?: string,
  ) {
    const i = BUILTIN_TRACKS.findIndex((t) => t.id === startTrackId)
    this.trackIdx = i >= 0 ? i : Math.floor(Math.random() * BUILTIN_TRACKS.length)
    this.begin()
  }

  private begin() {
    const def = BUILTIN_TRACKS[this.trackIdx % BUILTIN_TRACKS.length]
    const track = this.app.getTrack(def)
    const pool = getRivalPool(def.id, 'legend')
    this.fallbackTrack = track
    if (!pool) {
      // no trained brains for this circuit: just show the empty track
      this.view = null
      this.app.renderer.setTrack(track)
      this.app.renderer.mode = 'fit'
      return
    }
    const race = new Race({
      track,
      laps: 2,
      entrants: makeEntrants({ player: false, rivals: 6, pool }),
      collisions: true,
      countdown: 1.2,
    })
    this.view = new RaceView(this.app.renderer, race)
    this.view.labels = false
    this.app.renderer.baseZoom = 0.7
    this.restartIn = 0
  }

  get trackName(): string {
    return this.view?.race.track.name ?? ''
  }

  update(dt: number) {
    const view = this.view
    if (!view) {
      this.app.renderer.draw({ track: this.fallbackTrack!, cars: [] }, dt)
      return
    }
    const { race } = view
    // camera follows whoever is leading
    const lead = race.standings()[0]
    this.app.renderer.follow = lead.car

    this.stepper.run(dt, () => {
      race.step({ throttle: 0, steer: 0 })
      view.afterStep(race.drainEvents(), false)
    })
    view.draw(dt)

    if (race.state === 'finished') {
      this.restartIn += dt
      if (this.restartIn > 2.5) {
        this.trackIdx++
        this.begin()
      }
    }
  }
}
