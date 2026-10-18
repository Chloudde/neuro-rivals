import { sfx } from '../game/Audio'
import type { App, Scene } from './App'
import { Attract } from './Attract'
import { h } from './dom'

export class MenuScene implements Scene {
  private attract!: Attract
  private root!: HTMLElement
  private caption!: HTMLElement

  constructor(private app: App) {}

  enter() {
    const { nav } = this.app
    this.attract = new Attract(this.app)
    const item = (label: string, sub: string, go: () => void, primary = false) =>
      h(
        'button',
        {
          class: `menu-item${primary ? ' primary' : ''}`,
          onclick: () => {
            sfx.unlock()
            sfx.click()
            go()
          },
        },
        h('span', { class: 'mi-label', text: label }),
        h('span', { class: 'mi-sub', text: sub }),
      )

    this.root = h(
      'div',
      { class: 'screen menu' },
      h(
        'div',
        { class: 'menu-card' },
        h(
          'div',
          { class: 'logo' },
          h('span', { class: 'logo-a', text: 'NEURO' }),
          h('span', { class: 'logo-b', text: 'RIVALS' }),
        ),
        h('div', { class: 'tagline', text: 'Race the AI that learned to race.' }),
        item('Race', 'You vs. evolved neural-net drivers', () => nav.setup('race'), true),
        item('Championship', 'A points season across the circuits', () => nav.championship()),
        item('Time trial', 'Chase your ghost, beat your best lap', () => nav.setup('timetrial')),
        item('Training lab', 'Watch generations evolve. Train your own rival', () => nav.lab()),
        item('Track editor', 'Draw circuits. Rivals learn them too', () => nav.editor()),
        item('Garage & settings', 'Your car, audio, records and how to play', () => nav.settings()),
      ),
      (this.caption = h('div', { class: 'attract-caption' })),
      h('div', { class: 'credit', text: 'github.com/Chloudde/neuro-rivals' }),
    )
    this.app.ui.append(this.root)
  }

  exit() {}

  update(dt: number) {
    this.attract.update(dt)
    const name = this.attract.trackName
    const text = name ? `Live: 6 AI drivers racing at ${name}` : ''
    if (this.caption.textContent !== text) this.caption.textContent = text
  }
}
