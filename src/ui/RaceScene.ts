import { grant, recordWin } from '../achievements'
import { getRivalPool } from '../ai/rivals'
import { sfx } from '../game/Audio'
import { CAR_CLASSES } from '../game/Car'
import { GhostPlayer } from '../game/Ghost'
import { Race, type RaceEvent } from '../game/Race'
import { makeEntrants } from '../game/setup'
import { Stepper } from '../game/Stepper'
import { BUILTIN_TRACKS } from '../game/tracks'
import {
  getChampionship,
  getGhost,
  getRecords,
  getRival,
  getSettings,
  POINTS_TABLE,
  saveChampionship,
  saveGhost,
  saveRecords,
  updateSettings,
} from '../storage'
import type { App, RaceParams, Scene } from './App'
import { fmtTime, h, ordinal } from './dom'
import { Hud } from './Hud'
import { RaceView } from './RaceView'
import { RivalStudy } from './RivalStudy'

export class RaceScene implements Scene {
  private race!: Race
  private view!: RaceView
  private hud!: Hud
  private stepper = new Stepper()
  private paused = false
  private pauseEl: HTMLElement | null = null
  private resultsEl: HTMLElement | null = null
  private resultsShown = false
  private study: RivalStudy | null = null
  private bestLap: number | null = null
  private lastLap: number | null = null
  private fastest: { time: number; name: string } | null = null
  private newRecords: string[] = []
  private ghostBest: number | null = null
  /** your best lap on this track, replayed as the ghost and used for the live delta */
  private pbGhost: GhostPlayer | null = null
  private missingRivals = false

  constructor(
    private app: App,
    private params: RaceParams,
  ) {}

  enter() {
    const { app, params } = this
    const settings = getSettings()
    const def = app.trackDef(params.trackId)
    const track = app.getTrack(def)
    const isRace = params.mode === 'race'

    const pool = isRace ? getRivalPool(def.id, params.difficulty) : null
    this.missingRivals = isRace && !pool
    const entrants = makeEntrants({
      player: true,
      playerName: settings.playerName,
      playerColor: settings.carColor,
      playerSpec: CAR_CLASSES.find((c) => c.id === settings.carClass)?.spec,
      rivals: isRace ? params.rivals : 0,
      pool,
    })

    this.race = new Race({
      track,
      laps: params.laps,
      entrants,
      playerStart: params.playerStart,
      collisions: isRace,
      countdown: isRace ? 3.2 : 2.2,
    })
    this.view = new RaceView(app.renderer, this.race)
    this.view.sensorMode = settings.sensorMode
    app.renderer.baseZoom = 0.95
    app.renderer.night = settings.night

    const records = getRecords(def.id)
    this.bestLap = records.bestLap ?? null
    this.ghostBest = records.bestLap ?? null
    const ghost = getGhost(def.id)
    if (ghost) this.setPbGhost(ghost)
    this.view.ghost = settings.showGhost ? this.pbGhost : null

    this.hud = new Hud(app.ui, this.race, !isRace)
    app.input.setTouchVisible(true)
    sfx.startEngine()
    document.addEventListener('visibilitychange', this.onVisibility)
    this.hud.say('Get ready…', 'info', 900)
    if (this.missingRivals) {
      this.hud.toast('No trained rivals for this track yet: open the Lab or pick another track.')
    }
  }

  /** pause automatically when the tab is hidden, so you don't crash while alt-tabbed */
  private onVisibility = () => {
    if (document.hidden && !this.resultsShown && !this.paused) this.setPaused(true)
  }

  exit() {
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.app.renderer.night = false
    sfx.stopEngine()
    this.hud.destroy()
    this.pauseEl?.remove()
    this.resultsEl?.remove()
  }

  update(dt: number) {
    const { app, race, view, hud } = this
    const input = app.input

    if (input.consume('Escape') && !this.resultsShown) this.setPaused(!this.paused)
    if (input.consume('KeyV')) {
      view.sensorMode = ((view.sensorMode + 1) % 3) as 0 | 1 | 2
      updateSettings({ sensorMode: view.sensorMode })
      hud.toast(
        ['Sensors hidden', 'Showing your sensors', 'Showing every car’s sensors'][view.sensorMode],
      )
    }
    if (input.consume('KeyG')) {
      const s = getSettings()
      updateSettings({ showGhost: !s.showGhost })
      view.ghost = !s.showGhost ? this.pbGhost : null
      hud.toast(!s.showGhost ? 'Ghost on' : 'Ghost off')
    }
    if (input.consume('KeyR') && !this.paused) race.recoverPlayer()
    if (input.consume('KeyN')) {
      app.renderer.night = !app.renderer.night
      updateSettings({ night: app.renderer.night })
      hud.toast(app.renderer.night ? 'Night mode' : 'Day mode')
    }

    if (!this.paused) {
      const controls = input.controls()
      this.stepper.run(dt, () => {
        race.step(controls)
        const events = race.drainEvents()
        view.afterStep(events, getSettings().screenShake)
        for (const e of events) this.onEvent(e)
      })
    }

    const player = race.player
    if (player) {
      const c = player.car
      const ctl = input.controls()
      sfx.updateEngine(
        Math.abs(c.speed) / c.spec.maxSpeed,
        this.paused ? 0 : ctl.throttle,
        Math.abs(c.lateral),
        c.nitroActive && !this.paused,
      )
    }

    view.draw(dt)
    hud.update(dt, player, this.bestLap, this.lastLap)
    this.updateDelta()

    if (race.state === 'finished' && !this.resultsShown) this.showResults()
    this.study?.update()
  }

  /** Live gap to your best lap: how far ahead/behind the ghost you are at this exact spot. */
  private updateDelta() {
    const c = this.race.player?.car
    if (!c || !this.pbGhost || c.finished || this.race.state !== 'racing' || c.lapsCompleted < 1) {
      this.hud.setDelta(null)
      return
    }
    const arc = c.distance - c.lapsCompleted * this.race.track.length
    const ghostT = this.pbGhost.timeAtArc(arc)
    this.hud.setDelta(ghostT === null ? null : c.lapTime - ghostT)
  }

  // ----------------------------------------------------------------- events

  private onEvent(e: RaceEvent) {
    const { hud, race } = this
    switch (e.type) {
      case 'countdown':
        hud.say(String(e.n), 'count', 900)
        sfx.countdown(e.n)
        break
      case 'go':
        hud.say('GO!', 'go', 900)
        sfx.countdown(0)
        break
      case 'recover':
        if (e.car.isPlayer) sfx.click()
        break
      case 'lap': {
        const mine = e.car.isPlayer
        const valid = e.lap >= 2 || race.laps === 1
        if (mine && this.app.trackDef(race.track.id).custom) grant('designer')
        if (mine) {
          this.lastLap = e.time
          if (valid && (this.bestLap === null || e.time < this.bestLap)) this.bestLap = e.time
          if (e.lap < race.laps) hud.toast(`Lap ${e.lap}: ${fmtTime(e.time)}`, e.car.entrant.color)
          if (e.isBest && e.ghost && (this.ghostBest === null || e.time < this.ghostBest)) {
            this.ghostBest = e.time
            this.recordLap(e.time, e.ghost)
            hud.say('NEW BEST LAP', 'good', 1800)
            sfx.newBest()
          } else if (e.lap < race.laps) sfx.lap()
        } else if (valid && (!this.fastest || e.time < this.fastest.time)) {
          this.fastest = { time: e.time, name: e.car.entrant.name }
          if (this.bestLap === null || e.time < this.bestLap) {
            hud.toast(`${e.car.entrant.name}: fastest lap ${fmtTime(e.time)}`, e.car.entrant.color)
          }
        }
        break
      }
      case 'finish': {
        if (e.car.isPlayer) {
          hud.say(e.rank === 1 ? 'VICTORY!' : `${ordinal(e.rank)} PLACE`, 'good', 3000)
          sfx.finish(e.rank)
          if (e.rank === 1) {
            for (let i = 0; i < 3; i++) {
              this.view.particles.confetti(e.car.car.pos.x, e.car.car.pos.y, 40)
            }
          }
        } else {
          hud.toast(`${e.car.entrant.name} finished ${ordinal(e.rank)}`, e.car.entrant.color)
        }
        break
      }
    }
  }

  private setPbGhost(data: Parameters<typeof saveGhost>[1]) {
    this.pbGhost = new GhostPlayer(data)
    this.pbGhost.bindTrack(this.race.track)
  }

  private recordLap(time: number, ghost: Parameters<typeof saveGhost>[1]) {
    const rec = getRecords(this.race.track.id)
    if (rec.bestLap === undefined || time < rec.bestLap) {
      rec.bestLap = time
      rec.bestLapBy = getSettings().playerName
      saveRecords(this.race.track.id, rec)
      saveGhost(this.race.track.id, ghost)
      // the lap just set becomes the ghost/delta reference from the next lap on
      this.setPbGhost(ghost)
      if (getSettings().showGhost) this.view.ghost = this.pbGhost
      if (!this.newRecords.includes('Best lap')) this.newRecords.push('Best lap')
      grant('lap-record')
    }
  }

  // ------------------------------------------------------------- pause menu

  private setPaused(p: boolean) {
    this.paused = p
    this.pauseEl?.remove()
    this.pauseEl = null
    if (!p) return
    const { app } = this
    this.pauseEl = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'panel menu-panel pause' },
        h('h2', { text: 'Paused' }),
        h('button', { class: 'btn primary', text: 'Resume', onclick: () => this.setPaused(false) }),
        h('button', { class: 'btn', text: 'Restart', onclick: () => app.nav.race(this.params) }),
        h('button', {
          class: 'btn',
          text: 'Race setup',
          onclick: () => app.nav.setup(this.params.mode),
        }),
        h('button', { class: 'btn', text: 'Quit to menu', onclick: () => app.nav.menu() }),
        h('p', {
          class: 'hint',
          text: 'W/↑ gas · S/↓ brake · A D/←→ steer · Shift/Space nitro · R recover · V sensors · G ghost · N night · M mute',
        }),
      ),
    )
    app.ui.append(this.pauseEl)
  }

  // ---------------------------------------------------------------- results

  private showResults() {
    this.resultsShown = true
    const { race, app, params } = this
    const standings = race.standings()
    const player = race.player!
    const winner = standings[0]
    const isRace = params.mode === 'race'

    // persist records
    const rec = getRecords(race.track.id)
    rec.races++
    if (isRace && player.finishRank === 1) rec.wins++
    if (player.car.finished) {
      rec.bestRace = rec.bestRace ?? {}
      const key = String(race.laps)
      const t = player.car.finishTime
      if (rec.bestRace[key] === undefined || t < rec.bestRace[key]) {
        rec.bestRace[key] = t
        this.newRecords.push(`Best ${race.laps}-lap time`)
      }
    }
    saveRecords(race.track.id, rec)

    this.awardAchievements(standings)
    const points = params.championship ? this.scoreChampionship(standings) : null

    const rows = standings.map((rc, i) => {
      const c = rc.car
      const time = c.finished
        ? i === 0
          ? fmtTime(c.finishTime)
          : `+${(c.finishTime - winner.car.finishTime).toFixed(3)}`
        : 'DNF'
      return h(
        'tr',
        { class: rc.isPlayer ? 'me' : '' },
        h('td', { text: String(i + 1) }),
        h(
          'td',
          {},
          h('span', { class: 'dot', style: `background:${rc.entrant.color}` }),
          ' ',
          rc.entrant.name,
        ),
        h('td', { text: time }),
        h('td', { text: fmtTime(c.bestLap) }),
        points ? h('td', { class: 'pts', text: points[i] ? `+${points[i]}` : '' }) : null,
      )
    })

    const rank = player.position
    const headline = !isRace
      ? player.car.finished
        ? 'TIME TRIAL COMPLETE'
        : 'SESSION ENDED'
      : rank === 1
        ? 'VICTORY!'
        : `${ordinal(rank)} PLACE`

    this.resultsEl = h(
      'div',
      { class: 'overlay results-overlay' },
      h(
        'div',
        { class: 'panel results' },
        h('h2', { class: rank === 1 && isRace ? 'gold' : '', text: headline }),
        h('div', {
          class: 'sub',
          text: `${race.track.name} · ${race.laps} lap${race.laps > 1 ? 's' : ''}`,
        }),
        this.newRecords.length
          ? h('div', { class: 'records', text: '🏆 New record: ' + this.newRecords.join(', ') })
          : null,
        h(
          'table',
          { class: 'results-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { text: '#' }),
              h('th', { text: 'Driver' }),
              h('th', { text: 'Time' }),
              h('th', { text: 'Best lap' }),
              points ? h('th', { text: 'Pts' }) : null,
            ),
          ),
          h('tbody', {}, ...rows),
        ),
        isRace && params.difficulty === 'rival' ? this.startStudy() : null,
        h(
          'div',
          { class: 'btn-row' },
          params.championship
            ? h('button', {
                class: 'btn primary',
                text: 'Championship standings →',
                onclick: () => app.nav.championship(),
              })
            : h('button', {
                class: 'btn primary',
                text: 'Race again',
                onclick: () => app.nav.race(params),
              }),
          params.championship
            ? null
            : h('button', {
                class: 'btn',
                text: 'Setup',
                onclick: () => app.nav.setup(params.mode),
              }),
          isRace && !params.championship
            ? h('button', {
                class: 'btn',
                text: 'Train rivals',
                onclick: () => app.nav.lab(race.track.id),
              })
            : null,
          h('button', { class: 'btn', text: 'Menu', onclick: () => app.nav.menu() }),
        ),
      ),
    )
    app.ui.append(this.resultsEl)
  }

  /** Add this race's points to the active championship; returns points per finishing position. */
  private scoreChampionship(standings: ReturnType<Race['standings']>): number[] {
    const champ = getChampionship()
    const pts = standings.map((_, i) => POINTS_TABLE[i] ?? 0)
    if (!champ || champ.trackIds[champ.index] !== this.race.track.id) return pts
    standings.forEach((rc, i) => {
      champ.points[rc.entrant.id] = (champ.points[rc.entrant.id] ?? 0) + pts[i]
    })
    champ.results.push({ trackId: this.race.track.id, order: standings.map((rc) => rc.entrant.id) })
    champ.index++
    saveChampionship(champ)
    if (champ.index >= champ.trackIds.length) {
      const top = Object.keys(champ.points).sort((a, b) => champ.points[b] - champ.points[a])[0]
      if (top === 'player') grant('champion')
    }
    return pts
  }

  private awardAchievements(standings: ReturnType<Race['standings']>) {
    const { race, params } = this
    const player = race.player!
    if (params.mode !== 'race' || !player.car.finished) return
    grant('first-race')
    if (player.position !== 1) return
    grant('first-win')
    if (params.difficulty === 'legend') grant('beat-legend')
    if (params.playerStart === 'back' && params.rivals >= 3) grant('comeback')
    const second = standings[1]
    if (second?.car.finished && second.car.finishTime - player.car.finishTime < 0.3)
      grant('photo-finish')
    if (params.difficulty === 'rival' && (getRival(race.track.id)?.generation ?? 0) > 0)
      grant('rival-slayer')
    const builtin = BUILTIN_TRACKS.map((t) => t.id)
    if (recordWin(race.track.id, builtin)) grant('grand-tour')
  }

  private startStudy(): HTMLElement {
    this.study = new RivalStudy(this.race.track, this.bestLap)
    return this.study.el
  }
}
