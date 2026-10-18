type Child = Node | string | number | null | undefined | false

interface Props {
  class?: string
  text?: string
  html?: string
  title?: string
  id?: string
  style?: string
  width?: number
  height?: number
  type?: string
  value?: string | number
  min?: number
  max?: number
  step?: number
  checked?: boolean
  disabled?: boolean
  placeholder?: string
  href?: string
  download?: string
  accept?: string
  onclick?: (e: MouseEvent) => void
  oninput?: (e: Event) => void
  onchange?: (e: Event) => void
  [data: `data-${string}`]: string | undefined
}

/** Tiny hyperscript helper: h('div', {class: 'x'}, child, child...). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue
    if (k === 'class') el.className = v as string
    else if (k === 'text') el.textContent = v as string
    else if (k === 'html') el.innerHTML = v as string
    else if (k === 'style') el.setAttribute('style', v as string)
    else if (k.startsWith('on')) (el as unknown as Record<string, unknown>)[k] = v
    else if (k === 'checked' || k === 'disabled') (el as unknown as Record<string, unknown>)[k] = v
    else if (k === 'value') (el as unknown as Record<string, unknown>)[k] = v
    else el.setAttribute(k, String(v))
  }
  append(el, children)
  return el
}

export function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    el.append(typeof c === 'object' ? c : document.createTextNode(String(c)))
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

/** 83.456 -> "1:23.456" */
export function fmtTime(sec: number | null | undefined, digits = 3): string {
  if (sec === null || sec === undefined || !isFinite(sec)) return '--:--.---'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  const whole = Math.floor(s)
  const frac = Math.round((s - whole) * 10 ** digits)
    .toString()
    .padStart(digits, '0')
  return `${m}:${String(whole).padStart(2, '0')}.${frac.slice(0, digits)}`
}

export function fmtGap(sec: number): string {
  return `+${sec.toFixed(1)}s`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Floating notification on top of everything (achievements, save confirmations). */
export function notify(title: string, body = '', icon = '🏅') {
  const root = document.getElementById('ui')
  if (!root) return
  let stack = root.querySelector('.notify-stack')
  if (!stack) {
    stack = h('div', { class: 'notify-stack' })
    root.append(stack)
  }
  const el = h(
    'div',
    { class: 'notify' },
    h('div', { class: 'notify-icon', text: icon }),
    h(
      'div',
      {},
      h('div', { class: 'notify-title', text: title }),
      h('div', { class: 'notify-body', text: body }),
    ),
  )
  stack.append(el)
  setTimeout(() => el.classList.add('out'), 4200)
  setTimeout(() => el.remove(), 4800)
}

/** Debounced "next frame" callback helper. */
export function raf(fn: () => void) {
  requestAnimationFrame(fn)
}
