# Bin Rocket Sky servers

Two independent ways to host multiplayer live here.

## Authoritative game server (in development)

`index.mjs` runs each lobby as a match on the server, with the game's own rules: `sim/` loads the same
`src/js` sections the browser runs into Node (no page, no sound; bodies are painted on real Skia canvases,
because what is solid is read back from the painted art). Players send only their controls; the server decides
flight, hits, damage and kills and sends everyone the same snapshot, 15 times a second (30 simulation steps).

The browser client does not use it yet (stage 3: client prediction and rendering from snapshots).

```sh
cd server && npm ci && node index.mjs          # ws://localhost:8080, health at /health
npm test                                       # from the repository root: includes tools/server*.test.cjs
server/deploy/deploy.sh root@HOST HOST-IP-WITH-DASHES.sslip.io
```

`deploy/deploy.sh` copies `src/js` and `server/` to the droplet, builds the image there and runs two containers
in their own Docker network: `brs-game` (450 MB, 0.85 CPU, one room; a second while the memory allows) and `brs-caddy` (TLS; port 80 answers the
certificate check, the game is served on 8443). Nothing else on the host is touched.
Live: `wss://134-122-60-131.sslip.io:8443`, health at `https://134-122-60-131.sslip.io:8443/health`.

Environment: `PORT` (8080), `MAX_ROOMS` (2), `MAX_PLAYERS` (16 a room), `PER_IP` (6 connections),
`ROOM_IDLE_MS` (60000), `AFK_MS` (120000: a player who sends no controls this long is disconnected),
`ORIGINS` (pages allowed to connect, comma-separated). `ROOMS_PER_IP` (1): rooms one address may have open at a time; `/health`
shows counts only, never room codes (a code is the key to join a room).

## MQTT relay

`docker-compose.yml`, `Caddyfile` and `mosquitto.conf` run a private MQTT broker for the current
peer-to-peer multiplayer (see the main README, "Your own server").
