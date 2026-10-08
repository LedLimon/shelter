#!/usr/bin/env bash
# PostToolUse hook: format the edited file with the project's Prettier.
# No-op when Prettier is not installed (run `pnpm install`) or for unsupported files.
set -euo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0

# Resolve the checkout that owns the file: in a git worktree CLAUDE_PROJECT_DIR
# may point to the main checkout, whose node_modules differ or are missing.
# Files outside any git checkout (memory, scratchpad) are left alone.
root=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null) || exit 0
prettier="$root/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0

case "$file" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.md|*.mdx|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac

# Hooks run in a non-interactive shell where mise may not be activated.
if ! command -v node >/dev/null 2>&1 && command -v mise >/dev/null 2>&1; then
  eval "$(mise -C "$root" env -s bash 2>/dev/null)" || true
fi

# Run from the root so Prettier picks up .prettierignore and .gitignore.
cd "$root"
"$prettier" --write --log-level warn --ignore-unknown "$file" >/dev/null 2>&1 || true
