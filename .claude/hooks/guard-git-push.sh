#!/usr/bin/env bash
# PreToolUse hook (Bash): block agents from pushing to main or force-pushing.
# Humans push from their own terminal — hooks only run inside Claude Code.
set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

block() { echo "Заблокировано хуком проекта: $1. Работай в ветке и открывай PR (см. AGENTS.md)." >&2; exit 2; }

# Take what follows the first "git push" up to the next shell separator.
rest=${cmd#*git push}
rest=${rest%%[;&|]*}
read -r -a args <<< "$rest" || true

positional=()
for a in "${args[@]:-}"; do
  case "$a" in
    --force|--force-with-lease*|--force-if-includes|-f|--mirror|--delete|-d) block "force-push/удаление/mirror запрещены" ;;
    -*|"") ;;
    *) positional+=("$a") ;;
  esac
done

if [ "${#positional[@]}" -ge 2 ]; then
  for ref in "${positional[@]:1}"; do
    target=${ref##*:}
    case "$ref" in +*) block "force-push запрещён" ;; esac
    if [ "$target" = "main" ] || [ "$target" = "refs/heads/main" ]; then
      block "пуш в main запрещён"
    fi
    if [ "$target" = "HEAD" ]; then
      branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
      [ "$branch" = "main" ] && block "текущая ветка — main"
    fi
  done
else
  branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  [ "$branch" = "main" ] && block "текущая ветка — main"
fi
exit 0
