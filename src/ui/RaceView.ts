import { DT } from '../config'
import { Particles, SkidMarks } from '../game/Effects'
import { GhostPlayer } from '../game/Ghost'
import type { Race, RaceEvent } from '../game/Race'
import type { Renderer } from '../game/Renderer'
import { sfx } from '../game/Audio'

/** Everything needed to draw a Race: effects, ghost, camera target. Shared by the menu demo and real races. */
export class RaceView {
  readonly skids = new SkidMarks()
  readonly particles = new Particles()
  ghost: GhostPlayer | null = null
  private lastCrash = 0
  /** 0 = hidden, 1 = your car's sensors, 2 = every car's sensors (see what the AIs see) */
  sensorMode: 0 | 1 | 2 = 0
  /** show name tags above cars */
  labels = true

  constructor(
    private renderer: Renderer,
    readonly race: Race,
  ) {
    renderer.setTrack(race.track)
    renderer.mode = 'follow'
    const lead = race.player ?? race.cars[0]
    renderer.follow = lead.car
    renderer.cam.x = lead.car.pos.x
    renderer.cam.y = lead.car.pos.y
  }

  /** Call after each physics tick. */
  afterStep(events: RaceEvent[], screenShake: boolean) {
    for (const rc of this.race.cars) {
      this.skids.update(rc.car)
      this.particles.emitFor(rc.car, DT)
    }
    const player = this.race.player?.car
    for (const e of events) {
      if (e.type !== 'impact') continue
      this.particles.sparks(e.x, e.y, e.strength)
      if (player) {
        const d = Math.hypot(player.pos.x - e.x, player.pos.y - e.y)
        if (d < 600) {
          // sustained contact fires an event every tick: only voice one crash every ~100ms
          const now = performance.now()
          if (now - this.lastCrash > 100) {
            this.lastCrash = now
            sfx.crash(e.strength * (1 - d / 700))
          }
          if (screenShake && d < 60) this.renderer.addShake(e.strength * 0.8)
        }
      }
    }
  }

  draw(dt: number) {
    this.particles.update(dt)
    const { race } = this
    const player = race.player

    let ghostPos: { x: number; y: number; angle: number } | null = null
    if (this.ghost && player && player.car.lapsCompleted >= 1 && race.state !== 'countdown') {
      ghostPos = this.ghost.at(player.car.lapTime)
    }

    this.renderer.draw(
      {
        track: race.track,
        skids: this.skids,
        particles: this.particles,
        ghost: ghostPos,
        cars: race.cars.map((rc) => ({
          car: rc.car,
          label: this.labels ? (rc.isPlayer ? 'YOU' : rc.entrant.name) : undefined,
          isPlayer: rc.isPlayer,
          showSensors: this.sensorMode === 2 || (this.sensorMode === 1 && rc.isPlayer),
        })),
      },
      dt,
    )
  }
}
