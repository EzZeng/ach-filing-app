#!/bin/sh
set -eu
cd /workspace
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
# Prefer static HTML/JS product on 8080 when built; fall back to dev
if [ -f dist-static/index.html ]; then
  npx --yes vite preview --config vite.static.config.ts --host 0.0.0.0 --port 8080 >>/tmp/app-startup.log 2>&1 &
else
  npm run dev:web >>/tmp/app-startup.log 2>&1 &
fi
