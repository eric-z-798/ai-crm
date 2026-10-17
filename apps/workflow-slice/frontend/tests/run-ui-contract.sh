#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run dev >/tmp/crm-ui-contract-vite.log 2>&1 &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT
for n in $(seq 1 60); do
  if curl -sf http://127.0.0.1:5173 >/dev/null; then break; fi
  sleep .25
done
node tests/ui-contract.mjs
