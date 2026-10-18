import { Minimap } from '../game/Minimap'
import type { Race, RaceCar } from '../game/Race'
import { fmtTime, h } from './dom'

/** km/h-ish number shown on the speedometer. */
const speedToKmh = (s: number) => Math.round(Math.abs(s) * 0.7)

export class Hud {
  readonly root: HTMLElement
  private posBig = h('div', { class: 'pos-big' })
  private posOf = h('span', { class: 'pos-of' })
  private lapLine = h('div', { class: 'lap-line' })
  private timeMain = h('div', { class: 'time-main' })
  private timeSub = h('div', { class: 'time-sub' })
  private delta = h('div', { class: 'delta' })
  private board = h('div', { class: 'board' })
  private boardRows: { row: HTMLElement; dot: HTMLElement; name: HTMLElement; gap: HTMLElement }[] =
    []
  private speedNum = h('div', { class: 'speed-num' })
  private nitroFill = h('div', { class: 'nitro-fill' })
  private nitroLabel = h('div', { class: 'nitro-label', text: 'NITRO' })
  private banner = h('div', { class: 'banner' })
  private wrongWay = h('div', { class: 'wrong-way', text: 'WRONG WAY' })
  private toasts = h('div', { class: 'toasts' })
  private mapCanvas = h('canvas', { class: 'minimap' })
  readonly minimap: Minimap
  private bannerTimer = 0
  private wrongTimer = 0

  constructor(
    parent: HTMLElement,
    private race: Race,
    private timeTrial: boolean,
  ) {
    this.minimap = new Minimap(this.mapCanvas)
    this.minimap.setTrack(race.track)

    this.root = h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hud-tl' },
        h('div', { class: 'pos-line' }, this.posBig, this.posOf),
        this.lapLine,
      ),
      h('div', { class: 'hud-tc' }, this.timeMain, this.timeSub, this.delta),
      timeTrial ? null : h('div', { class: 'hud-tr' }, this.board),
      h(
        'div',
        { class: 'hud-bl' },
        h(
          'div',
          { class: 'speed' },
          this.speedNum,
          h('div', { class: 'speed-unit', text: 'KM/H' }),
        ),
        h(
          'div',
          { class: 'nitro' },
          this.nitroLabel,
          h('div', { class: 'nitro-bar' }, this.nitroFill),
        ),
      ),
      h('div', { class: 'hud-br' }, this.mapCanvas),
      this.banner,
      this.wrongWay,
      this.toasts,
    )
    parent.append(this.root)

    if (!timeTrial) {
      for (let i = 0; i < race.cars.length; i++) {
        const dot = h('span', { class: 'dot' })
        const name = h('span', { class: 'bname' })
        const gap = h('span', { class: 'bgap' })
        const row = h(
          'div',
          { class: 'brow' },
          h('span', { class: 'bpos', text: String(i + 1) }),
          dot,
          name,
          gap,
        )
        this.board.append(row)
        this.boardRows.push({ row, dot, name, gap })
      }
    }
  }

  /** Big centre-screen message. */
  say(text: string, kind: 'go' | 'count' | 'info' | 'good' = 'info', ms = 1400) {
    this.banner.textContent = text
    this.banner.className = `banner show ${kind}`
    this.bannerTimer = ms / 1000
  }

  /** Live time difference to your best lap (negative = ahead). Pass null to hide. */
  setDelta(sec: number | null) {
    if (sec === null) {
      this.delta.textContent = ''
      return
    }
    this.delta.textContent = `${sec <= 0 ? '−' : '+'}${Math.abs(sec).toFixed(2)}`
    this.delta.className = `delta ${sec <= 0 ? 'ahead' : 'behind'}`
  }

  /** Small corner notification. */
  toast(text: string, color?: string) {
    const el = h('div', { class: 'toast', text })
    if (color) el.style.borderLeftColor = color
    this.toasts.append(el)
    setTimeout(() => el.classList.add('out'), 3200)
    setTimeout(() => el.remove(), 3700)
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove()
  }

  update(dt: number, player: RaceCar | undefined, best: number | null, last: number | null) {
    const race = this.race
    const order = race.standings()
    const total = race.cars.length

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt
      if (this.bannerTimer <= 0) this.banner.className = 'banner'
    }

    if (player) {
      const c = player.car
      this.posBig.textContent = this.timeTrial ? 'TT' : String(player.position)
      this.posOf.textContent = this.timeTrial ? '' : `/${total}`
      this.lapLine.textContent = `LAP ${Math.min(race.laps, c.lap)}/${race.laps}`
      const lapT = race.state === 'countdown' ? 0 : c.lapsCompleted >= 1 ? c.lapTime : race.time
      this.timeMain.textContent = fmtTime(
        race.state === 'finished' || c.finished ? c.finishTime : lapT,
      )
      this.timeSub.textContent = `BEST ${fmtTime(best)}   LAST ${fmtTime(last)}`
      this.speedNum.textContent = String(speedToKmh(c.speed))
      this.nitroFill.style.width = `${Math.round(c.nitro * 100)}%`
      this.nitroFill.classList.toggle('on', c.nitroActive)
      this.nitroFill.classList.toggle('low', c.nitro < 0.2)

      // wrong-way warning
      const err = Math.abs(race.track.headingError(c.trackIndex, c.angle))
      const wrong = err > 2.0 && c.speed > 30 && race.state === 'racing' && !c.finished
      this.wrongTimer = wrong ? this.wrongTimer + dt : 0
      this.wrongWay.classList.toggle('show', this.wrongTimer > 0.6)
    } else {
      this.root.classList.add('spectate')
    }

    if (this.boardRows.length) {
      const leader = order[0]
      order.forEach((rc, i) => {
        const r = this.boardRows[i]
        r.dot.style.background = rc.entrant.color
        r.name.textContent = rc.isPlayer ? `${rc.entrant.name} ★` : rc.entrant.name
        r.row.classList.toggle('me', rc.isPlayer)
        if (rc.car.finished) r.gap.textContent = i === 0 ? fmtTime(rc.car.finishTime, 2) : '🏁'
        else if (i === 0) r.gap.textContent = `L${Math.min(race.laps, rc.car.lap)}`
        else {
          const gap = (leader.car.distance - rc.car.distance) / Math.max(180, leader.car.speed)
          r.gap.textContent = leader.car.finished ? '' : `+${gap.toFixed(1)}`
        }
      })
    }

    this.minimap.draw(
      race.cars.map((rc) => ({ car: rc.car, color: rc.entrant.color, isPlayer: rc.isPlayer })),
    )
  }

  destroy() {
    this.root.remove()
  }
}
