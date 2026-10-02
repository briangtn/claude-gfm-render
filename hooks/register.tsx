import type { EngineInterface, Register } from 'claude-code'

import { ALERTS, rewriteInline, splitBlocks } from './gfm'
import type { Segment } from './gfm'
import { mermaidArt, remember, themeSvg } from './mermaid'

// What a Markdown element takes at most.
const MAX_MARKDOWN = 10000

const svgs = new Map<string, Promise<string | undefined>>()

/** The diagram as an SVG, rendered once per source by node running renderer/svg.mjs. */
function mermaidSvg($: EngineInterface, source: string): Promise<string | undefined> {
  return remember(svgs, source, async () => {
    try {
      const { exitCode, stdout } = await $.process.run(['node', `${$.plugin.root}/renderer/svg.mjs`], {
        stdin: source,
        timeoutMs: 10000,
      })
      return exitCode === 0 ? themeSvg(stdout) : undefined
    } catch {
      return undefined
    }
  })
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // The desktop, VS Code and mobile renderers already draw task lists and
    // strikethrough; the terminal's may not, so only it gets the rewrite.
    const text = e.surface === 'terminal' ? rewriteInline(e.props.text) : e.props.text
    const segments = splitBlocks(text)

    if (!segments.some(s => s.kind !== 'markdown') || segments.some(s => s.text.length > MAX_MARKDOWN)) {
      return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
    }

    const { Box, Text, Markdown } = $.ui.resolve(e)
    // Room left beside the terminal's bullet and the alert border.
    const columns = (e.viewport?.columns ?? 80) - 4

    // Rendered before drawing: an SVG takes a node process (cached per source).
    const svgs = new Map<number, string | undefined>()
    if (e.surface !== 'terminal') {
      await Promise.all(
        segments.map(async (s, i) => {
          if (s.kind === 'mermaid') {
            svgs.set(i, await mermaidSvg($, s.text))
          }
        }),
      )
    }

    const diagram = (s: Extract<Segment, { kind: 'mermaid' }>, i: number) => {
      const key = `mermaid-${i}`
      if (e.surface === 'terminal') {
        const art = mermaidArt(s.text, columns)
        if (art === undefined) {
          return <Markdown key={key} text={s.fence} />
        }
        return (
          <Box key={key} flexDirection="column" marginTop={i === 0 ? 0 : 1} marginBottom={1}>
            {art.split('\n').map((line, j) => (
              <Text key={`${key}-${j}`} wrap="truncate-end">
                {line === '' ? ' ' : line}
              </Text>
            ))}
          </Box>
        )
      }
      const svg = svgs.get(i)
      if (svg === undefined) {
        // No node to draw the SVG: the text art in a code block, which scrolls.
        const art = mermaidArt(s.text, 200)
        return <Markdown key={key} text={art === undefined ? s.fence : `\`\`\`\n${art}\n\`\`\``} />
      }
      const { Svg } = $.ui.resolve(e)
      return (
        <Box key={key} marginTop={i === 0 ? 0 : 1} marginBottom={1}>
          <Svg source={svg} alt="Diagramme Mermaid" />
        </Box>
      )
    }

    const body = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {segments.map((s, i) => {
          if (s.kind === 'markdown') {
            return <Markdown key={`md-${i}`} text={s.text} />
          }
          if (s.kind === 'mermaid') {
            return diagram(s, i)
          }
          const alert = ALERTS[s.type]
          return (
            <Box
              key={`alert-${i}`}
              flexDirection="column"
              borderStyle="round"
              borderColor={alert.color}
              paddingX={1}
              // The desktop's proportional text packs boxes tighter than the
              // terminal's cells, so it gets room around and inside each one.
              marginY={e.surface === 'terminal' ? 0 : 1}
              paddingY={e.surface === 'terminal' ? 0 : 1}
            >
              <Text bold color={alert.color}>
                {`${alert.icon} ${alert.label}`}
              </Text>
              {s.text.trim() !== '' && <Markdown text={s.text} />}
            </Box>
          )
        })}
      </Box>
    )

    // The terminal opens a reply with a bullet; keep it, since this tree
    // replaces the engine's whole drawing of the block.
    if (e.surface === 'terminal' && e.props.isFirstOfReply) {
      return (
        <Box flexDirection="row">
          <Box width={2} flexShrink={0}>
            <Text>⏺</Text>
          </Box>
          {body}
        </Box>
      )
    }
    return body
  })
}
