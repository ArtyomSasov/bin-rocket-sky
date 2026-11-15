  // ---------- state ----------
  const me = {
    x: rndIn(W, 300), y: rndIn(H, 300), vx: 0, vy: -40, a: -Math.PI / 2,
    thrust: 0, score: 0, name: "", hue: Math.floor(Math.random() * 360), ck: [0, 0, 0, 0, 0],
    lives: LIVES, dead: false, respawnAt: 0, inv: 0, xp: 0, lv: 1, weapon: "fire", arsenal: { fire: Infinity }, ampUntil: 0, carry: 0, ds: 0, shield: 0, boostFx: 0, dashAt: -1e9, bank: 0, boostOn: false
  };
  const myTag = Math.random().toString(36).slice(2, 7);
  let shotSeq = 0, fireCd = 0, firing = false, altFiring = false, shake = 0, hurtFlash = 0;
  const camKick = { x: 0, y: 0 };
  const shots = [];            // live fireballs: {id, x, y, vx, vy, life, mine}
  const myShotLog = [];        // recent own shots, shared so others can see them
  const seenShots = new Map();   // shot id -> when first seen
  const hitBy = [], koBy = []; // shot ids that hit / knocked me out (shooter reads these for credit)
  const credited = new Set();
  // stars spilled by a destroyed bin: id -> {x, y, n, born}; shared through presence
  const drops = new Map();
  const myDrops = [];          // [id, x, y, n, bornMs] of my own recent spills
  let deaths = 0;
  // trophies: the gun a pilot dies with drops where it died, with its ammo, for 15 s; anyone may take it
  const gunDrops = new Map();   // id -> { x, y, type, ammo, born }
  const myGunDrops = [];        // [id, x, y, gun index, ammo, bornMs]: mine and my bots', sent with my state
  const GUN_DROP_LIFE = 15000;
  let gunDropSeq = 0;
  const DROP_LIFE = 20000;
  const remotes = new Map();   // id -> remote bot
  // "slot:gen" of pick-ups already taken by anyone; a key is forgotten two minutes after it was last taken,
  // by when its item has long been replaced by the next generation
  // (and never more than GRAB_CAP keys: other pilots' lists feed it, so a flood can't grow it without bound)
  const GRAB_CAP = 1000;
  class AgedSet extends Set {
    constructor() { super(); this.at = new Map(); }
    add(k) {
      this.at.delete(k); this.at.set(k, performance.now());   // re-adding moves it to the young end
      if (this.at.size > GRAB_CAP) for (const old of this.at.keys()) { this.delete(old); if (this.at.size <= GRAB_CAP) break; }
      return super.add(k);
    }
    delete(k) { this.at.delete(k); return super.delete(k); }
    clear() { this.at.clear(); super.clear(); }
    prune(age) { const t = performance.now(); for (const [k, a] of this.at) if (t - a > age) this.delete(k); }
  }
  const grabbed = new AgedSet();
  const myGrabs = [];
  const parts = [];
  const floaters = [];
  const keys = new Set();
  const ptr = { down: false, x: 0, y: 0, cx: 0, cy: 0, moved: false };   // cx, cy: the cursor on screen (CSS px)
  // mouse aim (Settings: Mouse, on by default with a mouse): the nose and the gun follow the cursor wherever the bin
  // flies, WASD flies, the left button fires and the right one is the alt fire. Until the mouse moves, or with
  // "Mouse: steers", the nose follows the flight and holding the button flies toward the pointer as before
  const mouseAim = () => !COARSE && settings.mouse !== "steer" && ptr.moved;
  // like a shooter: in a game the mouse is captured (Pointer Lock). The system cursor is gone everywhere and the
  // mouse moves only the crosshair, which stays on the screen. Esc lets the mouse go; a click takes it back
  const aimLocked = () => document.pointerLockElement === cv;
  const wantsLock = () => playing && !COARSE && settings.mouse !== "steer" && !!cv.requestPointerLock;
  function lockAim() {
    if (!wantsLock() || aimLocked()) return;
    if (!ptr.cx && !ptr.cy) { ptr.cx = innerWidth / 2 + 160; ptr.cy = innerHeight / 2; }
    try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {}
  }
  const lockHint = document.getElementById("lockHint");
  document.addEventListener("pointerlockchange", () => {
    if (aimLocked()) ptr.moved = true;
    lockHint.hidden = aimLocked() || !wantsLock();
  });
  const cursorAt = () => [ptr.cx / zoom, ptr.cy / zoom];   // in view units, read with the zoom of this frame
  let playing = false;
  let lowQ = false;   // set by the frame loop when the device can't keep up
  let roundLive = true;
  const stats = { round: -1, kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 };
  // smooth steering + boost: input eases in, energy drains while boosting and refills after a short pause
  const steer = { x: 0, y: 0 };
  // the camera looks a little ahead of where you fly (cam: the world point at the centre of the screen)
  const cam = { x: 0, y: 0, lx: 0, ly: 0 };
  const BOOST_HOLD = 0.18;           // s: a press shorter than this is just a dash
  let energy = 100, energyRegenAt = 0, dashReadyAt = 0, boostDownAt = -1, boostBtnDown = false;
  let audio = null;

  // ---------- input ----------
  const wakeAudio = () => { if (audio && audio.state === "suspended") audio.resume(); };
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

