import './style.css'
import { App } from './ui/App'
import { ChampionshipScene } from './ui/ChampionshipScene'
import { EditorScene } from './ui/EditorScene'
import { LabScene } from './ui/LabScene'
import { MenuScene } from './ui/MenuScene'
import { RaceScene } from './ui/RaceScene'
import { SettingsScene } from './ui/SettingsScene'
import { SetupScene } from './ui/SetupScene'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ui = document.getElementById('ui') as HTMLElement

const app = new App(canvas, ui)
app.nav = {
  menu: () => app.go(new MenuScene(app)),
  setup: (mode) => app.go(new SetupScene(app, mode)),
  race: (params) => app.go(new RaceScene(app, params)),
  lab: (trackId) => app.go(new LabScene(app, trackId)),
  editor: (trackId) => app.go(new EditorScene(app, trackId)),
  settings: (tab) => app.go(new SettingsScene(app, tab)),
  championship: () => app.go(new ChampionshipScene(app)),
}

app.nav.menu()
app.start()

// handy for poking at the game from the dev console
;(window as unknown as { app: App }).app = app
