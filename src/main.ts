import './style.css'
import { Game } from './game/Game'

const canvas = document.getElementById('game') as HTMLCanvasElement
const hud = document.getElementById('hud') as HTMLElement

new Game(canvas, hud).start()
