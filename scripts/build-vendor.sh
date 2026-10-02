#!/usr/bin/env bash
# Rebuilds the two vendored beautiful-mermaid bundles with bun.
# - hooks/vendor/mermaid-ascii.js: the ASCII renderer alone, imported by the hooks
#   module (a hooks module may not import a file over 1 MiB, and ELK is 1.6 MB).
# - renderer/beautiful-mermaid.mjs: the whole library with ELK, run by node.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.devDependencies["beautiful-mermaid"]' package.json)
bun install
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "export { renderMermaidASCII } from '$PWD/node_modules/beautiful-mermaid/src/ascii/index.ts'" > "$tmp/ascii.ts"
echo "export { renderMermaidSVG } from '$PWD/node_modules/beautiful-mermaid/src/index.ts'" > "$tmp/svg.ts"
bun build "$tmp/ascii.ts" --target=browser --format=esm --minify --outfile="$tmp/ascii.js"
bun build "$tmp/svg.ts" --target=browser --format=esm --minify --outfile="$tmp/svg.js"

{ echo "// beautiful-mermaid $VERSION ASCII renderer (MIT, lukilabs/Craft), bundled with bun build --minify."; cat "$tmp/ascii.js"; } > hooks/vendor/mermaid-ascii.js
{ echo "// beautiful-mermaid $VERSION + elkjs (MIT, EPL-2.0), bundled with bun build --minify; run by node, never imported by the hooks module."; cat "$tmp/svg.js"; } > renderer/beautiful-mermaid.mjs
cp node_modules/beautiful-mermaid/LICENSE renderer/LICENSE-beautiful-mermaid
cp node_modules/elkjs/LICENSE.md renderer/LICENSE-elkjs
ls -la hooks/vendor/mermaid-ascii.js renderer/beautiful-mermaid.mjs
