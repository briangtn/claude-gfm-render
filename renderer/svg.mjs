// Reads Mermaid source on stdin and writes its SVG on stdout. Run by node from
// the hooks module, since ELK's layout is too large for the module to import.

import { renderMermaidSVG } from './beautiful-mermaid.mjs'

let source = ''
for await (const chunk of process.stdin) {
  source += chunk
}

try {
  process.stdout.write(renderMermaidSVG(source, { transparent: true }))
} catch (error) {
  process.stderr.write(String(error?.message ?? error))
  process.exit(1)
}
