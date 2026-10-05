import { describe, expect, test } from 'claude-code/testing'

import { rewriteInline, splitBlocks } from './gfm'
import { mermaidArt, themeSvg } from './mermaid'

const REPLY = [
  'Intro **text**',
  '',
  '> [!WARNING]',
  '> Ne pas utiliser `git` ici.',
  '> - point',
  '',
  '```md',
  '> [!NOTE]',
  '> inside a fence',
  '```',
  '',
  '- [ ] todo',
  '- [x] done ~~old~~ `~~kept~~`',
].join('\n')

describe('splitBlocks', () => {
  test('cuts the alert out, not the fenced one', async () => {
    const segments = splitBlocks(REPLY)
    expect(segments.map(s => s.kind)).toEqual(['markdown', 'alert', 'markdown'])
    expect(segments[1]).toEqual({ kind: 'alert', type: 'WARNING', text: 'Ne pas utiliser `git` ici.\n- point' })
    expect(segments[2].text).toContain('> [!NOTE]')
  })

  test('leaves a plain blockquote alone', async () => {
    expect(splitBlocks('> just a quote').map(s => s.kind)).toEqual(['markdown'])
  })
})

const DIAGRAM = [
  'Avant',
  '```mermaid',
  'graph LR',
  '  A[Client] --> B(Proxy)',
  '```',
  'Après',
].join('\n')

describe('mermaid', () => {
  test('cuts out a closed mermaid fence only', async () => {
    expect(splitBlocks(DIAGRAM).map(s => s.kind)).toEqual(['markdown', 'mermaid', 'markdown'])
    expect(splitBlocks(DIAGRAM).at(1)?.text).toBe('graph LR\n  A[Client] --> B(Proxy)')
    expect(splitBlocks('```mermaid\ngraph LR\n  A --> B').map(s => s.kind)).toEqual(['markdown'])
  })

  test('draws text art on the terminal, a code block elsewhere without node', async $ => {
    const term = await $.ui.mount({
      plugin: 'gfm-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: DIAGRAM, isFirstOfReply: true },
      viewport: { columns: 100, rows: 40 },
    })
    expect(await term.find({ type: 'Text', text: /Client.*Proxy/ })).toBeDefined()
    await term.unmount()

    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({
        plugin: 'gfm-render',
        surface,
        component: 'AssistantMessage',
        props: { text: DIAGRAM, isFirstOfReply: true },
      })
      // The test kit runs no process: the SVG falls back to the art in a fence.
      expect(await ui.find({ type: 'Markdown', text: /```\n.*Client/s })).toBeDefined()
      await ui.unmount()
    }
  })

  test('themes the SVG for light and dark', async () => {
    const svg = themeSvg('<svg viewBox="0 0 1 1" style="--bg:#FFFFFF;--fg:#27272A">\n<style>\n  @import url(\'https://x\');\n</style></svg>')
    expect(svg).toContain('prefers-color-scheme: dark')
    expect(svg).not.toContain('@import')
    expect(svg).not.toContain('style="--bg')
    expect(themeSvg('Error: nope')).toBeUndefined()
  })

  test('toggles a drawn diagram between its SVG and its source', async ($, on) => {
    on('process.run', async () => ({
      value: {
        exitCode: 0,
        stdout: '<svg viewBox="0 0 1 1" style="--bg:#FFFFFF;--fg:#27272A"></svg>',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }))
    const text = '```mermaid\ngraph TD\n  X --> Y\n```'
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({
        plugin: 'gfm-render',
        surface,
        component: 'AssistantMessage',
        props: { text, isFirstOfReply: false },
      })
      expect(await ui.find({ type: 'Svg' })).toBeDefined()
      expect((await ui.find({ key: 'mermaid-0-toggle' }))?.props.label).toBe('Code')

      await ui.press({ key: 'mermaid-0-toggle' })
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await ui.find({ type: 'Code', source: /X --> Y/ })).toBeDefined()
      expect((await ui.find({ key: 'mermaid-0-toggle' }))?.props.label).toBe('Diagramme')

      await ui.press({ key: 'mermaid-0-toggle' })
      expect(await ui.find({ type: 'Svg' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('falls back to the code block when it cannot draw', async $ => {
    const broken = '```mermaid\nnot a diagram\n```'
    const term = await $.ui.mount({
      plugin: 'gfm-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: broken, isFirstOfReply: false },
      viewport: { columns: 100, rows: 40 },
    })
    expect(await term.find({ type: 'Markdown', text: /not a diagram/ })).toBeDefined()
    await term.unmount()

    const narrow = await $.ui.mount({
      plugin: 'gfm-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: DIAGRAM, isFirstOfReply: false },
      viewport: { columns: 12, rows: 40 },
    })
    expect(await narrow.find({ type: 'Markdown', text: /```mermaid/ })).toBeDefined()
    await narrow.unmount()
  })
})

describe('wide characters', () => {
  test('sizes boxes to the two columns a CJK character takes', async () => {
    const art = mermaidArt(['sequenceDiagram', '  participant 使用者', '  participant API', '  使用者->>API: 送出'].join('\n'), 100)
    // Three CJK characters take six columns, plus a space on each side.
    expect(art?.split('\n')[0]).toStartWith('┌────────┐')
    expect(art).toContain('│ 使用者 │')
    expect(art).not.toContain('')
  })

  test('falls back to the code block when the renderer draws nothing', async $ => {
    // beautiful-mermaid parses no node from CJK ids and returns blank art.
    const blank = '```mermaid\nflowchart TD\n  請求 --> 處理\n```'
    expect(mermaidArt('flowchart TD\n  請求 --> 處理', 100)).toBeUndefined()
    const term = await $.ui.mount({
      plugin: 'gfm-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: blank, isFirstOfReply: false },
      viewport: { columns: 100, rows: 40 },
    })
    expect(await term.find({ type: 'Markdown', text: /```mermaid/ })).toBeDefined()
    await term.unmount()
  })

  test('falls back rather than draw CJK out of line', async () => {
    // A state id holding CJK fails to parse once widened; unwidened it draws misaligned.
    expect(mermaidArt('stateDiagram-v2\n  [*] --> 待處理\n  待處理 --> [*]', 100)).toBeUndefined()
  })
})

describe('rewriteInline', () => {
  test('draws task boxes and strikes outside code', async () => {
    const out = rewriteInline(REPLY)
    expect(out).toContain('- ☐ todo')
    expect(out).toContain('- ☑ done o̶l̶d̶ `~~kept~~`')
    expect(out).toContain('> [!NOTE]')
  })
})

describe('AssistantMessage', () => {
  test('draws the alert on every surface', async $ => {
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({
        plugin: 'gfm-render',
        surface,
        component: 'AssistantMessage',
        props: { text: REPLY, isFirstOfReply: true },
      })
      expect(await ui.find({ type: 'Text', text: /Warning/ })).toBeDefined()
      expect(await ui.find({ type: 'Markdown', text: /Ne pas utiliser/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('spaces alerts out on desktop only', async $ => {
    for (const [surface, margin] of [['terminal', 0], ['desktop', 1]] as const) {
      const ui = await $.ui.mount({
        plugin: 'gfm-render',
        surface,
        component: 'AssistantMessage',
        props: { text: REPLY, isFirstOfReply: false },
      })
      const box = await ui.find({ key: 'alert-1' })
      expect(box?.props.marginY).toBe(margin)
      expect(box?.props.paddingY).toBe(margin)
      await ui.unmount()
    }
  })

  test('rewrites task lists on the terminal only', async $ => {
    const term = await $.ui.mount({
      plugin: 'gfm-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: REPLY, isFirstOfReply: false },
    })
    expect(await term.find({ type: 'Markdown', text: /☐ todo/ })).toBeDefined()
    await term.unmount()

    const desk = await $.ui.mount({
      plugin: 'gfm-render',
      surface: 'desktop',
      component: 'AssistantMessage',
      props: { text: REPLY, isFirstOfReply: false },
    })
    expect(await desk.find({ type: 'Markdown', text: /\[ \] todo/ })).toBeDefined()
    await desk.unmount()
  })
})

