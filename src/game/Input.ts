import type { Controls } from './Car'

const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
}

export class KeyboardInput {
  private down = new Set<string>()
  private pressed = new Set<string>()

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
      if (!this.down.has(e.code)) this.pressed.add(e.code)
      this.down.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.down.delete(e.code))
    window.addEventListener('blur', () => this.down.clear())
  }

  private any(codes: string[]) {
    return codes.some((c) => this.down.has(c))
  }

  controls(): Controls {
    return {
      throttle: (this.any(KEYS.up) ? 1 : 0) - (this.any(KEYS.down) ? 1 : 0),
      steer: (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0),
    }
  }

  /** True once per physical key press (edge-triggered). */
  consume(code: string): boolean {
    return this.pressed.delete(code)
  }
}
