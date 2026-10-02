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

function width(art: string): number {
  return Math.max(...art.split('\n').map(l => Array.from(l).length))
}

/** The diagram as text art at most `columns` wide, tightening the spacing to fit. */
export function mermaidArt(source: string, columns: number): string | undefined {
  for (const paddingX of [5, 3, 1]) {
    const art = remember(arts, `${paddingX}:${source}`, () => {
      try {
        return renderMermaidASCII(source, { colorMode: 'none', paddingX }).replace(/\s+$/gm, '')
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
