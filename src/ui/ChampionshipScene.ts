import {
  DIFFICULTIES,
  getRivalPool,
  RIVAL_COLORS,
  RIVAL_NAMES,
  type Difficulty,
} from '../ai/rivals'
import { sfx } from '../game/Audio'
import { BUILTIN_TRACKS } from '../game/tracks'
import {
  getChampionship,
  getSettings,
  saveChampionship,
  updateSettings,
  type Championship,
} from '../storage'
import type { App, Scene } from './App'
import { Attract } from './Attract'
import { clear, h, ordinal } from './dom'

/** Standings table + "next race" for a multi-race series with points. */
export class ChampionshipScene implements Scene {
  private attract!: Attract
  private root!: HTMLElement
  private draft = { laps: 3, rivals: 5, difficulty: 'pro' as Difficulty, rounds: 5 }

  constructor(private app: App) {}

  enter() {
    const s = getSettings()
    this.draft.difficulty = s.difficulty
    this.draft.rivals = Math.max(3, s.rivals)
    this.attract = new Attract(this.app)
    this.root = h('div', { class: 'screen settings' })
    this.app.ui.append(this.root)
    this.render()
  }

  exit() {}

  update(dt: number) {
    this.attract.update(dt)
  }

  private render() {
    clear(this.root)
    const champ = getChampionship()
    const panel = h(
      'div',
      { class: 'panel wide' },
      h(
        'div',
        { class: 'screen-head' },
        h('button', { class: 'btn small', text: '← Back', onclick: () => this.app.nav.menu() }),
        h('h1', { text: 'Championship' }),
      ),
    )
    panel.append(champ ? this.standings(champ) : this.setup())
    this.root.append(panel)
  }

  // ------------------------------------------------------------------ setup

  private setup(): HTMLElement {
    const d = this.draft
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
              onclick: () => (sfx.click(), pick(v), this.render()),
            }),
          ),
        ),
      )
    return h(
      'div',
      {},
      h('p', {
        class: 'blurb',
        text: 'Race a season across the circuits. Points go to the top eight each round (25-18-15-12-10-8-6-4). Most points after the final round wins the title.',
      }),
      seg(
        'Rounds',
        [3, 5],
        d.rounds,
        (v) => (d.rounds = v),
        (v) => `${v} circuits`,
      ),
      seg('Laps per race', [2, 3, 5], d.laps, (v) => (d.laps = v)),
      seg('Rivals', [3, 5, 7], d.rivals, (v) => (d.rivals = v)),
      seg(
        'Rival brains',
        DIFFICULTIES.map((x) => x.id as Difficulty),
        d.difficulty,
        (v) => (d.difficulty = v),
        (v) => DIFFICULTIES.find((x) => x.id === v)!.label,
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn primary big',
          text: '🏆 Start championship',
          onclick: () => this.begin(),
        }),
      ),
    )
  }

  private begin() {
    const d = this.draft
    // easiest circuits first, so the title fight gets harder as it goes
    const tracks = [...BUILTIN_TRACKS]
      .filter((t) => getRivalPool(t.id, d.difficulty === 'rival' ? 'rookie' : d.difficulty))
      .sort((a, b) => (a.difficulty ?? 3) - (b.difficulty ?? 3))
      .slice(0, d.rounds)
    if (!tracks.length) return
    const s = getSettings()
    const drivers: Championship['drivers'] = { player: { name: s.playerName, color: s.carColor } }
    const points: Record<string, number> = { player: 0 }
    for (let i = 0; i < d.rivals; i++) {
      drivers[`ai${i}`] = {
        name: RIVAL_NAMES[i % RIVAL_NAMES.length],
        color: RIVAL_COLORS[i % RIVAL_COLORS.length],
      }
      points[`ai${i}`] = 0
    }
    const champ: Championship = {
      trackIds: tracks.map((t) => t.id),
      index: 0,
      laps: d.laps,
      rivals: d.rivals,
      difficulty: d.difficulty,
      points,
      drivers,
      results: [],
    }
    saveChampionship(champ)
    this.render()
  }

  // -------------------------------------------------------------- standings

  private standings(champ: Championship): HTMLElement {
    const done = champ.index >= champ.trackIds.length
    const order = Object.keys(champ.points).sort((a, b) => champ.points[b] - champ.points[a])
    const playerRank = order.indexOf('player') + 1
    const nextId = champ.trackIds[champ.index]
    const nextName = nextId ? this.app.trackDef(nextId).name : ''

    const rows = order.map((id, i) =>
      h(
        'tr',
        { class: id === 'player' ? 'me' : '' },
        h('td', { text: String(i + 1) }),
        h(
          'td',
          {},
          h('span', { class: 'dot', style: `background:${champ.drivers[id].color}` }),
          ' ',
          champ.drivers[id].name,
        ),
        ...champ.results.map((r) => {
          const pos = r.order.indexOf(id)
          return h('td', { text: pos < 0 ? '–' : String(pos + 1) })
        }),
        h('td', { class: 'pts', text: String(champ.points[id]) }),
      ),
    )

    const rounds = champ.trackIds.map((tid, i) =>
      h('th', {
        class: i === champ.index && !done ? 'cur' : '',
        title: this.app.trackDef(tid).name,
        text: `R${i + 1}`,
      }),
    )

    return h(
      'div',
      {},
      done
        ? h(
            'div',
            { class: `champ-banner${playerRank === 1 ? ' gold' : ''}` },
            playerRank === 1
              ? '🏆 YOU ARE THE CHAMPION!'
              : `Season over. You finished ${ordinal(playerRank)}.`,
          )
        : h('div', {
            class: 'blurb',
            text: `Round ${champ.index + 1} of ${champ.trackIds.length}: ${nextName} · ${champ.laps} laps · ${DIFFICULTIES.find((d) => d.id === champ.difficulty)?.label} rivals`,
          }),
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
            ...rounds,
            h('th', { text: 'Pts' }),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
      h(
        'div',
        { class: 'btn-row' },
        done
          ? h('button', {
              class: 'btn primary',
              text: 'New championship',
              onclick: () => (saveChampionship(null), this.render()),
            })
          : h('button', {
              class: 'btn primary big',
              text: `▶ Race round ${champ.index + 1}`,
              onclick: () => this.race(champ),
            }),
        done
          ? null
          : h('button', {
              class: 'btn danger',
              text: 'Abandon',
              onclick: () =>
                confirm('Abandon this championship?') && (saveChampionship(null), this.render()),
            }),
      ),
    )
  }

  private race(champ: Championship) {
    const s = getSettings()
    updateSettings({ trackId: champ.trackIds[champ.index] })
    this.app.nav.race({
      mode: 'race',
      trackId: champ.trackIds[champ.index],
      laps: champ.laps,
      rivals: champ.rivals,
      difficulty: champ.difficulty,
      playerStart: s.startPosition,
      championship: true,
    })
  }
}
