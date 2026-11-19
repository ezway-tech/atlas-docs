#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
LOG="$ROOT/app/test-results/release/6.0.0/logs"
mkdir -p "$LOG"
docker compose -f docker-compose.hub.yml config >/dev/null
docker compose -f docker-compose.yml config >/dev/null
docker build -f app/Dockerfile -t atlas-docs:release-candidate . 2>&1 | tee "$LOG/docker-build.log"
python3 scripts/tests/package/docker-projects.py atlas-docs:release-candidate 2>&1 | tee "$LOG/docker-projects.log"
