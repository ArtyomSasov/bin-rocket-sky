// The authoritative Bin Rocket Sky server. Each lobby code is a room with one match, simulated here by the game's
// own rules (sim/): players send only their input; the server decides flight, hits, damage and kills and sends
// everyone the same snapshot. Plain WebSockets; TLS is the proxy's job (see deploy/).
//
//   PORT=8080 MAX_ROOMS=2 node index.mjs
//
// client -> server   { t: "join", code, name, bots, level }   first message; joins or creates the room
//                    (join's pub: true lists the room in /rooms, for the lobby browser)
//                    { t: "in", mx, my, aim, fire, alt, boost, brake, dash, w, s, c }   the player's controls, sent as they change (s: their number)
//                    { t: "net", p, j, s, g, f, h }   every 10 s: round trip, jitter, stalls, worst gap (ms), frames a second,
//                    h: [hits shown at once, of them confirmed by the server, confirmed hits that were not shown]
//                    { t: "ping", c }
// server -> client   { t: "welcome", id, code, tickHz, sendHz, serverTime }
//                    { t: "snap", ...a lobby host's state (see sim.mjs packet) }, or for a page that joined with
//                    bin: 1, the same as a binary delta from the snapshot it last confirmed (sa; see delta.mjs)
//                    { t: "pong", c, s }     { t: "error", reason }
import http from "node:http";
import { isIPv6 } from "node:net";
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import { createMatch } from "./sim/sim.mjs";
import { deltaStream, deltaFrame, ackSnapshot } from "./delta.mjs";
import { rtcReady, openRtc, rtcShutdown } from "./rtc.mjs";

const env = (k, d) => (process.env[k] === undefined ? d : process.env[k]);
const PORT = +env("PORT", 8080);
const MAX_ROOMS = +env("MAX_ROOMS", 2);           // each match holds ~150-260 MB (its maps' canvases)
const ROOM_MEM_MB = +env("ROOM_MEM_MB", 0);       // past MAX_ROOMS, another room opens while the process uses less than this (0: never)
const MAX_PLAYERS = +env("MAX_PLAYERS", 16);      // per room; bots fill the rest up to 24
const PER_IP = +env("PER_IP", 6);                 // open connections from one address
const ROOM_IDLE_MS = +env("ROOM_IDLE_MS", 60000); // an empty room is kept this long for someone to come back
const ROOMS_PER_IP = +env("ROOMS_PER_IP", 1);    // rooms one address may have open at a time
// Connections that have not joined a room yet are capped on their own (per address, per network, in all) and get
// a few seconds to join: someone holding many of them can only fill the waiting room, never keep players out.
// Joined ones are bounded by the rooms (MAX_ROOMS x MAX_PLAYERS) and the per-address cap
const JOIN_MS = +env("JOIN_MS", 3000);   // a browser sends its join as soon as the socket opens
const WAIT_PER_IP = +env("WAIT_PER_IP", 2), WAIT_PER_NET = +env("WAIT_PER_NET", 6), WAIT_MAX = +env("WAIT_MAX", 24);
const AFK_MS = +env("AFK_MS", 120000);            // a player who sends no controls this long is let go (rooms are scarce)
const ORIGINS = env("ORIGINS", "https://artyomsasov.github.io,http://localhost:8000,http://127.0.0.1:8000").split(",").filter(Boolean);
const TICK_HZ = +env("TICK_HZ", 60), SEND_EVERY = Math.max(1, Math.round(TICK_HZ / 30)), STEP = 1 / TICK_HZ;   // 60 steps (as a 60 fps screen flies) and 30 snapshots a second
const CODE = /^[a-z0-9]{4,16}$/;
const RESUME_MS = +env("RESUME_MS", 20000);   // a player whose connection drops keeps their pilot this long, to come back to it
const RTT_CAP = 300;   // ms: the round trip a player is credited with at most (their shots are judged at most REWIND_MS = 250 ms back)

const rooms = new Map();   // code -> room
const log = (...a) => console.log(new Date().toISOString(), ...a);

function openRoom(code, bots, level) {
  const match = createMatch({ code, bots: Math.max(0, Math.min(24, Math.floor(Number(bots) || 0))), level: ["easy", "normal", "hard"].includes(level) ? level : "normal" });
  const room = { code, match, clients: new Set(), held: new Map(), emptySince: performance.now(), last: performance.now(), acc: 0, ticks: 0, slowTicks: 0 };
  // a fixed step on the real clock: after a stall it catches up a few steps, never more (no spiral of death)
  room.timer = setInterval(() => {
    const now = performance.now();
    room.acc = Math.min(room.acc + (now - room.last) / 1000, STEP * 4); room.last = now;
    while (room.acc >= STEP) {
      room.acc -= STEP;
      const t0 = performance.now(), at = now - room.acc * 1000;   // the moment this step stands for (catch-up steps are earlier)
      try { match.step(STEP, at); } catch (e) { log("step failed", code, e.stack); }
      if (++room.ticks % SEND_EVERY === 0) broadcast(room, at);
      if (performance.now() - t0 > STEP * 1000) room.slowTicks++;
    }
  }, 1000 / TICK_HZ);
  rooms.set(code, room);
  log("room open", code, match.info.map, match.info.mode, "rooms", rooms.size);
  return room;
}
function closeRoom(room) {
  for (const h of room.held.values()) clearTimeout(h.timer);
  room.held.clear();
  clearInterval(room.timer); room.match.dispose(); rooms.delete(room.code);
  for (const c of room.clients) c.close(1001, "room closed");
  log("room closed", room.code, "rooms", rooms.size);
}
function broadcast(room, now) {
  let packet;
  try { packet = room.match.packet(now); } catch (e) { log("packet failed", room.code, e.stack); return; }
  if (!room.clients.size) return;   // built anyway: it is also how the pilots see each other
  let data = null, plain = null;   // the snapshot as JSON text and as plain values, each made once and only if needed
  for (const ws of room.clients) {
    if (ws.readyState !== 1 || ws.bufferedAmount >= 512 * 1024) continue;   // a stalled client skips snapshots
    if (!ws.delta) { ws.send(data ||= JSON.stringify({ t: "snap", ...packet })); continue; }   // an older page: the whole snapshot as JSON
    try {
      plain ||= JSON.parse(data ||= JSON.stringify({ t: "snap", ...packet }));   // (the engine's own JSON is the quickest way to plain values)
      const bytes = deltaFrame(ws.delta, plain, ws.pid);
      if (ws.rtc?.usable() && ws.rtc.send(bytes)) ws.rtcUsed = true;   // the data channel while it works
      else ws.send(bytes, { binary: true });
    }
    catch (e) { log("delta failed", room.code, e.stack); ws.delta = null; ws.send(data ||= JSON.stringify({ t: "snap", ...packet })); }
  }
}
// rooms nobody has been in for a while are closed
setInterval(() => { for (const r of rooms.values()) if (!r.clients.size && !r.held.size && performance.now() - r.emptySince > ROOM_IDLE_MS) closeRoom(r); }, 5000).unref();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    // counts only: a room's code is the key to join it, so it never leaves the server
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), rssMB: Math.round(process.memoryUsage().rss / 1e6),
      rooms: rooms.size, maxRooms: MAX_ROOMS, players: [...rooms.values()].reduce((n, r) => n + r.clients.size, 0),
      slowTicks: [...rooms.values()].reduce((n, r) => n + r.slowTicks, 0) }));
    return;
  }
  if (req.url === "/rooms") {
    // the listed rooms, for the game's lobby browser: like the online lobbies, which every host announces on the
    // public broker, a new game's room is listed for anyone (scripts too; the CORS header only keeps other sites'
    // pages from reading it). A room opened by typing a code (pub not set) stays known only to whoever has the code
    const origin = req.headers.origin;
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" };
    if (origin && ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
    res.writeHead(200, headers);
    res.end(JSON.stringify(roomList()));
    return;
  }
  res.writeHead(404).end();
});
// [{ c: code, n: players, b: bots }], the fullest first, refreshed at most once a second
let roomsCache = null, roomsAt = 0;
function roomList() {
  const now = performance.now();
  if (roomsCache && now - roomsAt < 1000) return roomsCache;
  roomsAt = now;
  roomsCache = [...rooms.values()].filter(r => r.pub && r.clients.size > 0)
    .map(r => ({ c: r.code, n: r.clients.size, b: r.match.bots, m: MAX_PLAYERS })).sort((a, b) => b.n - a.n).slice(0, 20);
  return roomsCache;
}
const perIp = new Map();
// the waiting (not yet joined) connections: per address, per network (/24 for IPv4, /48 for IPv6) and in all.
// When the waiting room is full a newcomer is always let in and someone waiting makes room (at once, so a burst
// cannot overfill it): the oldest of the network holding the most places, or with one place each, the oldest. A
// player's browser joins within milliseconds of connecting, so only a socket held open on purpose is pushed out,
// and no one can keep the room full for long
const waitIp = new Map(), waitNet = new Map(), waitList = new Set();   // waitList: { ws, net, at }
function netOf(a) {
  a = String(a).toLowerCase();
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+)\.\d+$/.exec(a);   // IPv4, also as an IPv4-mapped IPv6 address
  if (v4) return v4[1];
  if (!isIPv6(a)) return a;
  const [head, tail = ""] = a.split("::"), h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const full = a.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return full.slice(0, 3).map(g => parseInt(g, 16).toString(16)).join(":");   // the /48
}
const bump = (map, k, d) => { const n = (map.get(k) || 0) + d; if (n > 0) map.set(k, n); else map.delete(k); };
// the connection to push out for a newcomer: the oldest of the network holding the most places (two or more)
function evictable() {
  let worst = null, most = 0;
  for (const w of waitList) { const n = waitNet.get(w.net) || 0; if (!worst || n > most || (n === most && w.at < worst.at)) { worst = w; most = n; } }
  return worst;
}
const canWait = a => (waitIp.get(a) || 0) < WAIT_PER_IP && (waitNet.get(netOf(a)) || 0) < WAIT_PER_NET;
function makeRoom() {
  while (waitList.size >= WAIT_MAX) { const w = evictable(); w.done(); w.ws.terminate(); }   // off the lists now, not when its close event comes
}
// snapshots are JSON that repeats itself from one to the next: compressed (with the context kept between messages)
// they are a fraction of the size, which a phone on a mobile network feels more than the CPU it costs here.
// The state each connection keeps is small (an 8 KB window, ~70 KB in all), the controls coming in keep none, and
// the number of connections is capped, in all and per address, with a short time to join
const wss = new WebSocketServer({ server, maxPayload: 2048,
  perMessageDeflate: { threshold: 512, serverMaxWindowBits: 13, clientNoContextTakeover: true, zlibDeflateOptions: { level: 3, memLevel: 6 }, concurrencyLimit: 4 },
  // a browser page from elsewhere may not open a game here; non-browser clients send no Origin. (ip() reads
  // X-Forwarded-For: only Caddy reaches this port, and it sets that header to the real address)
  verifyClient: ({ origin, req }) => (!origin || ORIGINS.includes(origin)) && (perIp.get(ip(req)) || 0) < PER_IP && canWait(ip(req)) });
const ip = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const cleanName = n => String(n ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 14) || "Pilot";
// a chat line: text only, no control or invisible characters (nor the ones that turn text round), 140 at most
const cleanChat = t => typeof t !== "string" ? "" : t.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);

wss.on("connection", (ws, req) => {
  const addr = ip(req);
  makeRoom();
  perIp.set(addr, (perIp.get(addr) || 0) + 1);
  let room = null, id = null, tokens = 60, refill = performance.now();
  const entry = { ws, net: netOf(addr), at: performance.now() };
  const done = entry.done = () => { if (waitList.delete(entry)) { bump(waitIp, addr, -1); bump(waitNet, entry.net, -1); } };
  waitList.add(entry); bump(waitIp, addr, 1); bump(waitNet, entry.net, 1);
  const joinBy = setTimeout(() => { if (!room) { done(); ws.terminate(); } }, JOIN_MS);   // terminate: the slot is free at once
  ws.on("close", () => { clearTimeout(joinBy); done(); });
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
  ws.on("message", (data, binary) => handle(data, binary));
  // a message from the player, by the WebSocket or by the data channel
  function handle(data, binary) {
    // at most ~90 messages a second (input at the display rate, plus pings); the rest are dropped
    const now = performance.now(); tokens = Math.min(90, tokens + (now - refill) * 0.09); refill = now;
    if (binary || tokens < 1) return; tokens--;
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== "object") return;
    if (m.t === "bye") { ws.leaving = true; return; }   // the page is leaving: its pilot goes at once
    if (m.t === "ping") { send(ws, { t: "pong", c: Number.isFinite(m.c) ? m.c : 0, s: Date.now() }); return; }
    if (m.t === "in") { if (room && id) { room.match.input(id, m); ws.lastInput = now; if (ws.delta) ackSnapshot(ws.delta, m.sa); } return; }
    if (m.t === "sa") { if (ws.delta) ackSnapshot(ws.delta, m.q); return; }   // a snapshot confirmed between controls
    if (m.t === "rtc") { ws.rtc?.answer(m.sdp); return; }   // the player's answer to the data channel's offer
    // chat: to everyone in the room, under the sender's pilot name; a few lines in a burst, then one each 0.7 s. The
    // text is not logged
    if (m.t === "chat") {
      if (!room || !id) return;
      ws.chatTok = Math.min(4, (ws.chatTok ?? 4) + (now - (ws.chatAt ?? now)) / 700); ws.chatAt = now;
      const text = cleanChat(m.m);
      if (!text || ws.chatTok < 1) return;
      ws.chatTok--;
      const out = JSON.stringify({ t: "chat", n: room.match.pilot(id)?.name || "Pilot", m: text, id });
      for (const c of room.clients) if (c.readyState === 1) c.send(out);
      return;
    }
    // how the connection is doing on the player's side, every 10 s (numbers only): summed for the log at leave
    if (m.t === "net") {
      const n = (v, max) => Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0, a = ws.net || (ws.net = { n: 0, p: 0, j: 0, s: 0, g: 0, f: 0, hs: 0, hc: 0, hn: 0 });
      if (a.n >= 8640) return;   // (a day of reports is plenty)
      a.n++; a.p += n(m.p, 5000); a.j += n(m.j, 5000); a.s += n(m.s, 300); a.g = Math.max(a.g, n(m.g, 60000)); a.f += n(m.f, 300);
      if (Array.isArray(m.h)) { a.hs += n(m.h[0], 1000); a.hc += n(m.h[1], 1000); a.hn += n(m.h[2], 1000); }   // hits shown at once, of them confirmed, confirmed but not shown
      return;
    }
    if (m.t === "join" && !room) {
      const code = String(m.code || "").toLowerCase();
      if (!CODE.test(code)) { send(ws, { t: "error", reason: "bad code" }); ws.close(1008); return; }
      let r = rooms.get(code);
      if (!r) {
        // full? An empty room (kept a minute for someone to come back) gives way to a new game at once; past that,
        // another room opens while the memory allows it; only then is the server full
        if (rooms.size >= MAX_ROOMS) for (const o of [...rooms.values()]) if (!o.clients.size && !o.held.size) { closeRoom(o); if (rooms.size < MAX_ROOMS) break; }
        // (one room over MAX_ROOMS at most, whatever the memory says: rooms opened at once have not grown yet)
        const memOk = ROOM_MEM_MB > 0 && rooms.size < MAX_ROOMS + 1 && process.memoryUsage().rss / 1e6 < ROOM_MEM_MB;
        if (rooms.size >= MAX_ROOMS && !memOk) { send(ws, { t: "error", reason: "server full" }); ws.close(1013); return; }
        // one address opens few rooms at a time, so nobody can take every room for themselves
        if ([...rooms.values()].filter(o => o.opener === addr).length >= ROOMS_PER_IP) { send(ws, { t: "error", reason: "you already have a room" }); ws.close(1013); return; }
        r = openRoom(code, m.bots, m.level); r.opener = addr; r.pub = m.pub === true;
      }
      // back after a dropped connection: the pilot kept for them (its key, rk, was theirs alone), or still held by
      // their old socket if the server has not noticed it go yet (that one is let go)
      const rk = typeof m.rk === "string" && /^[0-9a-f]{32}$/.test(m.rk) ? m.rk : null;
      const held = rk ? r.held.get(rk) : null, old = !held && rk ? r.byRk?.get(rk) : null;
      if (held) { clearTimeout(held.timer); r.held.delete(rk); }
      else if (old) { old.replaced = true; r.clients.delete(old); r.byRk.delete(rk); old.terminate(); }
      else if (r.clients.size + r.held.size >= MAX_PLAYERS) { send(ws, { t: "error", reason: "room full" }); ws.close(1013); return; }
      const back = held || old, pid = held ? held.pid : old ? old.pid : r.match.addPilot(cleanName(m.name));
      if (!pid) { send(ws, { t: "error", reason: "room full" }); ws.close(1013); return; }
      room = r; id = pid; room.clients.add(ws); done();
      ws.rk = back ? rk : randomBytes(16).toString("hex");
      r.byRk ||= new Map(); r.byRk.set(ws.rk, ws);
      ws.pid = pid; if (m.bin === 1) ws.delta = deltaStream();   // a page that rebuilds binary deltas gets them
      // and a page that can, a data channel for them (and its controls) as well
      if (ws.delta && m.rtc === 1 && rtcReady) ws.rtcOffered = true, ws.rtc = openRtc(pid, sdp => send(ws, { t: "rtc", sdp }), text => handle(text, false), () => { ws.rtc = null; });
      send(ws, { t: "welcome", id, code, tickHz: TICK_HZ, sendHz: TICK_HZ / SEND_EVERY, serverTime: Date.now(), rk: ws.rk, resumed: back ? 1 : 0 });
      log(back ? "resume" : "join", code, id, "players", room.clients.size, ws.rtc ? "webrtc offered" : "");
    }
  }
  ws.on("close", code => {
    ws.rtc?.close();
    perIp.set(addr, perIp.get(addr) - 1); if (!perIp.get(addr)) perIp.delete(addr);
    if (!room || ws.replaced) return;   // (replaced: its player came back on another socket)
    room.byRk?.delete(ws.rk);
    room.clients.delete(ws);
    if (!room.clients.size) room.emptySince = performance.now();
    const rep = room.match.pilot(id)?.repeats || 0;   // (read before the pilot goes)
    // a connection that dropped (1006: no closing handshake, as when a phone changes network; not one closed on
    // purpose: the page left, or was let go for idling) keeps its pilot a while, its controls let go, for the player
    // to come back to; a room being closed keeps nothing
    if (RESUME_MS > 0 && code === 1006 && rooms.get(room.code) === room && !ws.leaving && !ws.idle) {
      try { room.match.release(id); } catch {}
      const r = room, pid = id, rk = ws.rk;
      r.held.set(rk, { pid, timer: setTimeout(() => { if (r.held.delete(rk)) { try { r.match.removePilot(pid); } catch {} if (!r.clients.size) r.emptySince = performance.now(); log("leave", r.code, pid, "(did not come back)"); } }, RESUME_MS) });
      log("dropped", room.code, id, "players", room.clients.size, "held", room.held.size);
    } else {
      room.match.removePilot(id);
      log("leave", room.code, id, "players", room.clients.size);
    }
    const a = ws.net;   // the player's network, for deciding what to improve: averages over their stay
    if (a?.n) log("net", id, `${a.n * 10}s`, "ping", Math.round(a.p / a.n), "jitter", Math.round(a.j / a.n), "stalls/min", +(a.s / (a.n / 6)).toFixed(1), "worst gap", Math.round(a.g), "fps", Math.round(a.f / a.n), "hits shown", a.hs, "confirmed", a.hs ? Math.round(100 * a.hc / a.hs) + "%" : "-", "unshown", a.hn, "cmd repeats", rep, ws.rtcUsed ? "webrtc" : "websocket");
  });
});
// connections that stopped answering, and players who stopped playing, are dropped (their pilot leaves with them):
// an idle tab must not keep a room, and with it the server, to itself
setInterval(() => {
  const now = performance.now();
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    if (now - ws.lastInput > AFK_MS) { ws.idle = true; send(ws, { t: "error", reason: "idle" }); ws.close(4000, "idle"); continue; }
    ws.alive = false; ws.pingAt = performance.now(); ws.ping();
  }
}, Math.min(15000, AFK_MS / 2)).unref();
setInterval(() => { for (const ws of wss.clients) if (ws.readyState === 1 && !ws.pingAt) { ws.pingAt = performance.now(); ws.ping(); } }, 2000).unref();
// a last line of defence: one bad moment is logged, the other rooms keep running
process.on("uncaughtException", e => log("uncaught", e.stack));
process.on("unhandledRejection", e => log("unhandled rejection", e && e.stack || e));

function stop() { for (const r of [...rooms.values()]) closeRoom(r); for (const ws of wss.clients) { ws.rtc?.close(); ws.terminate(); } wss.close(); return new Promise(r => server.close(r)).then(() => new Promise(r => setTimeout(r, 500))).then(rtcShutdown); }   // (the channels' own threads finish closing before the library stops: stopping it at once could crash the process)
const listening = new Promise(r => server.listen(PORT, () => { log("listening", server.address().port, "max rooms", MAX_ROOMS); r(server.address().port); }));
if (process.env.BRS_NO_SIGNALS !== "1") for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { log("stopping"); stop().then(() => process.exit(0)); });
export { listening, stop, rooms };
