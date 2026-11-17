// The authoritative Bin Rocket Sky server. Each lobby code is a room with one match, simulated here by the game's
// own rules (sim/): players send only their input; the server decides flight, hits, damage and kills and sends
// everyone the same snapshot. Plain WebSockets; TLS is the proxy's job (see deploy/).
//
//   PORT=8080 MAX_ROOMS=2 node index.mjs
//
// client -> server   { t: "join", code, name, bots, level }   first message; joins or creates the room
//                    { t: "in", mx, my, aim, fire, alt, boost, dash, tele, w }   the player's controls, sent as they change
//                    { t: "ping", c }
// server -> client   { t: "welcome", id, code, tickHz, sendHz, serverTime }
//                    { t: "snap", ...a lobby host's state (see sim.mjs packet) }
//                    { t: "pong", c, s }     { t: "error", reason }
import http from "node:http";
import { WebSocketServer } from "ws";
import { createMatch } from "./sim/sim.mjs";

const env = (k, d) => (process.env[k] === undefined ? d : process.env[k]);
const PORT = +env("PORT", 8080);
const MAX_ROOMS = +env("MAX_ROOMS", 2);           // each match holds ~150-260 MB (its maps' canvases)
const MAX_PLAYERS = +env("MAX_PLAYERS", 16);      // per room; bots fill the rest up to 24
const PER_IP = +env("PER_IP", 6);                 // open connections from one address
const ROOM_IDLE_MS = +env("ROOM_IDLE_MS", 60000); // an empty room is kept this long for someone to come back
const ROOMS_PER_IP = +env("ROOMS_PER_IP", 1);    // rooms one address may have open at a time
const AFK_MS = +env("AFK_MS", 120000);            // a player who sends no controls this long is let go (rooms are scarce)
const ORIGINS = env("ORIGINS", "https://artyomsasov.github.io,http://localhost:8000,http://127.0.0.1:8000").split(",").filter(Boolean);
const TICK_HZ = 30, SEND_EVERY = 2, STEP = 1 / TICK_HZ;   // 30 steps and 15 snapshots a second
const CODE = /^[a-z0-9]{4,16}$/;
const RTT_CAP = 300;   // ms: a player's shots are judged at most 150 ms back

const rooms = new Map();   // code -> room
const log = (...a) => console.log(new Date().toISOString(), ...a);

function openRoom(code, bots, level) {
  const match = createMatch({ code, bots: Math.max(0, Math.min(24, Math.floor(Number(bots) || 0))), level: ["easy", "normal", "hard"].includes(level) ? level : "normal" });
  const room = { code, match, clients: new Set(), emptySince: performance.now(), last: performance.now(), acc: 0, ticks: 0, slowTicks: 0 };
  // a fixed step on the real clock: after a stall it catches up a few steps, never more (no spiral of death)
  room.timer = setInterval(() => {
    const now = performance.now();
    room.acc = Math.min(room.acc + (now - room.last) / 1000, STEP * 4); room.last = now;
    while (room.acc >= STEP) {
      room.acc -= STEP;
      const t0 = performance.now();
      try { match.step(STEP, now); } catch (e) { log("step failed", code, e.stack); }
      if (++room.ticks % SEND_EVERY === 0) broadcast(room, now);
      if (performance.now() - t0 > STEP * 1000) room.slowTicks++;
    }
  }, 1000 / TICK_HZ);
  rooms.set(code, room);
  log("room open", code, match.info.map, match.info.mode, "rooms", rooms.size);
  return room;
}
function closeRoom(room) {
  clearInterval(room.timer); room.match.dispose(); rooms.delete(room.code);
  for (const c of room.clients) c.close(1001, "room closed");
  log("room closed", room.code, "rooms", rooms.size);
}
function broadcast(room, now) {
  let packet;
  try { packet = room.match.packet(now); } catch (e) { log("packet failed", room.code, e.stack); return; }
  if (!room.clients.size) return;   // built anyway: it is also how the pilots see each other
  const data = JSON.stringify({ t: "snap", ...packet });
  for (const ws of room.clients) if (ws.readyState === 1 && ws.bufferedAmount < 512 * 1024) ws.send(data);   // a stalled client skips snapshots
}
// rooms nobody has been in for a while are closed
setInterval(() => { for (const r of rooms.values()) if (!r.clients.size && performance.now() - r.emptySince > ROOM_IDLE_MS) closeRoom(r); }, 5000).unref();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    // counts only: a room's code is the key to join it, so it never leaves the server
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), rssMB: Math.round(process.memoryUsage().rss / 1e6),
      rooms: rooms.size, maxRooms: MAX_ROOMS, players: [...rooms.values()].reduce((n, r) => n + r.clients.size, 0),
      slowTicks: [...rooms.values()].reduce((n, r) => n + r.slowTicks, 0) }));
    return;
  }
  res.writeHead(404).end();
});
const perIp = new Map();
const wss = new WebSocketServer({ server, maxPayload: 2048, perMessageDeflate: false,
  // a browser page from elsewhere may not open a game here; non-browser clients send no Origin
  verifyClient: ({ origin, req }) => (!origin || ORIGINS.includes(origin)) && (perIp.get(ip(req)) || 0) < PER_IP });
const ip = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const cleanName = n => String(n ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 14) || "Pilot";

wss.on("connection", (ws, req) => {
  const addr = ip(req);
  perIp.set(addr, (perIp.get(addr) || 0) + 1);
  let room = null, id = null, tokens = 60, refill = performance.now();
  // the round trip, timed on WebSocket pings (a browser answers them by itself): it sets how far back the
  // player's shots are judged
  // A client can answer late on purpose to look laggier and be judged further back, so the shortest of its
  // recent round trips counts (a late answer can only lengthen one), and the rewind is capped (RTT_CAP / 2)
  ws.alive = true; ws.rtts = []; ws.pingAt = 0;
  ws.on("pong", () => {
    ws.alive = true;
    if (!ws.pingAt) return;
    const ms = performance.now() - ws.pingAt; ws.pingAt = 0;
    ws.rtts.push(ms); if (ws.rtts.length > 8) ws.rtts.shift();
    if (room && id) room.match.rtt(id, Math.min(RTT_CAP, ...ws.rtts));
  });
  ws.lastInput = performance.now();
  // a broken connection must end only itself: an unhandled socket error would stop the whole server
  ws.on("error", e => { log("socket error", addr, e.message); ws.terminate(); });
  ws.on("message", (data, binary) => {
    // at most ~90 messages a second (input at the display rate, plus pings); the rest are dropped
    const now = performance.now(); tokens = Math.min(90, tokens + (now - refill) * 0.09); refill = now;
    if (binary || tokens < 1) return; tokens--;
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== "object") return;
    if (m.t === "ping") { send(ws, { t: "pong", c: Number.isFinite(m.c) ? m.c : 0, s: Date.now() }); return; }
    if (m.t === "in") { if (room && id) { room.match.input(id, m); ws.lastInput = now; } return; }
    if (m.t === "join" && !room) {
      const code = String(m.code || "").toLowerCase();
      if (!CODE.test(code)) { send(ws, { t: "error", reason: "bad code" }); ws.close(1008); return; }
      let r = rooms.get(code);
      if (!r) {
        if (rooms.size >= MAX_ROOMS) { send(ws, { t: "error", reason: "server full" }); ws.close(1013); return; }
        // one address opens few rooms at a time, so nobody can take every room for themselves
        if ([...rooms.values()].filter(o => o.opener === addr).length >= ROOMS_PER_IP) { send(ws, { t: "error", reason: "you already have a room" }); ws.close(1013); return; }
        r = openRoom(code, m.bots, m.level); r.opener = addr;
      }
      if (r.clients.size >= MAX_PLAYERS) { send(ws, { t: "error", reason: "room full" }); ws.close(1013); return; }
      const pid = r.match.addPilot(cleanName(m.name));
      if (!pid) { send(ws, { t: "error", reason: "room full" }); ws.close(1013); return; }
      room = r; id = pid; room.clients.add(ws);
      send(ws, { t: "welcome", id, code, tickHz: TICK_HZ, sendHz: TICK_HZ / SEND_EVERY, serverTime: Date.now() });
      log("join", code, id, "players", room.clients.size);
    }
  });
  ws.on("close", () => {
    perIp.set(addr, perIp.get(addr) - 1); if (!perIp.get(addr)) perIp.delete(addr);
    if (!room) return;
    room.clients.delete(ws); room.match.removePilot(id);
    if (!room.clients.size) room.emptySince = performance.now();
    log("leave", room.code, id, "players", room.clients.size);
  });
});
// connections that stopped answering, and players who stopped playing, are dropped (their pilot leaves with them):
// an idle tab must not keep a room, and with it the server, to itself
setInterval(() => {
  const now = performance.now();
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    if (now - ws.lastInput > AFK_MS) { send(ws, { t: "error", reason: "idle" }); ws.close(4000, "idle"); continue; }
    ws.alive = false; ws.pingAt = performance.now(); ws.ping();
  }
}, Math.min(15000, AFK_MS / 2)).unref();
setInterval(() => { for (const ws of wss.clients) if (ws.readyState === 1 && !ws.pingAt) { ws.pingAt = performance.now(); ws.ping(); } }, 2000).unref();
// a last line of defence: one bad moment is logged, the other rooms keep running
process.on("uncaughtException", e => log("uncaught", e.stack));
process.on("unhandledRejection", e => log("unhandled rejection", e && e.stack || e));

function stop() { for (const r of [...rooms.values()]) closeRoom(r); for (const ws of wss.clients) ws.terminate(); wss.close(); return new Promise(r => server.close(r)); }
const listening = new Promise(r => server.listen(PORT, () => { log("listening", server.address().port, "max rooms", MAX_ROOMS); r(server.address().port); }));
if (process.env.BRS_NO_SIGNALS !== "1") for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { log("stopping"); stop().then(() => process.exit(0)); });
export { listening, stop, rooms };
