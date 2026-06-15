#!/usr/bin/env bash
# nebula installer — installs the `nebula` CLI and makes it runnable from any terminal.
#
#   curl -fsSL https://raw.githubusercontent.com/rstfulzz/nebula/main/install.sh | bash
#
# nebula is bun-native, so this ensures bun is present, installs the CLI
# globally (`bun add -g nebula-ai-agent`), and adds bun's global bin dir to your
# shell PATH so typing `nebula` Just Works — like `claude`.
set -euo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
warn() { printf '\033[33m  %s\033[0m\n' "$1"; }

bold "▸ Installing nebula"

# 1. Ensure bun (the CLI shebangs bun and runs TypeScript directly).
if ! command -v bun >/dev/null 2>&1; then
  info "bun not found — installing it from https://bun.sh …"
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
BUN_BIN="$BUN_INSTALL/bin"

# 2. Install the CLI globally.
info "Installing nebula-ai-agent (the \`nebula\` CLI) …"
bun add -g nebula-ai-agent

# 3. Put bun's global bin dir on PATH (idempotent) in whichever shell rc exists.
PATH_LINE='export PATH="$HOME/.bun/bin:$PATH"'
added_to=""
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
  [ -f "$rc" ] || continue
  if ! grep -qF '.bun/bin' "$rc" 2>/dev/null; then
    printf '\n# nebula / bun global bin\n%s\n' "$PATH_LINE" >> "$rc"
    added_to="$added_to $rc"
  fi
done

# 4. Report.
echo
if command -v nebula >/dev/null 2>&1 || [ -x "$BUN_BIN/nebula" ]; then
  bold "✓ nebula installed ($("$BUN_BIN/nebula" --version 2>/dev/null || echo '?'))"
else
  bold "✓ nebula installed"
fi
[ -n "$added_to" ] && info "Added bun's bin dir to:$added_to"
echo
info "Open a NEW terminal (or run: source ~/.zshrc), then:"
info "  nebula init      # bootstrap your agent (local keystore, plain-EOA identity)"
info "  nebula           # chat with your agent"
echo
if ! printf ':%s:' "$PATH" | grep -q ":$BUN_BIN:"; then
  warn "If 'nebula: command not found', add this to your shell rc and reopen the terminal:"
  warn "  $PATH_LINE"
fi
