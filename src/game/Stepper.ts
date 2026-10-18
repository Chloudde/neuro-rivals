import { DT } from '../config'

/** Turns variable frame times into a whole number of fixed physics ticks. */
export class Stepper {
  private acc = 0

  /** Run `tick` as many times as elapsed time requires (at most `maxTicks` per call). */
  run(frameDt: number, tick: () => void, speed = 1, maxTicks = 12): number {
    this.acc += frameDt * speed
    let n = 0
    while (this.acc >= DT && n < maxTicks) {
      tick()
      this.acc -= DT
      n++
    }
    if (n === maxTicks) this.acc = 0 // we fell behind: drop the backlog instead of spiralling
    return n
  }

  reset() {
    this.acc = 0
  }
}
