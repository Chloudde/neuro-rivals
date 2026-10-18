import type { Track } from '../game/Track'

/** Draw a small silhouette of a circuit into a canvas (track cards, editor list). */
export function drawTrackPreview(canvas: HTMLCanvasElement, track: Track, accent = '#4dffd2') {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || canvas.width / dpr
  const h = canvas.clientHeight || canvas.height / dpr
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of track.center) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pad = 14
  const s = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1))
  const ox = (w - (maxX - minX) * s) / 2 - minX * s
  const oy = (h - (maxY - minY) * s) / 2 - minY * s

  const path = new Path2D()
  track.center.forEach((p, i) => {
    const x = p.x * s + ox
    const y = p.y * s + oy
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  })
  path.closePath()
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = Math.max(4, track.width * s + 3)
  ctx.stroke(path)
  ctx.strokeStyle = '#2a2d36'
  ctx.lineWidth = Math.max(3, track.width * s)
  ctx.stroke(path)
  ctx.strokeStyle = accent
  ctx.lineWidth = 1.2
  ctx.setLineDash([4, 5])
  ctx.stroke(path)
  ctx.setLineDash([])

  const st = track.center[0]
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(st.x * s + ox, st.y * s + oy, 3.5, 0, Math.PI * 2)
  ctx.fill()
}
