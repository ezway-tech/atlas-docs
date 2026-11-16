#!/usr/bin/env bash
# Upgrade Docker volume: ezwaytechvn/atlas-docs:5.3.0 -> candidate image.
# Usage: docker-upgrade-from-5.3.0.sh <candidate-image>
# Optional: ATLAS_DOCKER_UPGRADE_DIR=<host dir for this run>
set -eu

OLD_IMG="${ATLAS_DOCKER_OLD_IMAGE:-ezwaytechvn/atlas-docs:5.3.0}"
if [ -z "${1:-}" ]; then
  echo "Usage: $0 <candidate-image>" >&2
  echo "Example: $0 atlas-docs:release-candidate" >&2
  exit 2
fi
NEW_IMG="$1"

if [ -n "${ATLAS_DOCKER_UPGRADE_DIR:-}" ]; then
  mkdir -p "$ATLAS_DOCKER_UPGRADE_DIR"
  TMP=$(mktemp -d "$ATLAS_DOCKER_UPGRADE_DIR/atlas-docker-upgrade-530-XXXXXX")
else
  TMP=$(mktemp -d /tmp/atlas-docker-upgrade-530-XXXXXX)
fi

CID_OLD=
CID_NEW=
CID_RERUN=
cleanup() {
  docker rm -f ${CID_OLD:-} ${CID_NEW:-} ${CID_RERUN:-} >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$TMP/data" "$TMP/backups"
echo "OLD_IMG=$OLD_IMG NEW_IMG=$NEW_IMG TMP=$TMP"

wait_health() {
  local port="$1"
  local i
  for i in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:${port}/api/health" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

assert_http() {
  local code="$1"
  local label="$2"
  if [ "$code" != "200" ]; then
    echo "FAIL: $label HTTP $code" >&2
    exit 1
  fi
}

docker pull "$OLD_IMG"
CID_OLD=$(docker run -d --name "atlas-up530-old-$$" -p 127.0.0.1:3520:3000 \
  -v "$TMP/data:/data" -v "$TMP/backups:/upgrade-backups" \
  -e DATA_DIR=/data -e ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups \
  "$OLD_IMG")
wait_health 3520

FOLDER=$(curl -sf -w '\n%{http_code}' -X POST http://127.0.0.1:3520/api/folders \
  -H 'content-type: application/json' \
  -d '{"title":"DockerUpgrade530"}')
FCODE=$(printf '%s' "$FOLDER" | tail -n1)
FOLDER_BODY=$(printf '%s' "$FOLDER" | sed '$d')
assert_http "$FCODE" "create folder"
FPATH=$(printf '%s' "$FOLDER_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["path"])')

DOC=$(curl -sf -w '\n%{http_code}' -X POST http://127.0.0.1:3520/api/docs \
  -H 'content-type: application/json' \
  -d "{\"folder\":\"$FPATH\",\"title\":\"Keep530\",\"kind\":\"md\"}")
DCODE=$(printf '%s' "$DOC" | tail -n1)
DOC_BODY=$(printf '%s' "$DOC" | sed '$d')
assert_http "$DCODE" "create doc"
DID=$(printf '%s' "$DOC_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
ENCODED=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$DID")

PUT1=$(curl -sf -o /dev/null -w '%{http_code}' -X PUT "http://127.0.0.1:3520/api/docs/$ENCODED" \
  -H 'content-type: application/json' \
  -d '{"raw":"# Keep530\n\nfirst\n"}')
assert_http "$PUT1" "put doc v1"
PUT2=$(curl -sf -o /dev/null -w '%{http_code}' -X PUT "http://127.0.0.1:3520/api/docs/$ENCODED" \
  -H 'content-type: application/json' \
  -d '{"raw":"# Keep530\n\nfrom 5.3.0\n"}')
assert_http "$PUT2" "put doc v2"

SCHEMA_BEFORE=$(python3 -c "import json; print(json.load(open('$TMP/data/db.json')).get('schemaVersion'))")
test "$SCHEMA_BEFORE" = "1"

docker stop "$CID_OLD" >/dev/null
docker rm "$CID_OLD" >/dev/null
CID_OLD=

BACKUPS_BEFORE=$(find "$TMP/backups" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')

CID_NEW=$(docker run -d --name "atlas-up530-new-$$" -p 127.0.0.1:3520:3000 \
  -v "$TMP/data:/data" -v "$TMP/backups:/upgrade-backups" \
  -e DATA_DIR=/data -e ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups \
  "$NEW_IMG")
wait_health 3520

RAW=$(curl -sf "http://127.0.0.1:3520/api/docs/$ENCODED" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("raw",""))')
case "$RAW" in
  *'from 5.3.0'*) echo 'DATA=ok' ;;
  *) echo "FAIL: unexpected raw after upgrade: $RAW" >&2; exit 1 ;;
esac

SCHEMA_AFTER=$(python3 -c "import json; print(json.load(open('$TMP/data/db.json')).get('schemaVersion'))")
test "$SCHEMA_AFTER" = "1"

BACKUPS_AFTER=$(find "$TMP/backups" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUPS_AFTER" != "$BACKUPS_BEFORE" ]; then
  echo "FAIL: unexpected upgrade backup count $BACKUPS_BEFORE -> $BACKUPS_AFTER" >&2
  exit 1
fi

PUT3=$(curl -sf -o /dev/null -w '%{http_code}' -X PUT "http://127.0.0.1:3520/api/docs/$ENCODED" \
  -H 'content-type: application/json' \
  -d '{"raw":"# Keep530\n\ncontinued after candidate\n"}')
assert_http "$PUT3" "put after upgrade"

docker stop "$CID_NEW" >/dev/null
docker rm "$CID_NEW" >/dev/null
CID_NEW=

CID_RERUN=$(docker run -d --name "atlas-up530-rerun-$$" -p 127.0.0.1:3520:3000 \
  -v "$TMP/data:/data" -v "$TMP/backups:/upgrade-backups" \
  -e DATA_DIR=/data -e ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups \
  "$NEW_IMG")
wait_health 3520
RAW2=$(curl -sf "http://127.0.0.1:3520/api/docs/$ENCODED" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("raw",""))')
case "$RAW2" in
  *'continued after candidate'*) echo 'RERUN=ok' ;;
  *) echo "FAIL: unexpected raw after recreate: $RAW2" >&2; exit 1 ;;
esac

BACKUPS_RERUN=$(find "$TMP/backups" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUPS_RERUN" != "$BACKUPS_BEFORE" ]; then
  echo "FAIL: recreate created upgrade backups" >&2
  exit 1
fi

echo "PASS: docker upgrade $OLD_IMG -> $NEW_IMG"
