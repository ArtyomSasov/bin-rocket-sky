  // ---------- snapshot deltas, in binary (the game server's snapshots) ----------
  // A snapshot is sent as what changed since one the screen has confirmed it holds (as in Quake 3): the screen keeps
  // the last ones it rebuilt, by number, and says which it has; the server writes the difference from that one (or
  // the whole snapshot when it has none). Losing a message costs nothing then: the next difference is from a
  // snapshot the screen certainly has. The same file runs in the server (server/delta.mjs reads it).
  // A delta is SAME (unchanged), a Patch of an object (key -> delta, or GONE for a key that went), a List patch of
  // an array of the same length (index -> delta), an Add to a number (whole, or in hundredths), or the new value.
  // In the bytes, every key after its first use in a message is one byte.
  const SNAP_DELTA = (() => {
    const SAME = { same: 1 }, GONE = { gone: 1 };
    class Patch { constructor(o) { this.o = o; } }
    class List { constructor(l) { this.l = l; } }
    class Add { constructor(k, c) { this.k = k; this.c = c; } }   // c: in hundredths
    const cents = v => { const c = Math.round(v * 100); return Number.isSafeInteger(c) && c / 100 === v ? c : null; };
    const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
    // what turns a into b (both plain JSON: no undefined, no NaN)
    // (one pass: a part whose every piece is SAME is SAME itself, so nothing is compared twice)
    function diff(a, b) {
      if (a === b) return SAME;
      if (isObj(a) && isObj(b)) {
        const o = {}; let changed = false;
        for (const k of Object.keys(b)) { const d = Object.prototype.hasOwnProperty.call(a, k) ? diff(a[k], b[k]) : b[k]; if (d !== SAME) { o[k] = d; changed = true; } }
        for (const k of Object.keys(a)) if (!Object.prototype.hasOwnProperty.call(b, k)) { o[k] = GONE; changed = true; }
        return changed ? new Patch(o) : SAME;
      }
      if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        let changed = false; const l = a.map((v, i) => { const d = diff(v, b[i]); if (d !== SAME) changed = true; return d; });
        return changed ? new List(l) : SAME;
      }
      if (typeof a === "number" && typeof b === "number") {   // a small step costs fewer bytes than the new value
        if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && Math.abs(b - a) < Math.abs(b)) return new Add(b - a, false);
        const ca = cents(a), cb = cents(b);
        if (ca !== null && cb !== null && !Number.isSafeInteger(b) && Math.abs(cb - ca) < Math.abs(cb)) return new Add(cb - ca, true);
      }
      return b;
    }
    // b from a and the delta (a itself is left as it was; unchanged parts are shared with it)
    function patch(a, d) {
      if (d === SAME) return a;
      if (d instanceof Patch) {
        const out = isObj(a) ? { ...a } : {};
        for (const k of Object.keys(d.o)) { const v = d.o[k]; if (v === GONE) delete out[k]; else out[k] = patch(out[k], v); }
        return out;
      }
      if (d instanceof List) { if (!Array.isArray(a) || a.length !== d.l.length) throw new Error("delta does not fit"); return d.l.map((v, i) => patch(a[i], v)); }
      if (d instanceof Add) {
        if (typeof a !== "number") throw new Error("delta does not fit");
        return d.c ? (Math.round(a * 100) + d.k) / 100 : a + d.k;
      }
      return d;
    }
    // ---- binary: a tag byte, then varints, strings and the parts ----
    const T = { NULL: 0, FALSE: 1, TRUE: 2, UINT: 3, NINT: 4, UDEC: 5, NDEC: 6, F64: 7, STR: 8, ARR: 9, OBJ: 10, SAME: 11, GONE: 12, PATCH: 13, LIST: 14,
      ADD: 15, ADDC: 16, KEY: 17, KREF: 32 };   // KREF + i (up to 255): the i-th key of this message again
    const MAGIC = 0xb5, VERSION = 2;
    const enc = new TextEncoder(), dec = new TextDecoder();
    function writer() {
      let buf = new Uint8Array(4096), n = 0;
      const room = k => { if (n + k > buf.length) { const nb = new Uint8Array(Math.max(buf.length * 2, n + k)); nb.set(buf); buf = nb; } };
      const byte = v => { room(1); buf[n++] = v; };
      const uvar = v => { room(8); while (v >= 128) { buf[n++] = (v % 128) | 128; v = Math.floor(v / 128); } buf[n++] = v; };
      const str = s => {
        let ascii = s.length < 128;
        for (let i = 0; ascii && i < s.length; i++) if (s.charCodeAt(i) > 127) ascii = false;
        if (ascii) { uvar(s.length); room(s.length); for (let i = 0; i < s.length; i++) buf[n++] = s.charCodeAt(i); return; }
        const b = enc.encode(s); uvar(b.length); room(b.length); buf.set(b, n); n += b.length;
      };
      const f64 = new Float64Array(1), f64b = new Uint8Array(f64.buffer), keys = new Map();
      const zig = v => uvar(v < 0 ? -2 * v - 1 : 2 * v);
      const key = k => { const i = keys.get(k); if (i !== undefined) return byte(T.KREF + i); byte(T.KEY); str(k); if (keys.size < 256 - T.KREF) keys.set(k, keys.size); };
      function value(v) {
        if (v === SAME) return byte(T.SAME);
        if (v === GONE) return byte(T.GONE);
        if (v instanceof Patch) { const ks = Object.keys(v.o); byte(T.PATCH); uvar(ks.length); for (const k of ks) { key(k); value(v.o[k]); } return; }
        if (v instanceof List) { byte(T.LIST); uvar(v.l.length); for (const x of v.l) value(x); return; }
        if (v instanceof Add) { byte(v.c ? T.ADDC : T.ADD); return zig(v.k); }
        if (v === null || v === undefined) return byte(T.NULL);
        if (v === false) return byte(T.FALSE);
        if (v === true) return byte(T.TRUE);
        if (typeof v === "number") {
          const a = Math.abs(v);
          if (Number.isSafeInteger(v)) { byte(v < 0 ? T.NINT : T.UINT); return uvar(a); }
          const c = Math.round(a * 100);
          if (Number.isSafeInteger(c) && c / 100 === a) { byte(v < 0 ? T.NDEC : T.UDEC); return uvar(c); }   // two decimals: exact again as c / 100
          byte(T.F64); f64[0] = v; room(8); buf.set(f64b, n); n += 8; return;
        }
        if (typeof v === "string") { byte(T.STR); return str(v); }
        if (Array.isArray(v)) { byte(T.ARR); uvar(v.length); for (const x of v) value(x); return; }
        const ks = Object.keys(v).filter(k => v[k] !== undefined);
        byte(T.OBJ); uvar(ks.length); for (const k of ks) { key(k); value(v[k]); }
      }
      return { value, uvar, byte, done: () => buf.slice(0, n) };
    }
    function reader(buf) {
      let n = 0;
      const byte = () => { if (n >= buf.length) throw new Error("short"); return buf[n++]; };
      const uvar = () => { let v = 0, m = 1; for (let i = 0; i < 8; i++) { const b = byte(); v += (b & 127) * m; if (b < 128) return v; m *= 128; } throw new Error("varint"); };
      const str = () => { const len = uvar(); if (n + len > buf.length) throw new Error("short"); const s = dec.decode(buf.subarray(n, n + len)); n += len; return s; };
      const count = () => { const c = uvar(); if (c > buf.length - n) throw new Error("count"); return c; };   // every part takes a byte at least
      const keys = [];
      const key = () => {
        const t = byte();
        if (t === T.KEY) { const k = str(); if (k === "__proto__") throw new Error("key"); if (keys.length < 256 - T.KREF) keys.push(k); return k; }
        if (t >= T.KREF && t - T.KREF < keys.length) return keys[t - T.KREF];
        throw new Error("key");
      };
      const unzig = () => { const z = uvar(); return z % 2 ? -(z + 1) / 2 : z / 2; };
      function value(depth = 0) {
        if (depth > 32) throw new Error("deep");
        const t = byte();
        switch (t) {
          case T.NULL: return null; case T.FALSE: return false; case T.TRUE: return true;
          case T.UINT: return uvar(); case T.NINT: return -uvar();
          case T.UDEC: return uvar() / 100; case T.NDEC: return -uvar() / 100;
          case T.F64: { if (n + 8 > buf.length) throw new Error("short"); const v = new DataView(buf.buffer, buf.byteOffset + n, 8).getFloat64(0, true); n += 8; return v; }
          case T.STR: return str();
          case T.ARR: { const c = count(), a = new Array(c); for (let i = 0; i < c; i++) a[i] = value(depth + 1); return a; }
          case T.OBJ: { const c = count(), o = {}; for (let i = 0; i < c; i++) { const k = key(); o[k] = value(depth + 1); } return o; }
          case T.SAME: return SAME; case T.GONE: return GONE;
          case T.PATCH: { const c = count(), o = {}; for (let i = 0; i < c; i++) { const k = key(); o[k] = value(depth + 1); } return new Patch(o); }
          case T.ADD: return new Add(unzig(), false);
          case T.ADDC: return new Add(unzig(), true);
          case T.LIST: { const c = count(), l = new Array(c); for (let i = 0; i < c; i++) l[i] = value(depth + 1); return new List(l); }
        }
        throw new Error("tag " + t);
      }
      return { value, uvar, byte, end: () => n === buf.length };
    }
    // one message: snapshot q, as a delta from snapshot base (0: the whole of it)
    function frame(q, base, d) { const w = writer(); w.byte(MAGIC); w.byte(VERSION); w.uvar(q); w.uvar(base); w.value(d); return w.done(); }
    function unframe(bytes) {
      const r = reader(bytes);
      if (r.byte() !== MAGIC || r.byte() !== VERSION) throw new Error("not a snapshot");
      const q = r.uvar(), base = r.uvar(), d = r.value();
      if (!r.end()) throw new Error("trailing bytes");
      return { q, base, d };
    }
    return { SAME, GONE, diff, patch, frame, unframe };
  })();
