#!/usr/bin/env bash
# Builds and (re)starts the game server on a droplet, beside whatever else runs there: everything lives in its own
# directory (/opt/bin-rocket-sky), its own Docker network and two containers with memory and CPU limits.
#   server/deploy/deploy.sh root@134.122.60.131 134-122-60-131.sslip.io
set -euo pipefail
HOST=${1:?ssh target, e.g. root@134.122.60.131}
DOMAIN=${2:?domain for the certificate, e.g. 134-122-60-131.sslip.io}
KEY=${SSH_KEY:-$HOME/.ssh/bin_rocket_sky_do}
SSH="ssh -i $KEY -o IdentitiesOnly=yes"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DIR=/opt/bin-rocket-sky

echo "== copy sources"
$SSH "$HOST" "mkdir -p $DIR/app/server $DIR/app/src $DIR/caddy"
rsync -az --delete -e "$SSH" "$ROOT/src/js" "$HOST:$DIR/app/src/"
rsync -az --delete -e "$SSH" --exclude node_modules "$ROOT/server/" "$HOST:$DIR/app/server/"
rsync -az -e "$SSH" "$ROOT/server/deploy/Caddyfile" "$HOST:$DIR/caddy/Caddyfile"

echo "== build and restart"
$SSH "$HOST" DOMAIN="$DOMAIN" DIR="$DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$DIR/app"
docker build -q -f server/Dockerfile -t bin-rocket-sky-server:latest . >/dev/null
docker network inspect brs >/dev/null 2>&1 || docker network create brs >/dev/null
docker volume inspect brs-caddy-data >/dev/null 2>&1 || docker volume create brs-caddy-data >/dev/null
docker rm -f brs-game >/dev/null 2>&1 || true
docker run -d --name brs-game --network brs --network-alias game --restart unless-stopped \
  --memory 450m --memory-swap 450m --cpus 0.6 --log-opt max-size=10m --log-opt max-file=3 \
  -e MAX_ROOMS=1 bin-rocket-sky-server:latest >/dev/null
if ! docker ps --format '{{.Names}}' | grep -qx brs-caddy; then
  docker rm -f brs-caddy >/dev/null 2>&1 || true
  docker run -d --name brs-caddy --network brs --restart unless-stopped -p 80:80 -p 8443:8443 \
    --memory 96m --memory-swap 96m --cpus 0.3 --log-opt max-size=10m --log-opt max-file=3 \
    -e DOMAIN="$DOMAIN" -v "$DIR/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" -v brs-caddy-data:/data caddy:2.11.8 >/dev/null
else
  docker exec brs-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null
fi
docker image prune -f >/dev/null
docker ps --filter name=brs- --format '{{.Names}}\t{{.Status}}'
REMOTE
echo "== health: https://$DOMAIN:8443/health"
