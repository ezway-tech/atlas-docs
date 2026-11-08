#!/usr/bin/env bash
set -eu
IMG="${1:-ezwaytechvn/atlas-docs:5.2.1}"
TMP="$(mktemp -d /tmp/atlas-docker-smoke-XXXXXX)"
CID=
CID2=
CID3=
cleanup() {
  docker rm -f ${CID:-} ${CID2:-} ${CID3:-} >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$TMP/data" "$TMP/backups" "$TMP/legacy/docs" "$TMP/legacy/uploads" "$TMP/legacy/history"
printf '%s' '{"assets":[],"folders":[],"comments":[],"navigationOrder":{},"settings":{}}' > "$TMP/legacy/db.json"
echo 'legacy-note' > "$TMP/legacy/docs/note.md"

wait_health() {
  local port="$1"
  local i
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${port}/api/health" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

CID=$(docker run -d --name "atlas-smoke-$$" -p 127.0.0.1:3510:3000 \
  -v "$TMP/data:/data" -v "$TMP/backups:/upgrade-backups" \
  -e DATA_DIR=/data -e ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups \
  "$IMG")
echo "CID=$CID"
wait_health 3510
echo "HEALTH=ok"
curl -sf http://127.0.0.1:3510/api/health
echo
echo "USER=$(docker exec "$CID" whoami)"
echo "ID=$(docker exec "$CID" id)"

FOLDER=$(curl -sf -X POST http://127.0.0.1:3510/api/folders \
  -H 'content-type: application/json' \
  -d '{"title":"DockerSmoke"}')
FPATH=$(printf '%s' "$FOLDER" | python3 -c 'import json,sys; print(json.load(sys.stdin)["path"])')
DOC=$(curl -sf -X POST http://127.0.0.1:3510/api/docs \
  -H 'content-type: application/json' \
  -d "{\"folder\":\"$FPATH\",\"title\":\"Hello\",\"kind\":\"md\"}")
DID=$(printf '%s' "$DOC" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
ENCODED=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$DID")
curl -sf -X PUT "http://127.0.0.1:3510/api/docs/$ENCODED" \
  -H 'content-type: application/json' \
  -d '{"raw":"# Docker smoke\n"}' >/dev/null
HELP=$(curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3510/help)
DOCS=$(curl -sf http://127.0.0.1:3510/api/docs | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
echo "HELP=$HELP DOCS=$DOCS DID=$DID"

docker stop "$CID" >/dev/null
docker rm "$CID" >/dev/null
CID=

CID2=$(docker run -d --name "atlas-smoke2-$$" -p 127.0.0.1:3510:3000 \
  -v "$TMP/data:/data" -v "$TMP/backups:/upgrade-backups" \
  -e DATA_DIR=/data -e ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups \
  "$IMG")
wait_health 3510
RAW=$(curl -sf "http://127.0.0.1:3510/api/docs/$ENCODED" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("raw",""))')
case "$RAW" in
  *Docker*) echo 'PERSIST=True' ;;
  *) echo "PERSIST=False RAW=$RAW"; exit 1 ;;
esac
docker stop "$CID2" >/dev/null
docker rm "$CID2" >/dev/null
CID2=

CID3=$(docker run -d --name "atlas-mig-$$" -p 127.0.0.1:3511:3000 \
  -v "$TMP/legacy:/data" -v "$TMP/backups:/upgrade-backups" \
  -e DATA_DIR=/data -e ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups -e ATLAS_DOCS_MIGRATE_YES=1 \
  "$IMG")
wait_health 3511
SCHEMA=$(python3 -c "import json; print(json.load(open('$TMP/legacy/db.json')).get('schemaVersion'))")
BACKUPS=$(find "$TMP/backups" -maxdepth 1 -type d -name 'atlas-upgrade-backup-*' | wc -l)
NOTE=$(cat "$TMP/legacy/docs/note.md")
echo "LEGACY_SCHEMA=$SCHEMA BACKUPS=$BACKUPS NOTE=$NOTE"
docker rm -f "$CID3" >/dev/null
CID3=
BACKUPS2=$(find "$TMP/backups" -maxdepth 1 -type d -name 'atlas-upgrade-backup-*' | wc -l)
echo "BACKUPS_AFTER_RM=$BACKUPS2"
echo "SMOKE_DIR=$TMP"
echo 'DOCKER_SMOKE_OK'
