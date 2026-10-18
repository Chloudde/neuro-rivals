import { Car } from './Car'
import { KeyboardInput } from './Input'
import { Renderer } from './Renderer'
import { Track } from './Track'

const STEP = 1 / 120 // fixed physics timestep (seconds)

export class Game {
  private track = new Track()
  private player = new Car(this.track, { color: '#ff4d4d' })
  private input = new KeyboardInput()
  private renderer: Renderer
  private hud: HTMLElement
  private showSensors = true
  private last = performance.now()
  private acc = 0

  constructor(canvas: HTMLCanvasElement, hud: HTMLElement) {
    this.renderer = new Renderer(canvas)
    this.hud = hud
  }

  start() {
    requestAnimationFrame(this.frame)
  }

  private reset() {
    this.player = new Car(this.track, { color: '#ff4d4d' })
  }

  private frame = (now: number) => {
    // clamp so a backgrounded tab doesn't trigger a huge catch-up burst
    this.acc += Math.min((now - this.last) / 1000, 0.1)
    this.last = now

    if (this.input.consume('KeyR')) this.reset()
    if (this.input.consume('KeyV')) this.showSensors = !this.showSensors

    while (this.acc >= STEP) {
      this.player.update(STEP, this.input.controls())
      this.acc -= STEP
    }

    this.renderer.draw(this.track, [this.player], this.player, this.showSensors)
    this.updateHud()
    requestAnimationFrame(this.frame)
  }

  private updateHud() {
    const p = this.player
    this.hud.textContent =
      `NEURO RIVALS\n` +
      `speed  ${Math.round(Math.abs(p.speed))}\n` +
      `lap    ${p.lap + 1}\n` +
      `track  ${p.onTrack ? 'on' : 'OFF'}\n\n` +
      `WASD / arrows drive  ·  R reset  ·  V sensors`
  }
}
