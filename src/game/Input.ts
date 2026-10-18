import type { Controls } from './Car'
import { clamp } from './math'

const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  nitro: ['ShiftLeft', 'ShiftRight', 'Space'],
}

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'])

function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
}

/** Keyboard + gamepad + on-screen touch buttons, merged into one `Controls` value. */
export class Input {
  private down = new Set<string>()
  private pressed = new Set<string>()
  private padPrev = new Set<string>()
  private touch = { left: false, right: false, gas: false, brake: false, nitro: false }
  private touchEl: HTMLElement | null = null

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (typingTarget(e.target)) return
      if (PREVENT.has(e.code)) e.preventDefault()
      if (!this.down.has(e.code)) this.pressed.add(e.code)
      this.down.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.down.delete(e.code))
    window.addEventListener('blur', () => this.down.clear())
    if ('ontouchstart' in window) this.buildTouchControls()
  }

  private any(codes: string[]) {
    return codes.some((c) => this.down.has(c))
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? []
    for (const p of pads) if (p?.connected) return p
    return null
  }

  controls(): Controls {
    let throttle = (this.any(KEYS.up) ? 1 : 0) - (this.any(KEYS.down) ? 1 : 0)
    let steer = (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0)
    let nitro = this.any(KEYS.nitro)

    const t = this.touch
    throttle += (t.gas ? 1 : 0) - (t.brake ? 1 : 0)
    steer += (t.right ? 1 : 0) - (t.left ? 1 : 0)
    nitro ||= t.nitro

    const p = this.pad()
    if (p) {
      const ax = p.axes[0] ?? 0
      if (Math.abs(ax) > 0.12) steer += ax
      const rt = p.buttons[7]?.value ?? 0
      const lt = p.buttons[6]?.value ?? 0
      throttle += rt - lt
      nitro ||= !!p.buttons[0]?.pressed || !!p.buttons[5]?.pressed
    }
    return { throttle: clamp(throttle, -1, 1), steer: clamp(steer, -1, 1), nitro }
  }

  /** True once per physical key press (edge-triggered). Also maps gamepad buttons to key-like codes. */
  consume(code: string): boolean {
    this.pollPadEdges()
    return this.pressed.delete(code)
  }

  /** Forget stale presses (call when switching screens). */
  flush() {
    this.pressed.clear()
  }

  private pollPadEdges() {
    const p = this.pad()
    const now = new Set<string>()
    if (p) {
      if (p.buttons[9]?.pressed) now.add('Escape')
      if (p.buttons[3]?.pressed) now.add('KeyR')
      if (p.buttons[2]?.pressed) now.add('KeyV')
    }
    for (const c of now) if (!this.padPrev.has(c)) this.pressed.add(c)
    this.padPrev = now
  }

  setTouchVisible(on: boolean) {
    if (this.touchEl) this.touchEl.style.display = on ? 'flex' : 'none'
  }

  private buildTouchControls() {
    const wrap = document.createElement('div')
    wrap.className = 'touch-controls'
    wrap.style.display = 'none'
    const mk = (label: string, key: keyof typeof this.touch, cls = '') => {
      const b = document.createElement('button')
      b.textContent = label
      b.className = `touch-btn ${cls}`
      const set = (v: boolean) => (this.touch[key] = v)
      b.addEventListener('touchstart', (e) => (e.preventDefault(), set(true)), { passive: false })
      b.addEventListener('touchend', (e) => (e.preventDefault(), set(false)), { passive: false })
      b.addEventListener('touchcancel', () => set(false))
      return b
    }
    const left = document.createElement('div')
    left.className = 'touch-group'
    left.append(mk('◀', 'left'), mk('▶', 'right'))
    const right = document.createElement('div')
    right.className = 'touch-group'
    right.append(mk('NOS', 'nitro', 'nitro'), mk('BRAKE', 'brake'), mk('GAS', 'gas', 'gas'))
    wrap.append(left, right)
    document.body.append(wrap)
    this.touchEl = wrap
  }
}
