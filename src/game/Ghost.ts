import type { Track } from './Track'

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
  /** arc position (along the track) of each recorded frame; enables live lap deltas */
  private arcs: number[] | null = null

  constructor(readonly data: GhostData) {}

  /** Work out where on the circuit each recorded frame was. Call once after creating the player. */
  bindTrack(track: Track) {
    const f = this.data.frames
    const n = f.length / 3
    const L = track.length
    const arcs: number[] = []
    let hint: number | undefined
    let lastS = 0
    let total = 0
    for (let i = 0; i < n; i++) {
      const p = track.project({ x: f[i * 3], y: f[i * 3 + 1] }, hint)
      hint = p.index
      if (i === 0) total = p.s > L / 2 ? p.s - L : p.s
      else {
        let ds = p.s - lastS
        if (ds > L / 2) ds -= L
        else if (ds < -L / 2) ds += L
        total += ds
      }
      lastS = p.s
      arcs.push(i === 0 ? total : Math.max(arcs[i - 1], total))
    }
    this.arcs = arcs
  }

  /** Seconds into the lap at which the ghost reached arc position `arc`, or null if unknown. */
  timeAtArc(arc: number): number | null {
    const a = this.arcs
    if (!a || a.length < 2 || arc < a[0] || arc > a[a.length - 1]) return null
    let lo = 0
    let hi = a.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (a[mid] < arc) lo = mid + 1
      else hi = mid
    }
    const i = Math.max(1, lo)
    const span = a[i] - a[i - 1] || 1
    const k = (arc - a[i - 1]) / span
    return (i - 1 + k) / this.data.hz
  }

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
