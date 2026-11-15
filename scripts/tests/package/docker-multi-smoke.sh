#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
export ATLAS_REPO_ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)
export SMOKE_DIR=$ATLAS_REPO_ROOT/test-results/docker-multi-smoke
COMPOSE_FILE=$SCRIPT_DIR/docker-compose.multi-smoke.yml

mkdir -p "$SMOKE_DIR/libraries" "$SMOKE_DIR/atlas-registry" "$SMOKE_DIR/upgrade-backups"
cd "$SCRIPT_DIR"

docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" up -d --build

wait_ready() {
  local want="${1:-}"
  for _ in $(seq 1 60); do
    if curl -sf http://127.0.0.1:17440/api/libraries/ready > /tmp/atlas-ready.json; then
      cat /tmp/atlas-ready.json
      echo
      if [[ -z "$want" ]] || grep -q "$want" /tmp/atlas-ready.json; then
        return 0
      fi
    fi
    sleep 2
  done
  echo "ready timeout want=$want" >&2
  return 1
}

echo "=== wait manager ==="
wait_ready '"mode":"manager"'

echo "=== /data before create ==="
docker compose -f "$COMPOSE_FILE" exec -T atlas-docs sh -c 'ls -la /data; test ! -f /data/db.json && echo NO_DATA_DB'

SESSION=$(curl -sf http://127.0.0.1:17440/api/libraries/session)
echo "SESSION=$SESSION"
RID=$(printf '%s' "$SESSION" | sed -n 's/.*"runtimeId":"\([^"]*\)".*/\1/p')
LID=$(printf '%s' "$SESSION" | sed -n 's/.*"libraryId":"\([^"]*\)".*/\1/p')

echo "=== create library ==="
CREATE_CODE=$(curl -s -o /tmp/atlas-create.json -w '%{http_code}' -X POST http://127.0.0.1:17440/api/libraries/create \
  -H 'Content-Type: application/json' \
  -H 'X-Atlas-Library-Api: 1' \
  -H "X-Atlas-Runtime: $RID" \
  -H "X-Atlas-Library: $LID" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Origin: http://127.0.0.1:17440' \
  -H 'Host: 127.0.0.1:17440' \
  -d '{"name":"Smoke Lib","parentDir":"/libraries"}')
echo "CREATE_CODE=$CREATE_CODE"
cat /tmp/atlas-create.json
echo

echo "=== wait library mode ==="
wait_ready '"mode":"library"'

echo "=== host libraries ==="
ls -la "$SMOKE_DIR/libraries"

echo "=== /data after create ==="
docker compose -f "$COMPOSE_FILE" exec -T atlas-docs sh -c 'ls -la /data; test ! -f /data/db.json && echo NO_DATA_DB'

echo "=== recreate ==="
docker compose -f "$COMPOSE_FILE" up -d --force-recreate
wait_ready '"ok":true'

echo "=== after recreate ==="
ls -la "$SMOKE_DIR/libraries"
ls -la "$SMOKE_DIR/atlas-registry" || true
READY=$(cat /tmp/atlas-ready.json)
echo "READY=$READY"

docker compose -f "$COMPOSE_FILE" down
echo SMOKE_OK
