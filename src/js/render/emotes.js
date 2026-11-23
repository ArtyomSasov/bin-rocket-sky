  // ---------- emotes: a pilot says something with its bin (G: "GG", H: a wiggle, V: a flip) ----------
  // Each goes out with the pilot's state as [its number, its kind] for a moment (EMOTE_MS); every screen shows it when
  // the number changes. Bots wiggle now and then after a kill
  const EMOTES = ["gg", "wiggle", "flip"], EMOTE_KEYS = { KeyG: 0, KeyH: 1, KeyV: 2 }, EMOTE_MS = 1300;
  let myEmote = null;   // [number, kind] of my last one
  function emote(o, kind, now) {
    if (!EMOTES[kind] || now - (o.emAt || -1e9) < 700) return;   // (not too often)
    o.emSeq = (o.emSeq || 0) + 1; o.emKind = kind; o.emAt = now;
    if (o === me) myEmote = [me.emSeq, kind];
  }
  const emoteWire = (o, now) => o.emAt && now - o.emAt < EMOTE_MS ? [o.emSeq, o.emKind] : undefined;
  function takeEmote(o, em, now) {   // from a pilot's state: shown once, when its number changes
    if (!Array.isArray(em) || !Number.isSafeInteger(em[0]) || !EMOTES[em[1]] || em[0] === o.emSeq) return;
    o.emSeq = em[0]; o.emKind = em[1]; o.emAt = now;
  }
  // how an emote moves the bin (drawBot): [extra turn, x scale, lift], and its words (drawn over it)
  function emotePose(b, now) {
    const t = b.emAt ? (now - b.emAt) / EMOTE_MS : 9;
    if (t < 0 || t > 1) return null;
    const kind = EMOTES[b.emKind];
    if (kind === "wiggle") return [Math.sin(t * 6.283 * 3) * 0.35 * (1 - t), 1, 0];
    if (kind === "flip") return [0, Math.cos(Math.min(1, t * 1.6) * 6.283 * 2) , -Math.sin(Math.min(1, t * 1.6) * Math.PI) * 18];
    return [0, 1, 0];
  }
  function drawEmoteWords(b, x, y, now, S) {
    const t = b.emAt ? (now - b.emAt) / EMOTE_MS : 9;
    if (t < 0 || t > 1 || EMOTES[b.emKind] !== "gg") return;
    const a = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1, by = y - S * 0.75 - 14 * TS - t * 16;
    g.save(); g.globalAlpha = a; g.font = `800 ${18 * TS}px ` + DISPLAY_FONT; g.textAlign = "center";
    const w = g.measureText("GG").width + 18 * TS, h = 26 * TS;
    g.fillStyle = "rgba(255,255,255,0.92)"; g.beginPath(); g.roundRect(x - w / 2, by - h / 2, w, h, 9 * TS); g.fill();
    g.beginPath(); g.moveTo(x - 6 * TS, by + h / 2 - 1); g.lineTo(x, by + h / 2 + 7 * TS); g.lineTo(x + 6 * TS, by + h / 2 - 1); g.fill();
    g.fillStyle = "#1d1630"; g.fillText("GG", x, by + 6 * TS);
    g.restore();
  }
