import { sfx } from '../game/Audio'
import { clamp, pointToSegment, type Vec2 } from '../game/math'
import { Track, type TrackDef, type TrackReport } from '../game/Track'
import { getCustomTracks, getSettings, saveCustomTracks, updateSettings } from '../storage'
import type { App, Scene } from './App'
import { clear, h } from './dom'

const SNAP = 50

function defaultOval(): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: 700, y: -100 },
    { x: 1300, y: 0 },
    { x: 1600, y: 450 },
    { x: 1300, y: 900 },
    { x: 700, y: 1000 },
    { x: 0, y: 900 },
    { x: -300, y: 450 },
  ]
}

/** Draw your own circuit: click to add points, drag to move, right-click a point to remove it. */
export class EditorScene implements Scene {
  private def!: TrackDef
  private track!: Track
  private report!: TrackReport
  private customs: TrackDef[] = []
  private drag: { index: number } | null = null
  private pan: {
    x: number
    y: number
    camX: number
    camY: number
    moved: boolean
    hitIndex: number
  } | null = null
  private hover = -1
  private snap = true
  private panel!: HTMLElement
  private saveFlash = 0
  private validateTimer = 0
  private cleanups: (() => void)[] = []

  constructor(
    private app: App,
    private trackId?: string,
  ) {}

  enter() {
    this.customs = getCustomTracks()
    const found = this.trackId
      ? this.app.allTrackDefs().find((t) => t.id === this.trackId)
      : undefined
    if (found?.custom) this.def = structuredClone(found)
    else if (found) {
      this.def = {
        ...structuredClone(found),
        id: this.newId(),
        name: `${found.name} (copy)`,
        custom: true,
      }
    } else this.def = this.blank()

    this.panel = h('div', { class: 'editor-panel panel' })
    this.app.ui.append(h('div', { class: 'screen editor' }, this.panel))
    this.app.renderer.mode = 'free'
    this.app.renderer.baseZoom = 0.3
    this.rebuild(true)
    this.fitCamera()
    this.renderPanel()
    this.bindPointer()
  }

  exit() {
    for (const c of this.cleanups) c()
    this.cleanups = []
    this.save()
    this.app.renderer.mode = 'follow'
  }

  private newId() {
    return `custom-${Date.now().toString(36)}`
  }

  private blank(): TrackDef {
    return {
      id: this.newId(),
      name: 'My circuit',
      points: defaultOval(),
      width: 160,
      custom: true,
      difficulty: 3,
      blurb: 'A circuit you drew.',
    }
  }

  // ------------------------------------------------------------------ model

  private rebuild(validate: boolean) {
    // Track construction is cheap; validation is O(n²), so it's throttled while dragging
    this.track = new Track(this.def)
    this.app.renderer.setTrack(this.track, false)
    if (validate) this.report = this.track.validate()
  }

  private save() {
    if (!this.def || this.def.points.length < 4) return
    const list = getCustomTracks()
    const i = list.findIndex((t) => t.id === this.def.id)
    if (i >= 0) list[i] = this.def
    else list.push(this.def)
    saveCustomTracks(list)
    this.customs = list
    this.saveFlash = 1.2
  }

  private fitCamera() {
    const r = this.app.renderer
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of this.def.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    r.cam.x = (minX + maxX) / 2
    r.cam.y = (minY + maxY) / 2
    const panelW = 340
    r.cam.zoom = clamp(
      Math.min(
        (window.innerWidth - panelW - 120) / (maxX - minX || 1),
        (window.innerHeight - 120) / (maxY - minY || 1),
      ),
      0.08,
      1.2,
    )
    // shift the view so the track sits right of the panel
    r.cam.x -= panelW / 2 / r.cam.zoom
  }

  // ------------------------------------------------------------------ input

  private pick(world: Vec2): number {
    const r = 16 / this.app.renderer.cam.zoom
    let best = -1
    let bestD = r
    this.def.points.forEach((p, i) => {
      const d = Math.hypot(p.x - world.x, p.y - world.y)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  private snapPt(p: Vec2): Vec2 {
    return this.snap ? { x: Math.round(p.x / SNAP) * SNAP, y: Math.round(p.y / SNAP) * SNAP } : p
  }

  private bindPointer() {
    const c = this.app.canvas
    const world = (e: PointerEvent | MouseEvent) =>
      this.app.renderer.screenToWorld(e.clientX, e.clientY)

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.panel')) return
      const w = world(e)
      const hit = this.pick(w)
      if (e.button === 0 && !e.shiftKey) {
        if (hit >= 0) {
          this.drag = { index: hit }
        } else this.addPoint(w)
      } else {
        // right / middle / shift-drag: pan; a still right-click on a point deletes it
        this.pan = {
          x: e.clientX,
          y: e.clientY,
          camX: this.app.renderer.cam.x,
          camY: this.app.renderer.cam.y,
          moved: false,
          hitIndex: e.button === 2 ? hit : -1,
        }
      }
      c.setPointerCapture?.(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const w = world(e)
      if (this.drag) {
        const p = this.snapPt(w)
        this.def.points[this.drag.index] = p
        this.rebuild(false)
        this.validateTimer = 0.15
      } else if (this.pan) {
        const z = this.app.renderer.cam.zoom
        const dx = e.clientX - this.pan.x
        const dy = e.clientY - this.pan.y
        if (Math.abs(dx) + Math.abs(dy) > 4) this.pan.moved = true
        this.app.renderer.cam.x = this.pan.camX - dx / z
        this.app.renderer.cam.y = this.pan.camY - dy / z
      } else {
        this.hover = this.pick(w)
      }
    }
    const up = () => {
      if (this.drag) {
        this.drag = null
        this.rebuild(true)
        this.save()
        this.renderPanel()
      }
      if (this.pan) {
        if (!this.pan.moved && this.pan.hitIndex >= 0) this.removePoint(this.pan.hitIndex)
        this.pan = null
      }
    }
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.panel')) return
      e.preventDefault()
      const r = this.app.renderer
      const before = r.screenToWorld(e.clientX, e.clientY)
      r.cam.zoom = clamp(r.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.06, 2)
      const after = r.screenToWorld(e.clientX, e.clientY)
      r.cam.x += before.x - after.x
      r.cam.y += before.y - after.y
    }
    const ctx = (e: Event) => e.preventDefault()

    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('wheel', wheel, { passive: false })
    c.addEventListener('contextmenu', ctx)
    this.cleanups.push(() => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('wheel', wheel)
      c.removeEventListener('contextmenu', ctx)
    })
  }

  private addPoint(w: Vec2) {
    const p = this.snapPt(w)
    const pts = this.def.points
    // insert after the control-polygon edge nearest the click
    let bestI = pts.length - 1
    let bestD = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = pointToSegment(p, pts[i], pts[(i + 1) % pts.length]).dist
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    pts.splice(bestI + 1, 0, p)
    sfx.click()
    this.rebuild(true)
    this.save()
    this.renderPanel()
  }

  private removePoint(i: number) {
    if (this.def.points.length <= 4) {
      this.flash('A track needs at least 4 points.')
      return
    }
    this.def.points.splice(i, 1)
    sfx.click()
    this.rebuild(true)
    this.save()
    this.renderPanel()
  }

  private flash(msg: string) {
    const el = this.panel.querySelector('.editor-msg')
    if (el) el.textContent = msg
  }

  // ------------------------------------------------------------------ panel

  private renderPanel() {
    clear(this.panel)
    const r = this.report
    const status = r.ok
      ? h('div', {
          class: 'valid ok',
          text: `✔ Valid · ${(r.length / 1000).toFixed(1)} km · tightest bend ${Math.round(r.minRadius)}u`,
        })
      : h('div', { class: 'valid bad' }, ...r.issues.map((i) => h('div', { text: '✖ ' + i })))

    this.panel.append(
      h(
        'div',
        { class: 'screen-head' },
        h('button', { class: 'btn small', text: '← Menu', onclick: () => this.app.nav.menu() }),
        h('h1', { text: 'Track editor' }),
      ),
      h(
        'div',
        { class: 'opt' },
        h('div', { class: 'opt-label', text: 'Name' }),
        h('input', {
          class: 'text',
          type: 'text',
          value: this.def.name,
          oninput: (e) => {
            this.def.name = (e.target as HTMLInputElement).value.slice(0, 28) || 'Untitled'
            this.save()
          },
        }),
      ),
      h(
        'div',
        { class: 'opt slider' },
        h(
          'div',
          { class: 'opt-label' },
          'Width',
          h('span', { class: 'slider-val', text: String(this.def.width) }),
        ),
        h('input', {
          type: 'range',
          min: 100,
          max: 240,
          step: 5,
          value: this.def.width,
          oninput: (e) => {
            this.def.width = Number((e.target as HTMLInputElement).value)
            ;(e.target as HTMLElement).previousElementSibling!.lastElementChild!.textContent =
              String(this.def.width)
            this.rebuild(false)
            this.validateTimer = 0.15
          },
          onchange: () => {
            this.rebuild(true)
            this.save()
            this.renderPanel()
          },
        }),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: this.snap,
          onchange: (e) => (this.snap = (e.target as HTMLInputElement).checked),
        }),
        ` Snap to ${SNAP}u grid`,
      ),
      status,
      h('div', { class: 'editor-msg hint' }),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn primary',
          text: '▶ Test drive',
          disabled: !r.ok,
          onclick: () =>
            this.go(() =>
              this.app.nav.race({
                mode: 'timetrial',
                trackId: this.def.id,
                laps: 2,
                rivals: 0,
                difficulty: 'pro',
                playerStart: 'front',
              }),
            ),
        }),
        h('button', {
          class: 'btn',
          text: '🧠 Train rivals',
          disabled: !r.ok,
          onclick: () => this.go(() => this.app.nav.lab(this.def.id)),
        }),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn small',
          text: '＋ New',
          onclick: () => this.switchTo(this.blank()),
        }),
        h('button', {
          class: 'btn small',
          text: '⧉ Copy',
          onclick: () =>
            this.switchTo({
              ...structuredClone(this.def),
              id: this.newId(),
              name: `${this.def.name} (copy)`,
            }),
        }),
        h('button', { class: 'btn small', text: '⬇ Export', onclick: () => this.exportTrack() }),
        h('button', { class: 'btn small', text: '⬆ Import', onclick: () => this.importTrack() }),
      ),
      h('div', { class: 'lab-label', text: 'Your circuits' }),
      h(
        'div',
        { class: 'custom-list' },
        ...this.customs.map((t) =>
          h(
            'div',
            { class: `custom-item${t.id === this.def.id ? ' on' : ''}` },
            h('button', {
              class: 'ci-name',
              text: t.name,
              onclick: () => this.switchTo(structuredClone(t), false),
            }),
            h('button', {
              class: 'ci-del',
              text: '🗑',
              title: 'Delete',
              onclick: () => this.deleteTrack(t.id),
            }),
          ),
        ),
        this.customs.length
          ? null
          : h('div', { class: 'hint', text: 'Nothing saved yet. Edits auto-save.' }),
      ),
      h(
        'div',
        { class: 'editor-help' },
        h('div', { text: '🖱 Click: add point · Drag: move point' }),
        h('div', { text: 'Right-click point: delete · Right-drag/Shift-drag: pan · Wheel: zoom' }),
        h('div', {
          text: 'Point 1 (green) is the start line; the arrow shows the direction of travel.',
        }),
      ),
    )
  }

  private go(fn: () => void) {
    this.rebuild(true)
    if (!this.report.ok) return
    this.save()
    updateSettings({ trackId: this.def.id })
    fn()
  }

  private switchTo(def: TrackDef, saveCurrent = true) {
    if (saveCurrent) this.save()
    this.def = def
    this.def.custom = true
    this.rebuild(true)
    this.fitCamera()
    if (saveCurrent) this.save()
    this.renderPanel()
  }

  private deleteTrack(id: string) {
    const list = getCustomTracks().filter((t) => t.id !== id)
    saveCustomTracks(list)
    this.customs = list
    if (this.def.id === id) {
      this.def = this.customs[0] ? structuredClone(this.customs[0]) : this.blank()
      this.rebuild(true)
      this.fitCamera()
      if (!this.customs.length) this.save()
    }
    if (getSettings().trackId === id) updateSettings({ trackId: 'neon-loop' })
    this.renderPanel()
  }

  private exportTrack() {
    const blob = new Blob([JSON.stringify(this.def, null, 2)], { type: 'application/json' })
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: `${this.def.name.replace(/\W+/g, '-').toLowerCase()}.track.json`,
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  private importTrack() {
    const input = h('input', { type: 'file', accept: '.json,application/json' })
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const d = JSON.parse(await f.text()) as TrackDef
        if (
          !Array.isArray(d.points) ||
          d.points.length < 4 ||
          !d.points.every((p) => isFinite(p.x) && isFinite(p.y))
        ) {
          throw new Error('bad track')
        }
        this.switchTo({
          id: this.newId(),
          name: String(d.name ?? 'Imported').slice(0, 28),
          points: d.points,
          width: clamp(Number(d.width) || 160, 100, 240),
          custom: true,
          difficulty: d.difficulty ?? 3,
          blurb: d.blurb,
        })
      } catch {
        this.flash('That file is not a valid track.')
      }
    }
    input.click()
  }

  // ------------------------------------------------------------------ frame

  update(dt: number) {
    if (this.validateTimer > 0) {
      this.validateTimer -= dt
      if (this.validateTimer <= 0 && !this.drag) {
        this.report = this.track.validate()
        this.renderPanel()
      }
    }
    if (this.saveFlash > 0) this.saveFlash -= dt

    const pts = this.def.points
    this.app.renderer.draw(
      {
        track: this.track,
        cars: [],
        overlay: (ctx, zoom) => {
          ctx.lineWidth = 2 / zoom
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.setLineDash([10 / zoom, 8 / zoom])
          ctx.beginPath()
          pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
          ctx.closePath()
          ctx.stroke()
          ctx.setLineDash([])

          // direction arrow at the start
          const s = this.track.start
          ctx.save()
          ctx.translate(s.pos.x, s.pos.y)
          ctx.rotate(s.angle)
          ctx.fillStyle = '#4dffd2'
          const a = 34 / zoom
          ctx.beginPath()
          ctx.moveTo(a * 1.6, 0)
          ctx.lineTo(a * 0.6, -a * 0.6)
          ctx.lineTo(a * 0.6, a * 0.6)
          ctx.closePath()
          ctx.fill()
          ctx.restore()

          pts.forEach((p, i) => {
            const hot = i === this.hover || i === this.drag?.index
            ctx.fillStyle = i === 0 ? '#4dffd2' : hot ? '#ffd24d' : '#ffffff'
            ctx.strokeStyle = '#111'
            ctx.lineWidth = 2 / zoom
            ctx.beginPath()
            ctx.arc(p.x, p.y, (hot ? 11 : 8) / zoom, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = '#111'
            ctx.font = `bold ${10 / zoom}px system-ui`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(String(i + 1), p.x, p.y + 0.5 / zoom)
          })
        },
      },
      dt,
    )
  }
}
