import type { GenStat } from '../ai/Evolution'
import type { NeuralNetwork } from '../ai/NeuralNetwork'

function setup(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { ctx, w, h }
}

/** Best / average fitness per generation. */
export function drawHistoryChart(canvas: HTMLCanvasElement, history: GenStat[]) {
  const { ctx, w, h } = setup(canvas)
  const padL = 34
  const padB = 16
  const padT = 8
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.textAlign = 'right'

  if (history.length < 2) {
    ctx.textAlign = 'center'
    ctx.fillText('Waiting for generations…', w / 2, h / 2)
    return
  }
  const max = Math.max(...history.map((s) => s.best), 1)
  const x = (i: number) => padL + (i / (history.length - 1)) * (w - padL - 6)
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB)

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  for (let k = 0; k <= 4; k++) {
    const yy = padT + (k / 4) * (h - padT - padB)
    ctx.beginPath()
    ctx.moveTo(padL, yy)
    ctx.lineTo(w - 6, yy)
    ctx.stroke()
    ctx.fillText(String(Math.round(max * (1 - k / 4))), padL - 4, yy + 3)
  }

  const line = (get: (s: GenStat) => number, color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    history.forEach((s, i) => (i === 0 ? ctx.moveTo(x(i), y(get(s))) : ctx.lineTo(x(i), y(get(s)))))
    ctx.stroke()
  }
  line((s) => s.avg, '#4da6ff', 1.5)
  line((s) => s.best, '#4dffd2', 2)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#4dffd2'
  ctx.fillText('best', padL + 4, h - 3)
  ctx.fillStyle = '#4da6ff'
  ctx.fillText('average', padL + 38, h - 3)
}

const IN_LABELS = [
  '-100°',
  '-75°',
  '-50°',
  '-25°',
  'ahead',
  '+25°',
  '+50°',
  '+75°',
  '+100°',
  'speed',
  'slip',
  'nitro',
]
const OUT_LABELS = ['gas / brake', 'steer', 'nitro']

/** Draw a live view of a network: node brightness = activation, edge colour = weight sign. */
export function drawNetwork(canvas: HTMLCanvasElement, net: NeuralNetwork | null) {
  const { ctx, w, h } = setup(canvas)
  if (!net) return
  const layers = net.layers
  const padX = 74
  const padY = 12
  const colX = (l: number) => padX + (l / (layers.length - 1)) * (w - padX * 2 - 10)
  const nodeY = (l: number, i: number) => {
    const n = layers[l]
    return padY + ((i + 0.5) / n) * (h - padY * 2)
  }

  // edges
  let k = 0
  for (let l = 1; l < layers.length; l++) {
    for (let o = 0; o < layers[l]; o++) {
      for (let i = 0; i < layers[l - 1]; i++) {
        const wgt = net.weights[k++]
        const a = Math.min(1, Math.abs(wgt) * 0.8)
        if (a < 0.08) continue
        ctx.strokeStyle = wgt > 0 ? `rgba(77,255,210,${a * 0.55})` : `rgba(255,107,107,${a * 0.55})`
        ctx.lineWidth = 0.5 + a * 1.3
        ctx.beginPath()
        ctx.moveTo(colX(l - 1), nodeY(l - 1, i))
        ctx.lineTo(colX(l), nodeY(l, o))
        ctx.stroke()
      }
      k++ // bias
    }
  }

  // nodes
  const r = Math.min(7, (h - padY * 2) / Math.max(...layers) / 2.4)
  for (let l = 0; l < layers.length; l++) {
    for (let i = 0; i < layers[l]; i++) {
      const act = net.activations[l][i]
      const mag = Math.min(1, Math.abs(act))
      ctx.fillStyle =
        act >= 0
          ? `rgba(77,255,210,${0.15 + mag * 0.85})`
          : `rgba(255,107,107,${0.15 + mag * 0.85})`
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(colX(l), nodeY(l, i), r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // labels
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'right'
  const last = layers.length - 1
  if (layers[0] === IN_LABELS.length) {
    for (let i = 0; i < layers[0]; i++) ctx.fillText(IN_LABELS[i], colX(0) - r - 5, nodeY(0, i) + 3)
  }
  ctx.textAlign = 'left'
  if (layers[last] === OUT_LABELS.length) {
    for (let i = 0; i < layers[last]; i++)
      ctx.fillText(OUT_LABELS[i], colX(last) + r + 5, nodeY(last, i) + 3)
  }
}
