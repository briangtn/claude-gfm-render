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

// beautiful-mermaid sizes a label by its code points, so a CJK character
// (two terminal columns) overflows its box. Each one is followed by PAD while
// the renderer measures and draws, then PAD is dropped: the character keeps
// the two cells it was given.
const PAD = ''
// East Asian Wide and Fullwidth blocks, the ones a terminal draws two columns wide.
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/g

/** Columns the widest line takes, PAD still in, so a wide character counts two. */
function width(art: string): number {
  return Math.max(...art.split('\n').map(l => Array.from(l).length))
}

/** The diagram as text art at most `columns` wide, tightening the spacing to fit. */
export function mermaidArt(source: string, columns: number): string | undefined {
  const widened = source.replace(WIDE, c => c + PAD)
  for (const paddingX of [5, 3, 1]) {
    const art = remember(arts, `${paddingX}:${widened}`, () => {
      try {
        const drawn = renderMermaidASCII(widened, { colorMode: 'none', paddingX }).replace(/\s+$/gm, '')
        // Blank when nothing parsed, e.g. a CJK id the widening broke: the code block beats a hole.
        return drawn.trim() === '' ? undefined : drawn
      } catch {
        return undefined
      }
    })
    if (art === undefined) {
      return undefined
    }
    if (width(art) <= columns) {
      return art.replaceAll(PAD, '')
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
