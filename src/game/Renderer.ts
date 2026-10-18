import type { Car } from './Car'
import type { Vec2 } from './math'
import type { Track } from './Track'

export class Renderer {
  private ctx: CanvasRenderingContext2D
  /** camera centre in world space */
  private cam: Vec2 = { x: 0, y: 0 }

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = window.innerWidth * dpr
    this.canvas.height = window.innerHeight * dpr
  }

  draw(track: Track, cars: Car[], follow: Car, showSensors: boolean) {
    const { ctx, canvas } = this
    const dpr = window.devicePixelRatio || 1

    // smooth camera follow
    this.cam.x += (follow.pos.x - this.cam.x) * 0.12
    this.cam.y += (follow.pos.y - this.cam.y) * 0.12

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#1b3a24' // grass
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.translate(window.innerWidth / 2 - this.cam.x, window.innerHeight / 2 - this.cam.y)

    this.drawTrack(track)
    if (showSensors) for (const c of cars) this.drawSensors(c)
    for (const c of cars) this.drawCar(c)
  }

  private drawTrack(track: Track) {
    const { ctx } = this
    const path = new Path2D()
    track.center.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
    path.closePath()

    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#e8e8e8' // kerb / edge line
    ctx.lineWidth = track.width + 10
    ctx.stroke(path)
    ctx.strokeStyle = '#3a3d46' // asphalt
    ctx.lineWidth = track.width
    ctx.stroke(path)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)' // centre dashes
    ctx.lineWidth = 3
    ctx.setLineDash([22, 26])
    ctx.stroke(path)
    ctx.setLineDash([])

    // start / finish line
    const s = track.start
    ctx.save()
    ctx.translate(s.pos.x, s.pos.y)
    ctx.rotate(s.angle)
    ctx.fillStyle = '#fff'
    ctx.fillRect(-4, -track.width / 2, 8, track.width)
    ctx.restore()
  }

  private drawSensors(car: Car) {
    const { ctx } = this
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.55)'
    ctx.lineWidth = 1
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

  private drawCar(car: Car) {
    const { ctx } = this
    ctx.save()
    ctx.translate(car.pos.x, car.pos.y)
    ctx.rotate(car.angle)
    ctx.fillStyle = car.color
    ctx.fillRect(-car.length / 2, -car.width / 2, car.length, car.width)
    ctx.fillStyle = 'rgba(0,0,0,0.45)' // windscreen so you can tell front from back
    ctx.fillRect(car.length / 2 - 12, -car.width / 2 + 3, 7, car.width - 6)
    ctx.restore()
  }
}
