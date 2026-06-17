#!/usr/bin/env bash
#
# Publish the nebula packages to npm in dependency order.
#
# Uses `bun publish` (the packages ship TS source + a bun shebang, so bun is the
# native fit and resolves the cross-package deps correctly). Each package prompts
# for a one-time 2FA code (OTP) from your AUTHENTICATOR APP — this is the secure
# path. NEVER paste your recovery codes here; if you ever did, regenerate them
# first at npmjs.com → Account → Two-Factor Authentication.
#
# Prereqs:
#   1. Logged in:   npm whoami                 (else: npm login)
#   2. 2FA enabled on npm (authenticator OTP).
#   3. ALL packages bumped to the SAME new version — npm rejects re-publishing an
#      existing version. Bump every packages/*/package.json "version" AND the
#      cross-package "nebula-ai-*" dependency pins to match, then run this.
#   4. Run from the repo root:   bash scripts/publish-npm.sh
#
# Consumers install with bun (the CLI is bun-native):
#   bun install -g nebula-ai-agent   &&   nebula
set -euo pipefail

# Dependency order: a package must be on npm before anything that depends on it.
PACKAGES=(core plugin-onchain plugin-system plugin-telegram gateway cli)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ver() { grep -m1 '"version"' "packages/$1/package.json" | sed -E 's/[^0-9.]//g'; }
pkgname() { grep -m1 '"name"' "packages/$1/package.json" | sed -E 's/.*"name": *"([^"]+)".*/\1/'; }

# --- version-consistency guard ------------------------------------------------
base="$(ver core)"
mismatch=0
for p in "${PACKAGES[@]}"; do
  v="$(ver "$p")"
  if [ "$v" != "$base" ]; then
    echo "✗ version mismatch: packages/$p ($(pkgname "$p")) is $v — expected $base"
    mismatch=1
  fi
done
if [ "$mismatch" = 1 ]; then
  echo
  echo "Bump ALL packages to the same NEW version (+ their nebula-ai-* dep pins) first."
  echo "npm rejects re-publishing a version that already exists."
  exit 1
fi

echo "Publishing nebula @ ${base}"
echo "Logged in as: $(npm whoami 2>/dev/null || echo 'NOT LOGGED IN — run: npm login')"
echo "When prompted, enter the OTP from your authenticator app (never recovery codes)."
echo

for p in "${PACKAGES[@]}"; do
  name="$(pkgname "$p")"
  echo "──> publishing ${name}  (packages/$p @ ${base})"
  ( cd "packages/$p" && bun publish )   # prompts for OTP; add --otp=<code> if non-interactive
  echo "    done: ${name}"
  echo
done

echo "✓ All packages published @ ${base}."
echo "  Try it:  bun install -g nebula-ai-agent  &&  nebula"
