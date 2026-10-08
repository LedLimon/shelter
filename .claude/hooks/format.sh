#!/usr/bin/env bash
# PostToolUse hook: format the edited file with the project's Prettier.
# No-op until Prettier is installed (task FND-1) or for unsupported files.
set -euo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
prettier="$root/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.md|*.mdx|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac

"$prettier" --write --log-level warn --ignore-unknown "$file" >/dev/null 2>&1 || true
