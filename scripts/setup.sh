#!/usr/bin/env bash
# One-shot dev environment setup. Safe to re-run.
# Used locally and by Claude Code cloud sessions (see .claude/settings.json).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  secret="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$secret\"|" .env.local && rm -f .env.local.bak
  echo "Created .env.local (mock data mode)"
fi

# Prisma CLI reads .env, not .env.local
[ -f .env ] || grep '^DATABASE_URL=' .env.local > .env

if [ ! -d node_modules ]; then
  npm ci
fi

npx prisma db push --skip-generate >/dev/null
npx prisma generate >/dev/null
echo "Setup complete. Run: npm run dev"
