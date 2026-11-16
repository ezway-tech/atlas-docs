#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
LOG="$ROOT/app/test-results/release/5.4.0/logs"
mkdir -p "$LOG" "$ROOT/test-results/docker-release"

echo "=== docker build candidate ==="
docker build -f app/Dockerfile -t atlas-docs:release-candidate . 2>&1 | tee "$LOG/docker-build.log"
docker image inspect atlas-docs:release-candidate --format 'ID={{.Id}} Arch={{.Architecture}} Os={{.Os}}' | tee "$LOG/docker-image-id.txt"

echo "=== docker compose config hub ==="
ATLAS_DOCS_VERSION=5.4.0 docker compose -f docker-compose.hub.yml config >/dev/null
ATLAS_DOCS_VERSION=5.4.0 docker compose -f docker-compose.hub.multi.yml config >/dev/null
echo "COMPOSE_CONFIG_OK"

echo "=== docker-smoke candidate ==="
export ATLAS_DOCKER_SMOKE_DIR="$ROOT/test-results/docker-release/smoke"
bash scripts/tests/package/docker-smoke.sh atlas-docs:release-candidate 2>&1 | tee "$LOG/docker-smoke.log"

echo "=== docker-upgrade 5.3.0 ==="
export ATLAS_DOCKER_UPGRADE_DIR="$ROOT/test-results/docker-release/upgrade530"
bash scripts/tests/package/docker-upgrade-from-5.3.0.sh atlas-docs:release-candidate 2>&1 | tee "$LOG/docker-upgrade-530.log"

echo "=== docker-multi-smoke ==="
export ATLAS_REPO_ROOT="$ROOT"
bash scripts/tests/package/docker-multi-smoke.sh 2>&1 | tee "$LOG/docker-multi-smoke.log"

echo "ALL_DOCKER_PASS"
