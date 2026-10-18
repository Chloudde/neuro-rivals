import type { Car } from './Car'
import type { Track } from './Track'

export interface MapDot {
  car: Car
  color: string
  isPlayer?: boolean
}

/** Small overhead map of the circuit with a dot per car. */
export class Minimap {
  private ctx: CanvasRenderingContext2D
  private base: HTMLCanvasElement
  private scale = 1
  private ox = 0
  private oy = 0
  private size: number

  constructor(
    readonly canvas: HTMLCanvasElement,
    size = 190,
  ) {
    this.size = size
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.height = Math.round(size * dpr)
    canvas.style.width = canvas.style.height = `${size}px`
    this.ctx = canvas.getContext('2d')!
    this.ctx.scale(dpr, dpr)
    this.base = document.createElement('canvas')
    this.base.width = this.base.height = Math.round(size * dpr)
  }

  setTrack(track: Track) {
    const pad = 14
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of track.center) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const w = maxX - minX || 1
    const h = maxY - minY || 1
    this.scale = Math.min((this.size - pad * 2) / w, (this.size - pad * 2) / h)
    this.ox = (this.size - w * this.scale) / 2 - minX * this.scale
    this.oy = (this.size - h * this.scale) / 2 - minY * this.scale

    const dpr = window.devicePixelRatio || 1
    const g = this.base.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, this.size, this.size)
    const path = new Path2D()
    track.center.forEach((p, i) => {
      const x = p.x * this.scale + this.ox
      const y = p.y * this.scale + this.oy
      if (i === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    })
    path.closePath()
    g.lineJoin = 'round'
    g.strokeStyle = 'rgba(255,255,255,0.9)'
    g.lineWidth = 7
    g.stroke(path)
    g.strokeStyle = 'rgba(30,32,40,1)'
    g.lineWidth = 4.5
    g.stroke(path)
    // start line tick
    const s = track.center[0]
    g.fillStyle = '#fff'
    g.fillRect(s.x * this.scale + this.ox - 5, s.y * this.scale + this.oy - 1.5, 10, 3)
  }

  draw(dots: MapDot[]) {
    const { ctx, size } = this
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(this.base, 0, 0, size, size)
    const ordered = [...dots].sort((a, b) => Number(!!a.isPlayer) - Number(!!b.isPlayer))
    for (const d of ordered) {
      const x = d.car.pos.x * this.scale + this.ox
      const y = d.car.pos.y * this.scale + this.oy
      ctx.fillStyle = d.color
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, d.isPlayer ? 5.5 : 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
}
