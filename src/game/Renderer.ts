import type { Car } from './Car'
import type { Particles, SkidMarks } from './Effects'
import { clamp, type Vec2 } from './math'
import { RUNOFF, type Track } from './Track'

export interface DrawCar {
  car: Car
  label?: string
  alpha?: number
  /** override the body colour (ghosts) */
  tint?: string
  isPlayer?: boolean
  showSensors?: boolean
  /** cheap rectangle instead of the full car (big training populations) */
  simple?: boolean
}

export interface Scene {
  track: Track
  cars: DrawCar[]
  skids?: SkidMarks
  particles?: Particles
  /** extra translucent marker cars, e.g. the recorded lap ghost */
  ghost?: { x: number; y: number; angle: number } | null
  /** extra world-space drawing hook (editor handles, debug overlays) */
  overlay?: (ctx: CanvasRenderingContext2D, zoom: number) => void
}

export type CameraMode = 'follow' | 'fit' | 'free'

const GRASS_A = '#1d3b27'
const GRASS_B = '#21452d'

function makeGrassPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = GRASS_A
  g.fillRect(0, 0, 256, 256)
  let seed = 12345
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = rnd() < 0.5 ? GRASS_B : '#183321'
    const s = 2 + rnd() * 5
    g.fillRect(rnd() * 256, rnd() * 256, s, s)
  }
  return ctx.createPattern(c, 'repeat')
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private grass: CanvasPattern | null
  private track: Track | null = null
  private paths: {
    center: Path2D
    left: Path2D
    right: Path2D
    barL: Path2D
    barR: Path2D
  } | null = null
  private bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 }

  /** race after dark: dim everything except headlight cones */
  night = false
  private nightCanvas: HTMLCanvasElement | null = null
  mode: CameraMode = 'follow'
  cam = { x: 0, y: 0, zoom: 0.95 }
  baseZoom = 0.95
  /** the car the follow-camera tracks */
  follow: Car | null = null
  private shake = 0
  private viewW = 1
  private viewH = 1
  private dpr = 1

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.grass = makeGrassPattern(this.ctx)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1
    this.viewW = window.innerWidth
    this.viewH = window.innerHeight
    this.canvas.width = Math.round(this.viewW * this.dpr)
    this.canvas.height = Math.round(this.viewH * this.dpr)
  }

  setTrack(track: Track, resetCamera = true) {
    this.track = track
    const loop = (pts: Vec2[]) => {
      const p = new Path2D()
      pts.forEach((pt, i) => (i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y)))
      p.closePath()
      return p
    }
    this.paths = {
      center: loop(track.center),
      left: loop(track.left),
      right: loop(track.right),
      barL: loop(track.barrierLeft),
      barR: loop(track.barrierRight),
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of [...track.barrierLeft, ...track.barrierRight]) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    this.bounds = { minX, minY, maxX, maxY }
    if (resetCamera) {
      const s = track.start.pos
      this.cam.x = s.x
      this.cam.y = s.y
    }
  }

  /** Zoom that fits the whole circuit on screen. */
  private fitZoom(margin = 60) {
    const { minX, minY, maxX, maxY } = this.bounds
    return Math.min(
      (this.viewW - margin * 2) / (maxX - minX),
      (this.viewH - margin * 2) / (maxY - minY),
    )
  }

  addShake(v: number) {
    this.shake = Math.min(1, this.shake + v)
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.viewW / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.viewH / 2) / this.cam.zoom + this.cam.y,
    }
  }

  /** Move/zoom the camera toward its target for this frame. */
  private updateCamera(dt: number) {
    const k = Math.min(1, dt * 6)
    if (this.mode === 'follow' && this.follow) {
      const c = this.follow
      const tx = c.pos.x + c.vx * 0.3
      const ty = c.pos.y + c.vy * 0.3
      const tz = this.baseZoom * (1 - 0.2 * clamp(Math.abs(c.speed) / 520, 0, 1))
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 8)
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 8)
      this.cam.zoom += (tz - this.cam.zoom) * k
    } else if (this.mode === 'fit') {
      const { minX, minY, maxX, maxY } = this.bounds
      this.cam.x += ((minX + maxX) / 2 - this.cam.x) * k
      this.cam.y += ((minY + maxY) / 2 - this.cam.y) * k
      this.cam.zoom += (this.fitZoom() - this.cam.zoom) * k
    }
    this.shake *= Math.exp(-dt * 6)
  }

  draw(scene: Scene, dt: number) {
    if (!this.track || !this.paths) return
    this.updateCamera(dt)
    const { ctx } = this
    const { zoom } = this.cam
    const { width: track_w } = this.track
    const p = this.paths

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = GRASS_A
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    const sh = this.shake * 9
    const ox = sh ? (Math.random() - 0.5) * sh : 0
    const oy = sh ? (Math.random() - 0.5) * sh : 0
    ctx.setTransform(
      this.dpr * zoom,
      0,
      0,
      this.dpr * zoom,
      this.dpr * (this.viewW / 2 + ox) - this.cam.x * this.dpr * zoom,
      this.dpr * (this.viewH / 2 + oy) - this.cam.y * this.dpr * zoom,
    )

    // grass
    const halfW = this.viewW / 2 / zoom + 60
    const halfH = this.viewH / 2 / zoom + 60
    if (this.grass) {
      ctx.fillStyle = this.grass
      ctx.fillRect(this.cam.x - halfW, this.cam.y - halfH, halfW * 2, halfH * 2)
    }

    ctx.lineJoin = 'round'
    ctx.lineCap = 'butt'

    // gravel run-off
    ctx.strokeStyle = '#7c7455'
    ctx.lineWidth = track_w + RUNOFF * 2
    ctx.stroke(p.center)
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'
    ctx.lineWidth = track_w + RUNOFF * 1.2
    ctx.stroke(p.center)

    // tyre barrier
    for (const bar of [p.barL, p.barR]) {
      ctx.strokeStyle = '#f2f2f2'
      ctx.lineWidth = 9
      ctx.setLineDash([])
      ctx.stroke(bar)
      ctx.strokeStyle = '#d63a3a'
      ctx.setLineDash([26, 26])
      ctx.stroke(bar)
    }
    ctx.setLineDash([])

    // kerbs
    for (const edge of [p.left, p.right]) {
      ctx.strokeStyle = '#f4f4f4'
      ctx.lineWidth = 17
      ctx.stroke(edge)
      ctx.strokeStyle = '#d63a3a'
      ctx.setLineDash([22, 22])
      ctx.stroke(edge)
      ctx.setLineDash([])
    }

    // asphalt
    ctx.strokeStyle = '#363940'
    ctx.lineWidth = track_w
    ctx.stroke(p.center)
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'
    ctx.lineWidth = track_w * 0.38
    ctx.stroke(p.center)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 3
    ctx.setLineDash([26, 30])
    ctx.stroke(p.center)
    ctx.setLineDash([])

    this.drawStartLine()
    scene.skids?.draw(ctx)

    if (scene.ghost) this.drawGhost(scene.ghost)

    // player on top
    const sorted = [...scene.cars].sort((a, b) => Number(!!a.isPlayer) - Number(!!b.isPlayer))
    for (const dc of sorted) if (dc.showSensors) this.drawSensors(dc.car)
    for (const dc of sorted) this.drawCar(dc, zoom)

    scene.particles?.draw(ctx)
    scene.overlay?.(ctx, zoom)
    if (this.night) this.drawNight(scene.cars)
  }

  /** Dim the whole scene, then punch headlight cones and glows through the darkness. */
  private drawNight(cars: DrawCar[]) {
    const { ctx } = this
    if (!this.nightCanvas) {
      this.nightCanvas = document.createElement('canvas')
    }
    const nc = this.nightCanvas
    if (nc.width !== this.canvas.width || nc.height !== this.canvas.height) {
      nc.width = this.canvas.width
      nc.height = this.canvas.height
    }
    const g = nc.getContext('2d')!
    const world = ctx.getTransform()
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.clearRect(0, 0, nc.width, nc.height)
    g.fillStyle = 'rgba(3, 5, 16, 0.84)'
    g.fillRect(0, 0, nc.width, nc.height)

    g.setTransform(world)
    g.globalCompositeOperation = 'destination-out'
    for (const { car, alpha } of cars) {
      if (alpha !== undefined && alpha < 0.3) continue
      g.save()
      g.translate(car.pos.x, car.pos.y)
      g.rotate(car.angle)
      // forward beam
      const beam = g.createRadialGradient(10, 0, 8, 10, 0, 330)
      beam.addColorStop(0, 'rgba(0,0,0,0.95)')
      beam.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = beam
      g.beginPath()
      g.moveTo(10, 0)
      g.arc(10, 0, 330, -0.42, 0.42)
      g.closePath()
      g.fill()
      // soft pool of light around the car
      const glow = g.createRadialGradient(0, 0, 4, 0, 0, car.nitroActive ? 110 : 70)
      glow.addColorStop(0, 'rgba(0,0,0,0.85)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = glow
      g.beginPath()
      g.arc(0, 0, car.nitroActive ? 110 : 70, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(nc, 0, 0)
    ctx.restore()
  }

  private drawStartLine() {
    const t = this.track!
    const { ctx } = this
    const s = t.start
    ctx.save()
    ctx.translate(s.pos.x, s.pos.y)
    ctx.rotate(s.angle)
    const cell = 12
    const rows = 2
    const cols = Math.floor(t.width / cell)
    const startY = -(cols * cell) / 2
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f5f5f5' : '#15161a'
        ctx.fillRect(-cell + r * cell, startY + c * cell, cell, cell)
      }
    }
    // gantry posts
    ctx.fillStyle = '#c9ccd6'
    ctx.fillRect(-6, -t.width / 2 - 16, 12, 12)
    ctx.fillRect(-6, t.width / 2 + 4, 12, 12)
    ctx.restore()
  }

  private drawSensors(car: Car) {
    const { ctx } = this
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.5)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (const h of car.sensors.hits) {
      ctx.moveTo(car.pos.x, car.pos.y)
      ctx.lineTo(h.x, h.y)
    }
    ctx.stroke()
    ctx.fillStyle = '#ffdc50'
    for (const h of car.sensors.hits) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawGhost(g: { x: number; y: number; angle: number }) {
    const { ctx } = this
    ctx.save()
    ctx.translate(g.x, g.y)
    ctx.rotate(g.angle)
    ctx.globalAlpha = 0.42
    this.carBody('#8fe9ff', 34, 18, 0)
    ctx.restore()
  }

  /** Top-down car silhouette centred on (0,0), nose pointing along +x. */
  private carBody(color: string, len: number, wid: number, steer: number) {
    const { ctx } = this
    const hl = len / 2
    const hw = wid / 2
    // wheels
    ctx.fillStyle = '#0c0c0e'
    for (const [wx, wy, front] of [
      [hl * 0.5, -hw - 0.5, true],
      [hl * 0.5, hw + 0.5, true],
      [-hl * 0.5, -hw - 0.5, false],
      [-hl * 0.5, hw + 0.5, false],
    ] as const) {
      ctx.save()
      ctx.translate(wx, wy)
      if (front) ctx.rotate(steer * 0.45)
      ctx.fillRect(-5, -2, 10, 4)
      ctx.restore()
    }
    // rear wing
    ctx.fillStyle = shade(color, -0.35)
    ctx.fillRect(-hl - 1, -hw - 1, 4, wid + 2)
    // body
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
    ctx.strokeStyle = shade(color, -0.45)
    ctx.lineWidth = 1.2
    ctx.stroke()
    // stripe + cockpit
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.fillRect(-hl * 0.7, -1.4, hl * 1.55, 2.8)
    ctx.fillStyle = '#10131a'
    ctx.beginPath()
    ctx.ellipse(-hl * 0.05, 0, hl * 0.3, hw * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawCar(dc: DrawCar, zoom: number) {
    const { ctx } = this
    const { car } = dc
    ctx.save()
    ctx.translate(car.pos.x, car.pos.y)
    if (dc.alpha !== undefined) ctx.globalAlpha = dc.alpha

    if (dc.simple) {
      ctx.rotate(car.angle)
      ctx.fillStyle = dc.tint ?? car.color
      ctx.fillRect(-car.length / 2, -car.width / 2, car.length, car.width)
      ctx.restore()
      return
    }

    // soft shadow
    ctx.save()
    ctx.rotate(car.angle)
    ctx.translate(3, 4)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(-car.length / 2, -car.width / 2, car.length, car.width)
    ctx.restore()

    ctx.rotate(car.angle)
    // brake lights
    if (car.braking) {
      ctx.fillStyle = 'rgba(255,40,40,0.85)'
      ctx.fillRect(-car.length / 2 - 1, -car.width / 2 + 1, 3, 4)
      ctx.fillRect(-car.length / 2 - 1, car.width / 2 - 5, 3, 4)
      ctx.fillStyle = 'rgba(255,40,40,0.18)'
      ctx.beginPath()
      ctx.arc(-car.length / 2 - 3, 0, 14, 0, Math.PI * 2)
      ctx.fill()
    }
    this.carBody(dc.tint ?? car.color, car.length, car.width, car.steerState)
    if (car.number > 0 && !dc.isPlayer) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.font = 'bold 7px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(car.number), -car.length * 0.3, 0)
    }
    ctx.restore()

    // name tag above the car (kept upright and a constant on-screen size)
    if (dc.label) {
      ctx.save()
      ctx.translate(car.pos.x, car.pos.y - 28 / zoom)
      const px = 12 / zoom
      ctx.font = `600 ${px}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      const w = ctx.measureText(dc.label).width
      ctx.fillRect(-w / 2 - 4 / zoom, -px - 3 / zoom, w + 8 / zoom, px + 5 / zoom)
      ctx.fillStyle = dc.isPlayer ? '#ffffff' : (dc.tint ?? car.color)
      ctx.fillText(dc.label, 0, 0)
      ctx.restore()
    }
  }
}

/** Lighten (amount>0) or darken (amount<0) a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) =>
    clamp(Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount), 0, 255)
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `rgb(${r},${g},${b})`
}
