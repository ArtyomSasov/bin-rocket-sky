  // ---------- input ----------
  const wakeAudio = () => {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); loadSfx(); } catch {} }
    if (audio && audio.state === "suspended") audio.resume().catch(() => {});
  };
  addEventListener("pointerdown", wakeAudio);
  addEventListener("keydown", e => {
    wakeAudio();
    if (e.target.tagName === "INPUT") return;
    keys.add(e.code);
    if (playing && (e.code.startsWith("Arrow") || e.code === "Space")) e.preventDefault();
  });
  addEventListener("keydown", e => {
    if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat && e.target.tagName !== "INPUT") { boostDownAt = performance.now(); dash(boostDownAt); }
  });
  addEventListener("keyup", e => keys.delete(e.code));
  addEventListener("blur", () => { keys.clear(); ptr.down = false; firing = false; altFiring = false; boostBtnDown = false; joyEnd(); });
  const fireBtn = document.getElementById("fireBtn");
  const boostBtn = document.getElementById("boostBtn");
  boostBtn.addEventListener("pointerdown", e => {
    e.preventDefault(); boostBtn.setPointerCapture(e.pointerId);
    boostBtnDown = true; boostDownAt = performance.now(); dash(boostDownAt);
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) boostBtn.addEventListener(ev, () => { boostBtnDown = false; });
  boostBtn.addEventListener("contextmenu", e => e.preventDefault());
  fireBtn.addEventListener("pointerdown", e => { e.preventDefault(); firing = true; fireBtn.setPointerCapture(e.pointerId); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) fireBtn.addEventListener(ev, () => { firing = false; });
  // touch: a floating joystick appears under the thumb on the left part of the screen; mouse: hold and point
  const joyEl = document.getElementById("joy"), joyKnob = joyEl.firstElementChild;
  const JOY_R = 56;
  const joy = { id: null, bx: 0, by: 0, x: 0, y: 0 };
  function joyEnd() {
    joy.id = null; joy.x = joy.y = 0;
    joyEl.classList.remove("on"); joyEl.style.left = joyEl.style.top = joyEl.style.bottom = ""; joyKnob.style.transform = "";
  }
  cv.addEventListener("pointerdown", e => {
    if (COARSE && e.pointerType !== "mouse") {
      if (joy.id !== null || e.clientX > innerWidth * 0.6) return;
      joy.id = e.pointerId; joy.bx = e.clientX; joy.by = e.clientY; joy.x = joy.y = 0;
      joyEl.classList.add("on");
      joyEl.style.left = joy.bx - 62 + "px"; joyEl.style.top = joy.by - 62 + "px"; joyEl.style.bottom = "auto";
      cv.setPointerCapture(e.pointerId);
      return;
    }
    if (e.pointerType === "mouse" && wantsLock() && !aimLocked()) { lockAim(); if (e.button === 2) return; }   // a click takes the mouse back
    if (e.button === 2) return;   // the right button is alternate fire (see below), it doesn't steer
    ptr.down = true;
    if (!aimLocked()) { ptr.x = e.clientX / zoom; ptr.y = e.clientY / zoom; ptr.cx = e.clientX; ptr.cy = e.clientY; }
    try { cv.setPointerCapture(e.pointerId); } catch {}
    if (e.pointerType === "mouse") ptr.moved = true;
  });
  cv.addEventListener("pointermove", e => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.bx, dy = e.clientY - joy.by;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) {   // the base follows a thumb that slides past the rim, so reversing direction is instant
        joy.bx += dx / d * (d - JOY_R); joy.by += dy / d * (d - JOY_R);
        dx = dx / d * JOY_R; dy = dy / d * JOY_R;
        joyEl.style.left = joy.bx - 62 + "px"; joyEl.style.top = joy.by - 62 + "px";
      }
      joy.x = dx / JOY_R; joy.y = dy / JOY_R;
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      return;
    }
    if (aimLocked()) {   // captured: the mouse moves the crosshair by its own motion, kept on the screen
      ptr.cx = clamp(ptr.cx + e.movementX, 8, innerWidth - 8); ptr.cy = clamp(ptr.cy + e.movementY, 8, innerHeight - 8);
    } else { ptr.cx = e.clientX; ptr.cy = e.clientY; }
    ptr.x = ptr.cx / zoom; ptr.y = ptr.cy / zoom;
    if (e.pointerType === "mouse") ptr.moved = true;
  });
  const up = e => { if (e.pointerId === joy.id) joyEnd(); else if (e.button !== 2) ptr.down = false; };
  // right mouse button = alternate fire. Pressing or releasing a second button while another is held only sends
  // pointermove, so the buttons mask is read on every mouse event
  const syncAlt = e => { if (e.pointerType === "mouse") altFiring = (e.buttons & 2) !== 0; };
  for (const ev of ["pointerdown", "pointermove", "pointerup"]) addEventListener(ev, syncAlt);
  const altBtn = document.getElementById("altBtn");
  altBtn.addEventListener("pointerdown", e => { e.preventDefault(); altFiring = true; altBtn.setPointerCapture(e.pointerId); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) altBtn.addEventListener(ev, () => { altFiring = false; });
  altBtn.addEventListener("contextmenu", e => e.preventDefault());
  for (const el of [cv, fireBtn]) el.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);

