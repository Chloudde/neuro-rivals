# Neuro Rivals

A 2D top-down racer where **neural-network AI drivers learn to race, and you race against them.**

Inspired by those "I trained AI cars to race" videos — except the AI isn't competing with itself,
it's competing with _you_. Each generation of AI drivers evolves on the track; your job is to stay ahead.

## Status

- [x] **Base game** – drivable car, track, sensors, laps, camera
- [ ] Neural network + neuroevolution (genetic algorithm)
- [ ] Training mode (many cars, fast-forward, generation stats)
- [ ] Race mode: player vs. the best evolved drivers
- [ ] Saving/loading trained brains
- [ ] Multiple tracks / track editor

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

| Key           | Action          |
| ------------- | --------------- |
| `W` / `↑`     | Throttle        |
| `S` / `↓`     | Brake / reverse |
| `A D` / `← →` | Steer           |
| `R`           | Reset car       |
| `V`           | Toggle sensors  |

Other scripts: `npm run build`, `npm test`, `npm run typecheck`, `npm run format`.

## Layout

```
src/
  main.ts            entry point
  game/
    Game.ts          fixed-timestep loop, input -> physics -> render
    Car.ts           arcade physics + lap progress tracking
    Track.ts         spline-based closed circuit, borders, projection
    Sensors.ts       raycast "eyes" -> normalised 0..1 readings (future NN inputs)
    Input.ts         keyboard
    Renderer.ts      canvas drawing + follow camera
    math.ts          vector / geometry helpers
tests/               vitest
```

## How the AI will plug in

`Car.update(dt, controls)` takes `{ throttle, steer }` — the same interface for the human and the AI.
The AI's brain just maps `car.sensors.readings` (+ speed) to those two numbers.
