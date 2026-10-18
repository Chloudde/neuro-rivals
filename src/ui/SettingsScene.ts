import { sfx } from '../game/Audio'
import { ACHIEVEMENTS } from '../achievements'
import { CAR_CLASSES, DEFAULT_SPEC } from '../game/Car'
import { clamp } from '../game/math'
import {
  getAchievements,
  getRecords,
  getRival,
  getSettings,
  remove,
  updateSettings,
} from '../storage'
import type { App, Scene } from './App'
import { Attract } from './Attract'
import { clear, fmtTime, h } from './dom'

const COLORS = [
  '#ff4d4d',
  '#ff8f4d',
  '#ffd24d',
  '#4dff9a',
  '#4dffd2',
  '#4da6ff',
  '#8f6bff',
  '#ff6bb5',
  '#f2f2f2',
  '#2b2f3a',
]
type Tab = 'garage' | 'settings' | 'records' | 'help'
const TABS: [Tab, string][] = [
  ['garage', 'Garage'],
  ['settings', 'Settings'],
  ['records', 'Records'],
  ['help', 'How to play'],
]

export class SettingsScene implements Scene {
  private attract!: Attract
  private body!: HTMLElement
  private tabs!: HTMLElement
  private tab: Tab

  constructor(
    private app: App,
    tab?: string,
  ) {
    this.tab = (TABS.find(([id]) => id === tab)?.[0] as Tab) ?? 'garage'
  }

  enter() {
    this.attract = new Attract(this.app)
    this.body = h('div', { class: 'tab-body' })
    this.tabs = h('div', { class: 'tabs' })
    this.app.ui.append(
      h(
        'div',
        { class: 'screen settings' },
        h(
          'div',
          { class: 'panel wide' },
          h(
            'div',
            { class: 'screen-head' },
            h('button', { class: 'btn small', text: '← Back', onclick: () => this.app.nav.menu() }),
            h('h1', { text: 'Garage & settings' }),
          ),
          this.tabs,
          this.body,
        ),
      ),
    )
    this.render()
  }

  exit() {}

  update(dt: number) {
    this.attract.update(dt)
  }

  private render() {
    clear(this.tabs)
    for (const [id, label] of TABS) {
      this.tabs.append(
        h('button', {
          class: `tab${id === this.tab ? ' on' : ''}`,
          text: label,
          onclick: () => ((this.tab = id), this.render()),
        }),
      )
    }
    clear(this.body)
    if (this.tab === 'garage') this.garage()
    else if (this.tab === 'settings') this.settings()
    else if (this.tab === 'records') this.records()
    else this.help()
  }

  // ------------------------------------------------------------------ tabs

  private garage() {
    const s = getSettings()
    const preview = h('canvas', { class: 'car-preview', width: 220, height: 120 })
    const drawPreview = () => {
      const ctx = preview.getContext('2d')!
      ctx.clearRect(0, 0, 220, 120)
      ctx.save()
      ctx.translate(110, 60)
      ctx.scale(2.6, 2.6)
      drawCarShape(ctx, getSettings().carColor)
      ctx.restore()
    }
    this.body.append(
      h(
        'div',
        { class: 'garage' },
        preview,
        h(
          'div',
          { class: 'garage-form' },
          h(
            'div',
            { class: 'opt' },
            h('div', { class: 'opt-label', text: 'Driver name' }),
            h('input', {
              class: 'text',
              type: 'text',
              value: s.playerName,
              oninput: (e) =>
                updateSettings({
                  playerName: (e.target as HTMLInputElement).value.slice(0, 14) || 'You',
                }),
            }),
          ),
          h(
            'div',
            { class: 'opt' },
            h('div', { class: 'opt-label', text: 'Chassis' }),
            h(
              'div',
              { class: 'class-list' },
              ...CAR_CLASSES.map((c) => {
                const spec = { ...DEFAULT_SPEC, ...c.spec }
                const bar = (label: string, frac: number) =>
                  h(
                    'div',
                    { class: 'stat-bar' },
                    h('span', { text: label }),
                    h(
                      'div',
                      { class: 'sb-track' },
                      h('div', {
                        class: 'sb-fill',
                        style: `width:${Math.round(clamp(frac, 0, 1) * 100)}%`,
                      }),
                    ),
                  )
                return h(
                  'button',
                  {
                    class: `class-card${c.id === s.carClass ? ' on' : ''}`,
                    onclick: () => {
                      sfx.click()
                      updateSettings({ carClass: c.id })
                      this.render()
                    },
                  },
                  h('div', { class: 'diff-name', text: c.label }),
                  h('div', { class: 'diff-note', text: c.blurb }),
                  bar('Speed', (spec.maxSpeed - 340) / 130),
                  bar('Accel', (spec.accel - 300) / 160),
                  bar('Grip', (spec.grip - 3.5) / 5.5),
                )
              }),
            ),
          ),
          h(
            'div',
            { class: 'opt' },
            h('div', { class: 'opt-label', text: 'Car colour' }),
            h(
              'div',
              { class: 'swatches' },
              ...COLORS.map((c) =>
                h('button', {
                  class: `swatch${c === s.carColor ? ' on' : ''}`,
                  style: `background:${c}`,
                  onclick: () => {
                    sfx.click()
                    updateSettings({ carColor: c })
                    this.render()
                  },
                }),
              ),
            ),
          ),
        ),
      ),
    )
    drawPreview()
  }

  private settings() {
    const s = getSettings()
    const toggle = (label: string, on: boolean, set: (v: boolean) => void) =>
      h(
        'label',
        { class: 'check row' },
        h('input', {
          type: 'checkbox',
          checked: on,
          onchange: (e) => set((e.target as HTMLInputElement).checked),
        }),
        ' ' + label,
      )

    const vol = h('span', { class: 'slider-val', text: `${Math.round(s.volume * 100)}%` })
    this.body.append(
      h(
        'div',
        { class: 'opt slider' },
        h('div', { class: 'opt-label' }, 'Volume', vol),
        h('input', {
          type: 'range',
          min: 0,
          max: 1,
          step: 0.05,
          value: s.volume,
          oninput: (e) => {
            const v = Number((e.target as HTMLInputElement).value)
            vol.textContent = `${Math.round(v * 100)}%`
            sfx.setVolume(v)
            updateSettings({ volume: v })
          },
          onchange: () => sfx.beep(660, 0.1, 'triangle'),
        }),
      ),
      toggle('Mute (M)', s.muted, (v) => (sfx.setMuted(v), updateSettings({ muted: v }))),
      toggle('Night racing: headlights only (N in a race)', s.night, (v) =>
        updateSettings({ night: v }),
      ),
      toggle('Screen shake on impacts', s.screenShake, (v) => updateSettings({ screenShake: v })),
      toggle('Show your best-lap ghost (G)', s.showGhost, (v) => updateSettings({ showGhost: v })),
      h(
        'div',
        { class: 'opt' },
        h('div', { class: 'opt-label', text: 'Sensor overlay (V in a race)' }),
        h(
          'div',
          { class: 'seg' },
          ...(['Off', 'My car', 'Every car'] as const).map((label, i) =>
            h('button', {
              class: `seg-btn${s.sensorMode === i ? ' on' : ''}`,
              text: label,
              onclick: () => {
                updateSettings({ sensorMode: i as 0 | 1 | 2 })
                this.render()
              },
            }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'opt' },
        h('div', { class: 'opt-label', text: 'Danger zone' }),
        h('button', {
          class: 'btn small danger',
          text: 'Erase all records, ghosts, rivals and tracks',
          onclick: () => {
            if (!confirm('Erase ALL saved data? This cannot be undone.')) return
            for (const key of Object.keys(localStorage))
              if (key.startsWith('neuro-rivals:')) localStorage.removeItem(key)
            location.reload()
          },
        }),
      ),
    )
  }

  private records() {
    const rows = this.app.allTrackDefs().map((def) => {
      const r = getRecords(def.id)
      const rival = getRival(def.id)
      const best = r.bestRace
        ? Object.entries(r.bestRace)
            .map(([laps, t]) => `${laps}L ${fmtTime(t)}`)
            .join(' · ')
        : '—'
      return h(
        'tr',
        {},
        h('td', { text: def.name }),
        h('td', { text: fmtTime(r.bestLap) }),
        h('td', { text: best }),
        h('td', { text: `${r.wins}/${r.races}` }),
        h('td', { text: rival ? `gen ${rival.generation}` : '—' }),
        h(
          'td',
          {},
          h('button', {
            class: 'btn tiny',
            text: 'reset',
            onclick: () => (remove(`records:${def.id}`), remove(`ghost:${def.id}`), this.render()),
          }),
        ),
      )
    })
    const earned = getAchievements()
    this.body.append(
      h(
        'table',
        { class: 'results-table' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ...['Track', 'Best lap', 'Best races', 'Wins', 'My rival', ''].map((t) =>
              h('th', { text: t }),
            ),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
      h('h3', {
        class: 'ach-head',
        text: `Achievements ${Object.keys(earned).length}/${ACHIEVEMENTS.length}`,
      }),
      h(
        'div',
        { class: 'ach-grid' },
        ...ACHIEVEMENTS.map((a) =>
          h(
            'div',
            { class: `ach${earned[a.id] ? ' got' : ''}` },
            h('div', { class: 'ach-icon', text: earned[a.id] ? a.icon : '🔒' }),
            h(
              'div',
              {},
              h('div', { class: 'ach-title', text: a.title }),
              h('div', { class: 'ach-desc', text: a.desc }),
            ),
          ),
        ),
      ),
    )
  }

  private help() {
    this.body.append(
      h(
        'div',
        { class: 'help' },
        h('h3', { text: 'Driving' }),
        h(
          'table',
          { class: 'keys' },
          ...[
            ['W / ↑', 'Throttle'],
            ['S / ↓', 'Brake / reverse'],
            ['A D / ← →', 'Steer'],
            ['Shift / Space', 'Nitro boost (meter refills over time)'],
            ['R', 'Put your car back on the road'],
            ['V', 'Cycle sensor overlay: off / yours / everyone’s'],
            ['G', 'Toggle best-lap ghost'],
            ['N', 'Toggle night mode'],
            ['Esc', 'Pause'],
            ['M', 'Mute'],
          ].map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: v }))),
        ),
        h('p', {
          text: 'Gamepads work too: left stick steers, RT/LT throttle and brake, A or RB for nitro, Y recovers, Start pauses. On a phone you get on-screen buttons.',
        }),
        h('h3', { text: 'How the AI works' }),
        h('p', {
          text: 'Every rival is a small neural network with 12 inputs: nine distance sensors fanned in front of the car, plus its speed, sideways slip and nitro charge. Three outputs drive the car: gas/brake, steering and nitro.',
        }),
        h('p', {
          text: 'Nobody told them how to drive. Each generation, a population of random brains races; the ones that get furthest breed (crossover plus mutation) and the rest are discarded. Repeat a few hundred times and they learn the circuit.',
        }),
        h('p', {
          text: 'Rookie, Pro and Legend are snapshots of that evolution at different stages. “My Rival” is the population YOU train in the Lab. It keeps evolving after each race you run against it, trying to beat your best lap.',
        }),
      ),
    )
  }
}

/** The same silhouette the game renderer uses, scaled up for the garage preview. */
function drawCarShape(ctx: CanvasRenderingContext2D, color: string) {
  const hl = 17
  const hw = 9
  ctx.fillStyle = '#0c0c0e'
  for (const [wx, wy] of [
    [hl * 0.5, -hw - 0.5],
    [hl * 0.5, hw + 0.5],
    [-hl * 0.5, -hw - 0.5],
    [-hl * 0.5, hw + 0.5],
  ])
    ctx.fillRect(wx - 5, wy - 2, 10, 4)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(-hl - 1, -hw - 1, 4, hw * 2 + 2)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-hl, -hw * 0.75)
  ctx.lineTo(hl * 0.25, -hw)
  ctx.lineTo(hl * 0.75, -hw * 0.55)
  ctx.lineTo(hl, -hw * 0.22)
  ctx.lineTo(hl, hw * 0.22)
  ctx.lineTo(hl * 0.75, hw * 0.55)
  ctx.lineTo(hl * 0.25, hw)
  ctx.lineTo(-hl, hw * 0.75)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(-hl * 0.7, -1.4, hl * 1.55, 2.8)
  ctx.fillStyle = '#10131a'
  ctx.beginPath()
  ctx.ellipse(-hl * 0.05, 0, hl * 0.3, hw * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
}
