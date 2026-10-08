// Pure GFM helpers: split a reply into markdown, alert and mermaid blocks,
// and rewrite the GFM bits a renderer may not draw (task lists, ~~strike~~).

export type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'alert'; type: AlertType; text: string }
  | { kind: 'mermaid'; text: string; fence: string }

export const ALERTS: Record<AlertType, { label: string; icon: string; color: string }> = {
  NOTE: { label: 'Note', icon: 'ℹ', color: 'ide' },
  TIP: { label: 'Tip', icon: '✦', color: 'success' },
  IMPORTANT: { label: 'Important', icon: '‼', color: 'merged' },
  WARNING: { label: 'Warning', icon: '▲', color: 'warning' },
  CAUTION: { label: 'Caution', icon: '✖', color: 'error' },
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*(\S*)/
const ALERT_START = /^\s{0,3}>\s?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i
const QUOTED = /^\s{0,3}>/
const UNQUOTE = /^\s{0,3}>\s?/

function closes(line: string, fence: string): boolean {
  const m = line.match(FENCE)
  return m !== null && m[2] === '' && m[1][0] === fence[0] && m[1].length >= fence.length
}

/**
 * Splits `text` into markdown, alert and closed ```mermaid segments; an alert
 * is never looked for inside a code fence, and a fence still open (a reply
 * streaming in) stays markdown.
 */
export function splitBlocks(text: string): Segment[] {
  const segments: Segment[] = []
  const lines = text.split('\n')
  let plain: string[] = []
  let fence: string | null = null

  const flush = () => {
    if (plain.join('\n').trim() !== '') {
      segments.push({ kind: 'markdown', text: plain.join('\n') })
    }
    plain = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceMatch = line.match(FENCE)

    if (fence !== null) {
      if (closes(line, fence)) {
        fence = null
      }
      plain.push(line)
      continue
    }
    if (fenceMatch && fenceMatch[2].toLowerCase() === 'mermaid') {
      const end = lines.findIndex((l, j) => j > i && closes(l, fenceMatch[1]))
      if (end !== -1) {
        flush()
        segments.push({
          kind: 'mermaid',
          text: lines.slice(i + 1, end).join('\n'),
          fence: lines.slice(i, end + 1).join('\n'),
        })
        i = end
        continue
      }
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      plain.push(line)
      continue
    }

    const alert = line.match(ALERT_START)
    if (!alert) {
      plain.push(line)
      continue
    }

    const body: string[] = []
    while (i + 1 < lines.length && QUOTED.test(lines[i + 1])) {
      body.push(lines[++i].replace(UNQUOTE, ''))
    }
    flush()
    segments.push({ kind: 'alert', type: alert[1].toUpperCase() as AlertType, text: body.join('\n') })
  }
  flush()

  return segments
}

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s)/
const STRIKE = /~~(?=\S)([^~\n]*?\S)~~/g
const CODE_SPAN = /(`+)[^`]*?\1/g

/** Draws a strike through each character with U+0336, for renderers without `del`. */
function strike(text: string): string {
  return Array.from(text).map(c => c + '̶').join('')
}

/** Rewrites task-list boxes as ☐/☑ and ~~text~~ as struck text, outside code. */
export function rewriteInline(text: string): string {
  let fence: string | null = null

  return text
    .split('\n')
    .map(line => {
      const fenceMatch = line.match(FENCE)
      if (fence !== null) {
        if (closes(line, fence)) {
          fence = null
        }
        return line
      }
      if (fenceMatch) {
        fence = fenceMatch[1]
        return line
      }

      const tasked = line.replace(TASK, (_, lead: string, mark: string) => `${lead}${mark === ' ' ? '☐' : '☑'}`)
      let out = ''
      let last = 0
      for (const m of tasked.matchAll(CODE_SPAN)) {
        out += tasked.slice(last, m.index).replace(STRIKE, (_, inner: string) => strike(inner)) + m[0]
        last = m.index! + m[0].length
      }
      return out + tasked.slice(last).replace(STRIKE, (_, inner: string) => strike(inner))
    })
    .join('\n')
}
