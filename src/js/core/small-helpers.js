  // distance test along the segment a shot travelled this frame, so fast shots can't skip a target
  function segHit(s, x, y, r) {
    const dx = s.x - s.px, dy = s.y - s.py, L = dx * dx + dy * dy;
    const t = L ? clamp(((x - s.px) * dx + (y - s.py) * dy) / L, 0, 1) : 0;
    return Math.hypot(s.px + dx * t - x, s.py + dy * t - y) < r;
  }
  function rrect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const scoreEl = document.getElementById("score");
  let shownScore = 0;
  function showScore() { if (me.score !== shownScore) { shownScore = me.score; scoreEl.textContent = me.score; } }
  function pushCapped(arr, v, n) { arr.push(v); if (arr.length > n) arr.shift(); }

