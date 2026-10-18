import { clamp } from './math'

/**
 * All sound is synthesised with the Web Audio API: no asset files needed.
 * The AudioContext can only start after a user gesture, so everything is created lazily.
 */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

  private engineOsc: OscillatorNode | null = null
  private engineOsc2: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private skidGain: GainNode | null = null
  private nitroGain: GainNode | null = null

  volume = 0.5
  muted = false

  /** Call from a click/keypress handler to unlock audio. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.connect(this.ctx.destination)
    this.applyVolume()

    // one second of white noise, reused for skids/whooshes/crashes
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this.noiseBuf = buf
  }

  private applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
  }

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1)
    this.applyVolume()
  }

  setMuted(m: boolean) {
    this.muted = m
    this.applyVolume()
  }

  // ----------------------------------------------------------- engine loop

  startEngine() {
    const ctx = this.ctx
    if (!ctx || !this.master || this.engineOsc) return
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    this.engineOsc = ctx.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineOsc2 = ctx.createOscillator()
    this.engineOsc2.type = 'square'
    this.engineOsc.connect(filter)
    this.engineOsc2.connect(filter)
    filter.connect(this.engineGain)
    this.engineGain.connect(this.master)
    this.engineOsc.start()
    this.engineOsc2.start()

    // tyre squeal: band-passed noise
    this.skidGain = ctx.createGain()
    this.skidGain.gain.value = 0
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 2.5
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.connect(bp)
    bp.connect(this.skidGain)
    this.skidGain.connect(this.master)
    src.start()

    // nitro roar: low-passed noise
    this.nitroGain = ctx.createGain()
    this.nitroGain.gain.value = 0
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1200
    const src2 = ctx.createBufferSource()
    src2.buffer = this.noiseBuf
    src2.loop = true
    src2.connect(lp)
    lp.connect(this.nitroGain)
    this.nitroGain.connect(this.master)
    src2.start()
  }

  /** Update the continuous sounds from the player's car each frame. */
  updateEngine(speedFrac: number, throttle: number, slip: number, nitro: boolean) {
    const ctx = this.ctx
    if (!ctx || !this.engineOsc || !this.engineOsc2) return
    const t = ctx.currentTime
    const f = 55 + clamp(speedFrac, 0, 1.4) * 150 + clamp(throttle, 0, 1) * 18
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05)
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05)
    this.engineGain!.gain.setTargetAtTime(
      0.06 + 0.09 * clamp(throttle, 0, 1) + 0.05 * speedFrac,
      t,
      0.08,
    )
    this.skidGain!.gain.setTargetAtTime(clamp((slip - 40) / 160, 0, 0.16), t, 0.04)
    this.nitroGain!.gain.setTargetAtTime(nitro ? 0.13 : 0, t, 0.06)
  }

  stopEngine() {
    const ctx = this.ctx
    if (!ctx) return
    for (const g of [this.engineGain, this.skidGain, this.nitroGain]) {
      g?.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    }
    this.engineOsc?.stop(ctx.currentTime + 0.3)
    this.engineOsc2?.stop(ctx.currentTime + 0.3)
    this.engineOsc = this.engineOsc2 = null
  }

  // ---------------------------------------------------------- one-shot sfx

  beep(freq: number, dur = 0.18, type: OscillatorType = 'square', gain = 0.22) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.value = freq
    const t = ctx.currentTime
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  countdown(n: number) {
    this.beep(n === 0 ? 880 : 440, n === 0 ? 0.5 : 0.18)
  }

  lap() {
    this.beep(660, 0.1, 'triangle')
    setTimeout(() => this.beep(990, 0.18, 'triangle'), 90)
  }

  newBest() {
    for (const [i, f] of [660, 830, 990, 1320].entries()) {
      setTimeout(() => this.beep(f, 0.16, 'triangle', 0.2), i * 80)
    }
  }

  finish(rank: number) {
    const notes = rank === 1 ? [523, 659, 784, 1046, 1318] : [440, 523, 440]
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 'triangle', 0.22), i * 120))
  }

  crash(strength: number) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noiseBuf) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 400 + strength * 1400
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(clamp(strength, 0.1, 1) * 0.45, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    src.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + 0.3)
  }

  click() {
    this.beep(520, 0.05, 'square', 0.08)
  }
}

export const sfx = new Sfx()
