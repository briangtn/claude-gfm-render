// Mermaid source to Unicode art (in process, vendored beautiful-mermaid ASCII
// renderer) or to SVG (node running renderer/svg.mjs, since ELK's layout is
// over the size a hooks module may import); undefined when it cannot draw.

import { renderMermaidASCII } from './vendor/mermaid-ascii.js'

// What a Svg element takes at most.
const MAX_SVG = 131072

// Light and dark backgrounds of the desktop transcript, so node fills blend in.
const THEME = `<style>
  svg { --bg: #FFFFFF; --fg: #27272A; }
  @media (prefers-color-scheme: dark) { svg { --bg: #1F1F1E; --fg: #E4E4E7; } }
</style>`

const arts = new Map<string, string | undefined>()

export function remember<T>(cache: Map<string, T>, key: string, make: () => T): T {
  if (!cache.has(key)) {
    if (cache.size > 100) {
      cache.clear()
    }
    cache.set(key, make())
  }
  return cache.get(key)!
}

// East Asian Wide and Fullwidth characters, and wide emoji: two terminal cells each.
const WIDE: [number, number][] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff], [0x1fa70, 0x1faff], [0x20000, 0x3fffd],
]

function isWide(char: string): boolean {
  const code = char.codePointAt(0)!
  return WIDE.some(([from, to]) => code >= from && code <= to)
}

// The renderer counts code points, so a private-use character after each wide one
// makes it reserve the second cell; it is deleted from the drawing afterwards.
const PAD = '\ue000'

/** Terminal cells the widest line takes. */
function width(art: string): number {
  return Math.max(...art.split('\n').map(l => Array.from(l).reduce((n, c) => n + (isWide(c) ? 2 : 1), 0)))
}

/** The art at one spacing, or undefined when the renderer lost some of the text. */
function render(source: string, paddingX: number): string | undefined {
  const chars = Array.from(source)
  if (!chars.some(isWide)) {
    return renderMermaidASCII(source, { colorMode: 'none', paddingX }).replace(/\s+$/gm, '')
  }
  const widened = chars.map(c => (isWide(c) ? c + PAD : c)).join('')
  const art = renderMermaidASCII(widened, { colorMode: 'none', paddingX }).replaceAll(PAD, '')
  // The renderer silently drops nodes whose id is wide (a label is fine), so a run of
  // wide characters missing from the drawing means text was lost: use the code block.
  const runs = chars.map(c => (isWide(c) ? c : ' ')).join('').split(' ').filter(Boolean)
  return runs.every(run => art.includes(run)) ? art.replace(/\s+$/gm, '') : undefined
}

/** The diagram as text art at most `columns` wide, tightening the spacing to fit. */
export function mermaidArt(source: string, columns: number): string | undefined {
  for (const paddingX of [5, 3, 1]) {
    const art = remember(arts, `${paddingX}:${source}`, () => {
      try {
        return render(source, paddingX)
      } catch {
        return undefined
      }
    })
    if (art === undefined) {
      return undefined
    }
    if (width(art) <= columns) {
      return art
    }
  }
  return undefined
}

/** The SVG as drawn: no web font to fetch, colors that follow the light or dark scheme. */
export function themeSvg(svg: string): string | undefined {
  const themed = svg
    .replace(/@import url\([^)]*\);?/, '')
    .replace(/ style="--bg:[^"]*"/, '')
    .replace(/^(<svg[^>]*>)/, `$1${THEME}`)
  return themed.startsWith('<svg') && themed.length <= MAX_SVG ? themed : undefined
}
