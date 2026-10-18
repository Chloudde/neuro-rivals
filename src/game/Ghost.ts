/** A recorded lap: `frames` is flat [x, y, angle, x, y, angle, ...] sampled every `1/hz` seconds. */
export interface GhostData {
  time: number
  hz: number
  frames: number[]
}

export const GHOST_HZ = 30

/** Collects a lap's worth of positions. */
export class GhostRecorder {
  private frames: number[] = []

  reset() {
    this.frames = []
  }

  sample(x: number, y: number, angle: number) {
    this.frames.push(
      Math.round(x * 10) / 10,
      Math.round(y * 10) / 10,
      Math.round(angle * 1000) / 1000,
    )
  }

  finish(time: number): GhostData {
    const data = { time, hz: GHOST_HZ, frames: this.frames }
    this.frames = []
    return data
  }

  get length() {
    return this.frames.length / 3
  }
}

/** Plays a recorded lap back, interpolating between samples. */
export class GhostPlayer {
  constructor(readonly data: GhostData) {}

  /** Position at `t` seconds into the lap, or null once the lap is over. */
  at(t: number): { x: number; y: number; angle: number } | null {
    const f = this.data.frames
    const n = f.length / 3
    const pos = t * this.data.hz
    if (n < 2 || pos < 0 || pos >= n - 1) return null
    const i = Math.floor(pos)
    const k = pos - i
    const a = i * 3
    const b = a + 3
    let da = f[b + 2] - f[a + 2]
    if (da > Math.PI) da -= Math.PI * 2
    else if (da < -Math.PI) da += Math.PI * 2
    return {
      x: f[a] + (f[b] - f[a]) * k,
      y: f[a + 1] + (f[b + 1] - f[a + 1]) * k,
      angle: f[a + 2] + da * k,
    }
  }
}
