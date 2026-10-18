import { TrainingSession } from '../ai/TrainingSession'
import type { Track } from '../game/Track'
import { getRival, saveRival } from '../storage'
import { fmtTime, h } from './dom'

/**
 * "Your rivals are studying that race": after each race against My Rival, the evolving population
 * trains in the background (a few generations, or until it beats the player's best lap) and is saved.
 */
export class RivalStudy {
  readonly el: HTMLElement
  private session: TrainingSession
  private startGen: number
  private status = h('div', { class: 'study-status' })
  private bar = h('div', { class: 'study-fill' })
  private done = false
  private maxGens: number
  private startedAt = performance.now()

  constructor(
    track: Track,
    private target: number | null,
    maxGens = 12,
  ) {
    this.maxGens = maxGens
    const saved = getRival(track.id)
    this.session = new TrainingSession(track, {}, saved)
    this.startGen = this.session.generation
    this.el = h(
      'div',
      { class: 'study' },
      h('div', { class: 'study-title', text: '🧠 Your rivals are studying that race…' }),
      this.status,
      h('div', { class: 'study-bar' }, this.bar),
    )
    this.render()
  }

  get finished() {
    return this.done
  }

  /** Call every frame; does a slice of training work. */
  update() {
    if (this.done) return
    this.session.advance(4000, performance.now() + 10)
    const gained = this.session.generation - this.startGen
    const beat =
      this.target !== null &&
      this.session.bestLapEver !== null &&
      this.session.bestLapEver < this.target
    if (gained >= this.maxGens || beat || performance.now() - this.startedAt > 45000) {
      this.done = true
      saveRival(this.session.toSave())
    }
    this.render()
  }

  private render() {
    const gained = this.session.generation - this.startGen
    const best = this.session.bestLapEver
    const lines = [`Generation ${this.session.generation}  (+${gained})`]
    lines.push(`Their best lap: ${fmtTime(best)}`)
    if (this.target !== null) lines.push(`Your best lap: ${fmtTime(this.target)}`)
    if (this.done) {
      const beat = this.target !== null && best !== null && best < this.target
      lines.push(
        beat
          ? 'They beat your best lap. Time to step it up! 😈'
          : 'Saved. They will be sharper next time. Open the Lab to train them further.',
      )
    }
    this.status.textContent = lines.join('\n')
    this.bar.style.width = `${Math.min(100, (gained / this.maxGens) * 100)}%`
    this.el.classList.toggle('done', this.done)
  }
}
