import type { Car } from './Car'

type ParticleKind = 'smoke' | 'dust' | 'spark' | 'flame' | 'confetti'

interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  spin: number
  rot: number
}

const MAX_PARTICLES = 700
const MAX_SKIDS = 3500

/** Tyre marks: a ring buffer of line segments in world space. */
export class SkidMarks {
  readonly data = new Float32Array(MAX_SKIDS * 4)
  private head = 0
  count = 0
  /** previous rear-wheel positions per car (to join marks into continuous streaks) */
  private prev = new WeakMap<Car, number[] | null>()

  clear() {
    this.head = 0
    this.count = 0
    this.prev = new WeakMap()
  }

  private push(x1: number, y1: number, x2: number, y2: number) {
    const i = this.head * 4
    this.data[i] = x1
    this.data[i + 1] = y1
    this.data[i + 2] = x2
    this.data[i + 3] = y2
    this.head = (this.head + 1) % MAX_SKIDS
    this.count = Math.min(this.count + 1, MAX_SKIDS)
  }

  update(car: Car) {
    if (!car.skid || !car.onTrack) {
      this.prev.set(car, null)
      return
    }
    const c = Math.cos(car.angle)
    const s = Math.sin(car.angle)
    // rear axle, left and right wheel
    const bx = car.pos.x - c * 11
    const by = car.pos.y - s * 11
    const lx = bx - s * 7
    const ly = by + c * 7
    const rx = bx + s * 7
    const ry = by - c * 7
    const p = this.prev.get(car)
    if (p) {
      this.push(p[0], p[1], lx, ly)
      this.push(p[2], p[3], rx, ry)
    }
    this.prev.set(car, [lx, ly, rx, ry])
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.count) return
    ctx.strokeStyle = 'rgba(10,10,12,0.34)'
    ctx.lineWidth = 3.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let n = 0; n < this.count; n++) {
      const i = n * 4
      ctx.moveTo(this.data[i], this.data[i + 1])
      ctx.lineTo(this.data[i + 2], this.data[i + 3])
    }
    ctx.stroke()
  }
}

/** Smoke, dust, sparks, nitro flames and confetti. */
export class Particles {
  private list: Particle[] = []

  clear() {
    this.list.length = 0
  }

  private add(p: Particle) {
    if (this.list.length >= MAX_PARTICLES) this.list.shift()
    this.list.push(p)
  }

  emitFor(car: Car, dt: number, rand: () => number = Math.random) {
    const c = Math.cos(car.angle)
    const s = Math.sin(car.angle)
    const rear = { x: car.pos.x - c * 16, y: car.pos.y - s * 16 }

    if (car.skid && car.onTrack && Math.abs(car.speed) > 60 && rand() < dt * 38) {
      for (const side of [-1, 1]) {
        this.add({
          kind: 'smoke',
          x: rear.x - s * 7 * side,
          y: rear.y + c * 7 * side,
          vx: -car.vx * 0.06 + (rand() - 0.5) * 18,
          vy: -car.vy * 0.06 + (rand() - 0.5) * 18,
          life: 0,
          max: 0.7 + rand() * 0.5,
          size: 5 + rand() * 4,
          color: '230,230,235',
          spin: 0,
          rot: 0,
        })
      }
    }

    if (!car.onTrack && Math.abs(car.speed) > 70 && rand() < dt * 45) {
      this.add({
        kind: 'dust',
        x: rear.x + (rand() - 0.5) * 12,
        y: rear.y + (rand() - 0.5) * 12,
        vx: -car.vx * 0.12 + (rand() - 0.5) * 30,
        vy: -car.vy * 0.12 + (rand() - 0.5) * 30,
        life: 0,
        max: 0.6 + rand() * 0.5,
        size: 5 + rand() * 5,
        color: '150,130,90',
        spin: 0,
        rot: 0,
      })
    }

    if (car.nitroActive) {
      for (let k = 0; k < 2; k++) {
        this.add({
          kind: 'flame',
          x: rear.x + (rand() - 0.5) * 5,
          y: rear.y + (rand() - 0.5) * 5,
          vx: -c * 140 + car.vx * 0.5 + (rand() - 0.5) * 36,
          vy: -s * 140 + car.vy * 0.5 + (rand() - 0.5) * 36,
          life: 0,
          max: 0.18 + rand() * 0.14,
          size: 4 + rand() * 3,
          color: rand() < 0.5 ? '255,170,60' : '90,190,255',
          spin: 0,
          rot: 0,
        })
      }
    }
  }

  sparks(x: number, y: number, strength: number, rand: () => number = Math.random) {
    const n = Math.round(4 + strength * 14)
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const v = 80 + rand() * 260 * strength
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 0.25 + rand() * 0.3,
        size: 1.5 + rand() * 1.5,
        color: '255,225,120',
        spin: 0,
        rot: 0,
      })
    }
  }

  confetti(x: number, y: number, count = 60, rand: () => number = Math.random) {
    const colors = ['255,90,90', '90,200,255', '255,220,90', '120,255,160', '220,120,255']
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2
      const v = 120 + rand() * 340
      this.add({
        kind: 'confetti',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 120,
        life: 0,
        max: 1.4 + rand() * 1.2,
        size: 4 + rand() * 4,
        color: colors[Math.floor(rand() * colors.length)],
        spin: (rand() - 0.5) * 14,
        rot: rand() * 6,
      })
    }
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'confetti') {
        p.vy += 380 * dt
        p.vx *= 1 - 1.4 * dt
        p.rot += p.spin * dt
      } else {
        const drag = p.kind === 'spark' ? 1.5 : 2.4
        p.vx *= 1 - drag * dt
        p.vy *= 1 - drag * dt
      }
    }
    this.list = this.list.filter((p) => p.life < p.max)
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const k = p.life / p.max
      switch (p.kind) {
        case 'smoke':
        case 'dust': {
          const a = (p.kind === 'smoke' ? 0.32 : 0.28) * (1 - k)
          ctx.fillStyle = `rgba(${p.color},${a})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1 + k * 1.8), 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'flame': {
          ctx.fillStyle = `rgba(${p.color},${0.9 * (1 - k)})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1 - k * 0.6), 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'spark': {
          ctx.fillStyle = `rgba(${p.color},${1 - k})`
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
          break
        }
        case 'confetti': {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillStyle = `rgba(${p.color},${Math.min(1, (1 - k) * 2)})`
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
          ctx.restore()
          break
        }
      }
    }
  }
}
