import { grant } from '../achievements'
import { pretrainedBrains, toNets } from '../ai/pretrained'
import { TrainingSession } from '../ai/TrainingSession'
import { DT } from '../config'
import { sfx } from '../game/Audio'
import type { Track } from '../game/Track'
import {
  deleteRival,
  getRival,
  getSettings,
  saveRival,
  updateSettings,
  type RivalSave,
} from '../storage'
import type { App, Scene } from './App'
import { drawHistoryChart, drawNetwork } from './charts'
import { clear, fmtTime, h } from './dom'

type Speed = 1 | 4 | 16 | 'max'

/** Watch a population evolve on a track, tune it, and keep the result as "My Rival". */
export class LabScene implements Scene {
  private session!: TrainingSession
  private track!: Track
  private trackId: string
  private speed: Speed = 4
  private paused = false
  private fit = false
  private sensors = true
  private autosave = true
  private tickAcc = 0
  private lastSavedGen = -1
  private statsEl!: HTMLElement
  private chart!: HTMLCanvasElement
  private netCanvas!: HTMLCanvasElement
  private controlsEl!: HTMLElement
  private msgEl!: HTMLElement
  private frame = 0
  private popSize = 80
  private rate = 0.12
  private strength = 0.35

  constructor(
    private app: App,
    trackId?: string,
  ) {
    this.trackId = trackId ?? getSettings().trackId
  }

  enter() {
    this.build()
    this.loadTrack(this.trackId)
    this.app.renderer.baseZoom = 0.8
  }

  exit() {
    this.persist(true)
  }

  // ------------------------------------------------------------------ setup

  private loadTrack(id: string) {
    this.persist(true)
    this.trackId = id
    updateSettings({ trackId: id })
    const def = this.app.trackDef(id)
    this.track = this.app.getTrack(def)
    this.app.renderer.setTrack(this.track)
    const saved = getRival(id)
    this.session = new TrainingSession(
      this.track,
      { size: this.popSize, mutationRate: this.rate, mutationStrength: this.strength },
      saved,
    )
    if (saved) this.popSize = this.session.pop.brains.length
    this.lastSavedGen = this.session.generation
    this.renderControls()
    this.say(
      saved
        ? `Resumed your rival (generation ${saved.generation}).`
        : 'Fresh population of random brains. Watch them learn!',
    )
    drawHistoryChart(this.chart, this.session.pop.history)
  }

  private build() {
    this.statsEl = h('div', { class: 'stats' })
    this.chart = h('canvas', { class: 'chart' })
    this.netCanvas = h('canvas', { class: 'netviz' })
    this.controlsEl = h('div', { class: 'lab-controls' })
    this.msgEl = h('div', { class: 'lab-msg' })
    const panel = h(
      'div',
      { class: 'lab-panel panel' },
      h(
        'div',
        { class: 'screen-head' },
        h('button', { class: 'btn small', text: '← Menu', onclick: () => this.app.nav.menu() }),
        h('h1', { text: 'Training lab' }),
      ),
      this.msgEl,
      this.statsEl,
      this.controlsEl,
      h('div', { class: 'lab-label', text: 'Fitness per generation' }),
      this.chart,
    )
    const netBox = h(
      'div',
      { class: 'net-box panel' },
      h('div', { class: 'lab-label', text: 'Leader’s brain: what it senses → what it decides' }),
      this.netCanvas,
    )
    this.app.ui.append(h('div', { class: 'screen lab' }, panel, netBox))
  }

  private say(text: string) {
    this.msgEl.textContent = text
  }

  private renderControls() {
    clear(this.controlsEl)
    const seg = <T extends string | number>(
      label: string,
      values: T[],
      cur: T,
      pick: (v: T) => void,
      fmt: (v: T) => string = String,
    ) =>
      h(
        'div',
        { class: 'opt' },
        h('div', { class: 'opt-label', text: label }),
        h(
          'div',
          { class: 'seg' },
          ...values.map((v) =>
            h('button', {
              class: `seg-btn${v === cur ? ' on' : ''}`,
              text: fmt(v),
              onclick: () => {
                sfx.click()
                pick(v)
                this.renderControls()
              },
            }),
          ),
        ),
      )
    const slider = (
      label: string,
      min: number,
      max: number,
      step: number,
      val: number,
      on: (v: number) => void,
      fmt: (v: number) => string,
    ) => {
      const out = h('span', { class: 'slider-val', text: fmt(val) })
      return h(
        'div',
        { class: 'opt slider' },
        h('div', { class: 'opt-label' }, label, out),
        h('input', {
          type: 'range',
          min,
          max,
          step,
          value: val,
          oninput: (e) => {
            const v = Number((e.target as HTMLInputElement).value)
            out.textContent = fmt(v)
            on(v)
          },
        }),
      )
    }

    const trackSelect = h(
      'select',
      { class: 'select', onchange: (e) => this.loadTrack((e.target as HTMLSelectElement).value) },
      ...this.app.allTrackDefs().map((d) => {
        const o = h('option', { value: d.id, text: d.name })
        if (d.id === this.trackId) o.selected = true
        return o
      }),
    )

    this.controlsEl.append(
      h('div', { class: 'opt' }, h('div', { class: 'opt-label', text: 'Track' }), trackSelect),
      seg(
        'Speed',
        [1, 4, 16, 'max'] as Speed[],
        this.speed,
        (v) => (this.speed = v),
        (v) => (v === 'max' ? 'MAX' : `${v}×`),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn small',
          text: this.paused ? '▶ Resume' : '⏸ Pause',
          onclick: () => ((this.paused = !this.paused), this.renderControls()),
        }),
        h('button', {
          class: `btn small${this.fit ? ' on' : ''}`,
          text: this.fit ? 'Camera: whole track' : 'Camera: follow leader',
          onclick: () => ((this.fit = !this.fit), this.renderControls()),
        }),
        h('button', {
          class: `btn small${this.sensors ? ' on' : ''}`,
          text: this.sensors ? 'Sensors on' : 'Sensors off',
          onclick: () => ((this.sensors = !this.sensors), this.renderControls()),
        }),
      ),
      slider(
        'Mutation rate',
        0.02,
        0.4,
        0.01,
        this.rate,
        (v) => ((this.rate = v), this.session.setMutation(this.rate, this.strength)),
        (v) => `${Math.round(v * 100)}%`,
      ),
      slider(
        'Mutation strength',
        0.05,
        1,
        0.05,
        this.strength,
        (v) => ((this.strength = v), this.session.setMutation(this.rate, this.strength)),
        (v) => v.toFixed(2),
      ),
      slider(
        'Population (on reset)',
        20,
        200,
        10,
        this.popSize,
        (v) => (this.popSize = v),
        (v) => String(v),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn small',
          text: '↺ New population',
          onclick: () => this.resetPopulation(),
        }),
        h('button', {
          class: 'btn small',
          text: '⚡ Warm start (Pro)',
          title: 'Seed the population with the shipped Pro brains',
          onclick: () => this.warmStart(),
        }),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: this.autosave,
          onchange: (e) => (this.autosave = (e.target as HTMLInputElement).checked),
        }),
        ' Auto-save as My Rival',
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn small',
          text: '💾 Save now',
          onclick: () => this.persist(true, true),
        }),
        h('button', { class: 'btn small', text: '⬇ Export', onclick: () => this.exportRival() }),
        h('button', { class: 'btn small', text: '⬆ Import', onclick: () => this.importRival() }),
        h('button', {
          class: 'btn small danger',
          text: 'Delete save',
          onclick: () => this.deleteSave(),
        }),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn primary',
          text: '🏁 Race my rival',
          onclick: () => {
            this.persist(true, true)
            updateSettings({ difficulty: 'rival', trackId: this.trackId })
            this.app.nav.setup('race')
          },
        }),
      ),
    )
  }

  // ---------------------------------------------------------------- actions

  private resetPopulation() {
    this.session = new TrainingSession(this.track, {
      size: this.popSize,
      mutationRate: this.rate,
      mutationStrength: this.strength,
      seed: Date.now() % 100000,
    })
    this.lastSavedGen = -1
    this.say('New random population.')
    drawHistoryChart(this.chart, this.session.pop.history)
  }

  private warmStart() {
    const brains = pretrainedBrains(this.trackId, 'pro')
    if (!brains) {
      this.say('No shipped brains for this track. Train from scratch instead.')
      return
    }
    this.resetPopulation()
    this.session.seedWith(toNets(brains))
    this.say('Population seeded with the shipped Pro brains. Let them improve!')
  }

  /**
   * Save to My Rival. `explicit` = the player pressed Save (always writes); otherwise this only
   * runs when auto-save is on, and periodic calls are throttled to every few generations.
   */
  private persist(force = false, explicit = false) {
    const announce = explicit
    if (!this.session || this.session.generation === 0) return
    if (!explicit && !this.autosave) return
    if (!force && this.session.generation - this.lastSavedGen < 5) return
    if (saveRival(this.session.toSave())) {
      this.lastSavedGen = this.session.generation
      if (announce) this.say(`Saved as My Rival (generation ${this.session.generation}).`)
    } else if (announce) this.say('Could not save (browser storage full or blocked).')
  }

  private exportRival() {
    const save = this.session.toSave()
    const blob = new Blob([JSON.stringify(save)], { type: 'application/json' })
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: `rival-${this.trackId}-gen${save.generation}.json`,
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  private importRival() {
    const input = h('input', { type: 'file', accept: '.json,application/json' })
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text()) as RivalSave
        if (!data.population || !data.elites) throw new Error('not a rival file')
        data.trackId = this.trackId
        saveRival(data)
        this.loadTrack(this.trackId)
        this.say(`Imported rival (generation ${data.generation}).`)
      } catch {
        this.say('That file is not a valid rival export.')
      }
    }
    input.click()
  }

  private deleteSave() {
    deleteRival(this.trackId)
    this.lastSavedGen = this.session.generation
    this.say('Saved rival deleted. The current population keeps running until you leave.')
  }

  // ------------------------------------------------------------------ frame

  update(dt: number) {
    const { app, session } = this
    if (app.input.consume('Escape')) return app.nav.menu()
    if (app.input.consume('Space')) {
      this.paused = !this.paused
      this.renderControls()
    }

    if (!this.paused) {
      const gens0 = session.generation
      if (this.speed === 'max') {
        session.advance(1e9, performance.now() + 14)
      } else {
        this.tickAcc += (dt / DT) * this.speed
        const n = Math.min(Math.floor(this.tickAcc), 240)
        this.tickAcc -= Math.floor(this.tickAcc)
        session.advance(n)
      }
      if (session.generation !== gens0) {
        drawHistoryChart(this.chart, session.pop.history)
        this.persist()
        if (session.generation >= 25) grant('trainer')
        if (session.generation >= 100) grant('master-trainer')
      }
    }

    // draw
    const sim = session.sim
    const lead = sim.leaderIndex()
    app.renderer.mode = this.fit ? 'fit' : 'follow'
    app.renderer.follow = sim.cars[lead]
    app.renderer.draw(
      {
        track: this.track,
        cars: sim.cars.map((car, i) => ({
          car,
          simple: true,
          alpha: car.dead ? 0.1 : i === lead ? 1 : 0.55,
          tint: i === lead ? '#4dffd2' : undefined,
          showSensors: this.sensors && i === lead && !car.dead,
        })),
      },
      dt,
    )

    if ((this.frame++ & 1) === 0) {
      drawNetwork(this.netCanvas, session.pop.brains[lead] ?? null)
      this.renderStats(lead)
    }
  }

  private renderStats(lead: number) {
    const s = this.session
    const sim = s.sim
    const best = s.pop.bestEver?.fitness ?? 0
    const rows: [string, string][] = [
      ['Generation', String(s.generation)],
      ['Alive', `${sim.aliveCount} / ${sim.cars.length}`],
      ['Gen time', `${sim.time.toFixed(1)}s / ${sim.opts.maxTime.toFixed(0)}s`],
      ['Leader', `${Math.max(0, sim.cars[lead]?.distance ?? 0).toFixed(0)} u`],
      ['Best ever', `${best.toFixed(0)} u`],
      ['Best lap', fmtTime(s.bestLapEver)],
      ['Track length', `${s.track.length.toFixed(0)} u`],
      [
        'Stagnation',
        `${s.pop.stagnation} gens (+${Math.round(Math.min(s.pop.stagnation, 12) * 12)}% mutation)`,
      ],
    ]
    clear(this.statsEl)
    for (const [k, v] of rows) {
      this.statsEl.append(
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'stat-k', text: k }),
          h('span', { class: 'stat-v', text: v }),
        ),
      )
    }
  }
}
