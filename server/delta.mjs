// Snapshots as binary deltas, one stream per player (see src/js/net/delta.js, the same code the screens run).
// Each player's stream remembers what it sent by number; the player says which one it last rebuilt (sa, in its
// controls) and the next message is the difference from that one. Pilots far from the player are brought up to
// date only every third snapshot (as Unreal does with distant actors), unless they died, respawned or were hurt.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = [join(here, "..", "src", "js", "net", "delta.js"), "/app/src/js/net/delta.js"].map(p => { try { return readFileSync(p, "utf8"); } catch { return null; } }).find(Boolean);
// (the game's own file from this repository, never anything received: evaluated once at start-up)
export const SNAP_DELTA = new Function(src + "\nreturn SNAP_DELTA;")();

export const FAR = 2600;    // px from the player: beyond this a pilot is brought up to date every third snapshot
const KEEP = 64;            // snapshots each stream remembers (two seconds at 30 a second)
// what a pilot's state carries only now and then (names and looks every 10th step, the rest when it changes; see
// botWire): in a delta stream it is carried on from the snapshot before, so it costs nothing while it stays
const STICKY = ["n", "h", "ck", "s", "wp", "st", "tg", "tm", "fc", "cp", "sh"];

export function deltaStream() { return { sent: new Map(), ack: 0, ter: new Map(), got: new Set() }; }
// the player confirms it holds snapshot q (got: the ones it said so of, which certainly reached it)
export function ackSnapshot(st, q) {
  if (!Number.isSafeInteger(q) || !st.sent.has(q)) return;
  st.got.add(q); if (st.got.size > 128) st.got.delete(st.got.values().next().value);
  if (q > st.ack) st.ack = q;
}
// what only a pilot's own player reads (its flight state, armour layers, arsenal, acks, energy, teleporter charges):
// left out of the others' entries in each player's stream
const PRIVATE = ["mv", "al", "ar", "ak", "ag", "en", "tn"];
const isEntry = e => e[1] && typeof e[1] === "object";
// What every player's message is made from, worked out once per snapshot (not once per player): the snapshot with
// each pilot's sticky fields carried on from the snapshot before, each pilot's entry as the others may see it (its
// private fields left out), and the terrain check as text. room: { last } kept between snapshots (roomStream())
export function roomStream() { return { last: null }; }
export function shareFrame(room, plain) {
  let full = plain;
  if (Array.isArray(plain.bots)) {
    const was = room.last;
    full = { ...plain, bots: plain.bots.map(e => {
      if (!isEntry(e)) return e;
      const o = was && was.get(e[0]);
      let m = null;
      if (o) for (const k of STICKY) if (!(k in e[1]) && k in o) (m ||= { ...e[1] })[k] = o[k];
      return m ? [e[0], m] : e;
    }) };
    room.last = new Map(full.bots.filter(isEntry).map(e => [e[0], e[1]]));
  }
  const pub = Array.isArray(full.bots) ? full.bots.map(e => {
    if (!isEntry(e)) return e;
    let m = null;
    for (const k of PRIVATE) if (k in e[1]) { m ||= { ...e[1] }; delete m[k]; }
    return m ? [e[0], m] : e;
  }) : null;
  return { full, pub, ter: Array.isArray(full.terrain) ? JSON.stringify(full.terrain) : null };
}
// the message for one player: shared from shareFrame (or a plain snapshot, shared for this player alone), me the
// player's pilot id
export function deltaFrame(st, shared, me) {
  if (!shared.full) shared = shareFrame(st.room ||= roomStream(), shared);
  const { full, pub } = shared, plain = full;
  const base = st.ack ? st.sent.get(st.ack) : null;
  let view = pub ? { ...full, bots: full.bots.map((e, i) => e[0] === me ? e : pub[i]) } : full;
  if (base && Array.isArray(view.bots) && Array.isArray(base.bots) && plain.q % 3) {
    const plainView = view;
    const mine = plainView.bots.find(e => e[0] === me)?.[1], old = new Map(base.bots.map(e => [e[0], e[1]]));
    if (mine && Number.isFinite(mine.x)) view = { ...plainView, bots: plainView.bots.map(e => {
      const m = e[1], o = old.get(e[0]);
      if (e[0] === me || !o || !Number.isFinite(m.x) || Math.hypot(m.x - mine.x, m.y - mine.y) < FAR) return e;
      if (m.d !== o.d || m.l !== o.l || m.i !== o.i || m.f || m.hb || m.ko || o.f || o.hb || o.ko) return e;   // something happened to it: now
      return [e[0], o];   // as the player already has it (its own q says it is not new)
    }) };
  }
  // the terrain check (one body's carved cells, in turn, for a screen that missed a crater): a body this player has
  // already confirmed in the very same state is not sent again (it was ~8 KB/s that a delta could not shrink)
  if (Array.isArray(view.terrain)) {
    const t = view.terrain, val = shared.ter, had = st.ter.get(t[1]);
    if (had && had.val === val && had.qs.some(q => st.got.has(q))) { view = { ...view }; delete view.terrain; }
    else {
      const qs = had && had.val === val ? had.qs : [];
      qs.push(plain.q); if (qs.length > 8) qs.shift();
      st.ter.set(t[1], { val, qs });   // (it counts as had once a snapshot carrying it is confirmed)
    }
  }
  const bytes = SNAP_DELTA.frame(plain.q, base ? st.ack : 0, base ? SNAP_DELTA.diff(base, view) : view);
  st.sent.set(plain.q, view);
  for (const q of st.sent.keys()) { if (q > plain.q - KEEP) break; st.sent.delete(q); if (st.ack === q) st.ack = 0; }
  return bytes;
}
