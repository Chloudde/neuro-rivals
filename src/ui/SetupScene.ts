import { DIFFICULTIES, getRivalPool, type Difficulty } from '../ai/rivals'
import { getRecords, getRival, getSettings, updateSettings } from '../storage'
import { sfx } from '../game/Audio'
import type { App, RaceMode, Scene } from './App'
import { Attract } from './Attract'
import { clear, fmtTime, h } from './dom'
import { drawTrackPreview } from './preview'

const LAP_CHOICES = [1, 3, 5, 10]

/** Pick a circuit and the race options, then go. Also serves Time Trial (fewer options). */
export class SetupScene implements Scene {
  private attract!: Attract
  private root!: HTMLElement
  private trackList!: HTMLElement
  private options!: HTMLElement

  constructor(
    private app: App,
    private mode: RaceMode,
  ) {}

  enter() {
    const s = getSettings()
    this.attract = new Attract(this.app, s.trackId)
    this.root = h(
      'div',
      { class: 'screen setup' },
      h(
        'div',
        { class: 'screen-head' },
        h('button', { class: 'btn small', text: '← Back', onclick: () => this.app.nav.menu() }),
        h('h1', { text: this.mode === 'race' ? 'Race setup' : 'Time trial' }),
      ),
      h(
        'div',
        { class: 'setup-body' },
        (this.trackList = h('div', { class: 'track-list' })),
        (this.options = h('div', { class: 'panel options' })),
      ),
    )
    this.app.ui.append(this.root)
    this.renderTracks()
    this.renderOptions()
  }

  exit() {}

  update(dt: number) {
    this.attract.update(dt)
  }

  private renderTracks() {
    clear(this.trackList)
    const s = getSettings()
    for (const def of this.app.allTrackDefs()) {
      const track = this.app.getTrack(def)
      const rec = getRecords(def.id)
      const canvas = h('canvas', { class: 'preview' })
      // hand-drawn circuits can be broken: don't let them be raced until fixed in the editor
      const valid = !def.custom || track.validate().ok
      const card = h(
        'button',
        {
          class: `track-card${def.id === s.trackId ? ' selected' : ''}${valid ? '' : ' invalid'}`,
          onclick: () => {
            if (!valid) return this.app.nav.editor(def.id)
            sfx.click()
            updateSettings({ trackId: def.id })
            this.renderTracks()
            this.renderOptions()
          },
        },
        canvas,
        h('div', { class: 'tc-name', text: def.name + (def.custom ? '  ✎' : '') }),
        h('div', {
          class: 'tc-meta',
          text: `${'★'.repeat(def.difficulty ?? 3)}${'☆'.repeat(5 - (def.difficulty ?? 3))} · ${(track.length / 1000).toFixed(1)} km`,
        }),
        h('div', {
          class: 'tc-meta',
          text: !valid
            ? 'Layout invalid: click to fix'
            : rec.bestLap
              ? `Best lap ${fmtTime(rec.bestLap)}`
              : 'No lap set',
        }),
      )
      this.trackList.append(card)
      requestAnimationFrame(() => drawTrackPreview(canvas, track))
    }
  }

  private renderOptions() {
    clear(this.options)
    const s = getSettings()
    const def = this.app.trackDef(s.trackId)
    const isRace = this.mode === 'race'

    const choice = <T extends string | number>(
      label: string,
      values: T[],
      current: T,
      onPick: (v: T) => void,
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
              class: `seg-btn${v === current ? ' on' : ''}`,
              text: fmt(v),
              onclick: () => {
                sfx.click()
                onPick(v)
                this.renderOptions()
              },
            }),
          ),
        ),
      )

    this.options.append(
      h('h2', { text: def.name }),
      h('p', { class: 'blurb', text: def.blurb ?? 'A custom circuit.' }),
      choice('Laps', LAP_CHOICES, s.laps, (v) => updateSettings({ laps: v })),
    )

    if (isRace) {
      this.options.append(
        choice('Rivals', [1, 2, 3, 5, 7], s.rivals, (v) => updateSettings({ rivals: v })),
        choice(
          'Start',
          ['front', 'back'] as const,
          s.startPosition,
          (v) => updateSettings({ startPosition: v }),
          (v) => (v === 'front' ? 'Pole' : 'Back of grid'),
        ),
        h(
          'div',
          { class: 'opt' },
          h('div', { class: 'opt-label', text: 'Rival brains' }),
          h(
            'div',
            { class: 'diff-list' },
            ...DIFFICULTIES.map((d) => {
              const pool = getRivalPool(def.id, d.id)
              const saved = d.id === 'rival' ? getRival(def.id) : null
              const note =
                d.id === 'rival'
                  ? saved
                    ? `Generation ${saved.generation} · best lap ${fmtTime(saved.bestLap)}`
                    : 'Untrained. Starts at rookie level; train them in the Lab'
                  : pool
                    ? pool.exact
                      ? d.blurb
                      : `${d.blurb} (all-rounder brains)`
                    : 'No shipped brains for this track'
              return h(
                'button',
                {
                  class: `diff${s.difficulty === d.id ? ' on' : ''}`,
                  onclick: () => {
                    sfx.click()
                    updateSettings({ difficulty: d.id as Difficulty })
                    this.renderOptions()
                  },
                },
                h('div', { class: 'diff-name', text: d.label }),
                h('div', { class: 'diff-note', text: note }),
              )
            }),
          ),
        ),
      )
    }

    this.options.append(
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn primary big',
          text: isRace ? '🏁  Start race' : '⏱  Start time trial',
          onclick: () => this.start(),
        }),
        h('button', {
          class: 'btn',
          text: 'Train rivals',
          onclick: () => this.app.nav.lab(def.id),
        }),
      ),
    )
  }

  private start() {
    const s = getSettings()
    sfx.unlock()
    this.app.nav.race({
      mode: this.mode,
      trackId: s.trackId,
      laps: s.laps,
      rivals: s.rivals,
      difficulty: s.difficulty,
      playerStart: s.startPosition,
    })
  }
}
