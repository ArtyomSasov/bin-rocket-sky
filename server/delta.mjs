// Snapshots as binary deltas, one stream per player (see src/js/12d-delta.js, the same code the screens run).
// Each player's stream remembers what it sent by number; the player says which one it last rebuilt (sa, in its
// controls) and the next message is the difference from that one. Pilots far from the player are brought up to
// date only every third snapshot (as Unreal does with distant actors), unless they died, respawned or were hurt.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = [join(here, "..", "src", "js", "12d-delta.js"), "/app/src/js/12d-delta.js"].map(p => { try { return readFileSync(p, "utf8"); } catch { return null; } }).find(Boolean);
// (the game's own file from this repository, never anything received: evaluated once at start-up)
export const SNAP_DELTA = new Function(src + "\nreturn SNAP_DELTA;")();

export const FAR = 2600;    // px from the player: beyond this a pilot is brought up to date every third snapshot
const KEEP = 64;            // snapshots each stream remembers (two seconds at 30 a second)
// what a pilot's state carries only now and then (names and looks every 10th step, the rest when it changes; see
// botWire): in a delta stream it is carried on from the snapshot before, so it costs nothing while it stays
const STICKY = ["n", "h", "ck", "s", "lv", "wp", "st", "tg", "tm", "fc", "cp", "sh"];

export function deltaStream() { return { sent: new Map(), ack: 0 }; }
// the player confirms it holds snapshot q
export function ackSnapshot(st, q) { if (Number.isSafeInteger(q) && q > st.ack && st.sent.has(q)) st.ack = q; }
// the message for one player: plain is the snapshot as JSON would carry it, me the player's pilot id
export function deltaFrame(st, plain, me) {
  const base = st.ack ? st.sent.get(st.ack) : null;
  let view = plain;
  const prev = st.sent.size ? [...st.sent.values()].pop() : null;
  if (prev && Array.isArray(plain.bots) && Array.isArray(prev.bots)) {
    const was = new Map(prev.bots.map(e => [e[0], e[1]]));
    view = { ...plain, bots: plain.bots.map(e => {
      const o = was.get(e[0]); if (!o || !e[1] || typeof e[1] !== "object") return e;
      let m = null;
      for (const k of STICKY) if (!(k in e[1]) && k in o) (m ||= { ...e[1] })[k] = o[k];
      return m ? [e[0], m] : e;
    }) };
  }
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
  const bytes = SNAP_DELTA.frame(plain.q, base ? st.ack : 0, base ? SNAP_DELTA.diff(base, view) : view);
  st.sent.set(plain.q, view);
  for (const q of st.sent.keys()) { if (q > plain.q - KEEP) break; st.sent.delete(q); if (st.ack === q) st.ack = 0; }
  return bytes;
}
