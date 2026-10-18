import { Input } from '../game/Input'
import { Renderer } from '../game/Renderer'
import { sfx } from '../game/Audio'
import { Track, type TrackDef } from '../game/Track'
import { BUILTIN_TRACKS } from '../game/tracks'
import { getCustomTracks, getSettings, updateSettings } from '../storage'
import { clear } from './dom'

export type RaceMode = 'race' | 'timetrial'

export interface RaceParams {
  mode: RaceMode
  trackId: string
  laps: number
  rivals: number
  difficulty: 'rookie' | 'pro' | 'legend' | 'rival'
  playerStart: 'front' | 'back'
  /** this race is a round of the active championship */
  championship?: boolean
}

/** Scene navigation, wired up in main.ts (keeps scene modules from importing each other in circles). */
export interface Nav {
  menu(): void
  setup(mode: RaceMode): void
  race(params: RaceParams): void
  lab(trackId?: string): void
  editor(trackId?: string): void
  settings(tab?: string): void
  championship(): void
}

export interface Scene {
  enter(): void
  /** called once per animation frame with the real elapsed time (seconds, clamped) */
  update(dt: number): void
  exit(): void
}

/** Owns the canvas, renderer, input and the currently active scene. */
export class App {
  readonly renderer: Renderer
  readonly input = new Input()
  /** overlay container for each scene's DOM */
  readonly ui: HTMLElement
  nav!: Nav
  private scene: Scene | null = null
  private failed = false
  private last = performance.now()
  private trackCache = new Map<string, Track>()

  constructor(
    readonly canvas: HTMLCanvasElement,
    ui: HTMLElement,
  ) {
    this.renderer = new Renderer(canvas)
    this.ui = ui
    const s = getSettings()
    sfx.volume = s.volume
    sfx.muted = s.muted

    // browsers only allow audio after a gesture
    const unlock = () => sfx.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }

  allTrackDefs(): TrackDef[] {
    return [...BUILTIN_TRACKS, ...getCustomTracks()]
  }

  trackDef(id: string): TrackDef {
    return this.allTrackDefs().find((t) => t.id === id) ?? BUILTIN_TRACKS[0]
  }

  /** Build (and cache) the runtime Track for a definition. Custom tracks re-build when edited. */
  getTrack(def: TrackDef): Track {
    const key = def.custom ? `${def.id}:${JSON.stringify(def.points)}:${def.width}` : def.id
    let t = this.trackCache.get(key)
    if (!t) {
      t = new Track(def)
      this.trackCache.set(key, t)
    }
    return t
  }

  go(next: Scene) {
    this.scene?.exit()
    clear(this.ui)
    this.input.flush()
    this.input.setTouchVisible(false)
    this.scene = next
    this.failed = false
    next.enter()
  }

  start() {
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      // keep the loop alive even if a scene throws; one bad frame shouldn't freeze the game
      try {
        this.globalKeys()
        this.scene?.update(dt)
      } catch (err) {
        if (!this.failed) console.error('Scene update failed:', err)
        this.failed = true
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  private globalKeys() {
    if (this.input.consume('KeyM')) {
      sfx.setMuted(!sfx.muted)
      updateSettings({ muted: sfx.muted })
    }
  }
}
