#!/usr/bin/env bash
# Deploy the nebula web console on a plain Node host (no bun required).
#
# Mirrors `origin/$NEBULA_DEPLOY_BRANCH` (default main), installs ONLY the web deps (isolated from the bun
# workspace so plain npm doesn't choke on the workspace `overrides`), builds,
# and (re)starts the app under pm2. Idempotent — safe to run on every deploy.
#
# Runtime secrets live in apps/web/.env.local on the host (gitignored, never in
# this repo): OPENAI_API_KEY, SESSION_SECRET, NEXT_PUBLIC_WC_PROJECT_ID, and
# optionally NEBULA_SIGNER_PRIVATE_KEY (+ NEBULA_POLICY_MAX_NATIVE_MNT) to
# enable policy-capped writes.
#
# Env knobs (all optional):
#   NEBULA_DIR            repo checkout dir        (default: $HOME/nebula)
#   NEBULA_WEB_PORT       port next listens on     (default: 3210)
#   NEBULA_PM2_NAME       pm2 process name         (default: nebula-web)
#   NEBULA_DEPLOY_BRANCH  branch to deploy         (default: main)
set -euo pipefail

REPO_DIR="${NEBULA_DIR:-$HOME/nebula}"
PORT="${NEBULA_WEB_PORT:-3210}"
APP="${NEBULA_PM2_NAME:-nebula-web}"
BRANCH="${NEBULA_DEPLOY_BRANCH:-main}"
# Prefer an EXACT commit (NEBULA_DEPLOY_REF, the triggering SHA) over a branch
# name: fetching the SHA + resetting to FETCH_HEAD bypasses any stale/odd branch
# ref on this clone that was silently deploying the wrong commit.
REF="${NEBULA_DEPLOY_REF:-$BRANCH}"

cd "$REPO_DIR"
git fetch --quiet origin "$REF"
git reset --hard FETCH_HEAD            # deploy == exact mirror of REF (keeps untracked .env.local / node_modules / .next / .data)
echo "==> deploying $(git rev-parse --short HEAD)"

cd "$REPO_DIR/apps/web"

# Isolate the web app from the workspace root so plain npm installs only its
# deps. apps/web has zero workspace dependencies, so this is sound.
moved=0
if [ -f "$REPO_DIR/package.json" ]; then
  mv "$REPO_DIR/package.json" "$REPO_DIR/package.json.deploybak"
  moved=1
fi
restore() { [ "$moved" = "1" ] && mv "$REPO_DIR/package.json.deploybak" "$REPO_DIR/package.json" 2>/dev/null || true; }
trap restore EXIT

# Skip the (slow) install when the dependency set hasn't changed since the last
# successful deploy — most deploys only touch source, so this saves ~minutes.
DEPS_HASH="$(sha256sum package.json | cut -d' ' -f1)"
DEPS_STAMP="$REPO_DIR/apps/web/.deps-hash"
if [ -d node_modules ] && [ -f "$DEPS_STAMP" ] && [ "$(cat "$DEPS_STAMP")" = "$DEPS_HASH" ]; then
  echo "==> deps unchanged — skipping npm install"
else
  echo "==> npm install (web, isolated)"
  npm install --no-audit --no-fund
  echo "$DEPS_HASH" > "$DEPS_STAMP"
fi

restore
trap - EXIT

# Build into a temp dir, then atomically swap into `.next`. The running
# `next start` keeps serving the intact old `.next` during the build, so static
# chunks don't 404 mid-deploy (ChunkLoadError). Only swap on a successful build.
echo "==> next build (to .next.build)"
rm -rf .next.build .next.old
if NEXT_DIST_DIR=.next.build ./node_modules/.bin/next build; then
  [ -d .next ] && mv .next .next.old
  mv .next.build .next
  rm -rf .next.old
else
  echo "build failed — keeping the current .next, not restarting" >&2
  rm -rf .next.build
  exit 1
fi

if pm2 describe "$APP" >/dev/null 2>&1; then
  echo "==> pm2 restart $APP"
  PORT="$PORT" pm2 restart "$APP" --update-env
else
  echo "==> pm2 start $APP on :$PORT"
  PORT="$PORT" pm2 start ./node_modules/.bin/next --name "$APP" --cwd "$REPO_DIR/apps/web" -- start -p "$PORT"
fi
pm2 save

echo "==> deployed $APP on :$PORT ($(git rev-parse --short HEAD))"
