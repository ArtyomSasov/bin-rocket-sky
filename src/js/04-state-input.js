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
  const DROP_LIFE = 20000;
  const remotes = new Map();   // id -> remote bot
  // "slot:gen" of pick-ups already taken by anyone; a key is forgotten two minutes after it was last taken,
  // by when its item has long been replaced by the next generation
  class AgedSet extends Set {
    constructor() { super(); this.at = new Map(); }
    add(k) { this.at.set(k, performance.now()); return super.add(k); }
    delete(k) { this.at.delete(k); return super.delete(k); }
    clear() { this.at.clear(); super.clear(); }
    prune(age) { const t = performance.now(); for (const [k, a] of this.at) if (t - a > age) this.delete(k); }
  }
  const grabbed = new AgedSet();
  const myGrabs = [];
  const parts = [];
  const floaters = [];
  const keys = new Set();
  const ptr = { down: false, x: 0, y: 0 };
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
    if (e.button === 2) return;   // the right button is alternate fire (see below), it doesn't steer
    ptr.down = true; ptr.x = e.clientX / zoom; ptr.y = e.clientY / zoom; cv.setPointerCapture(e.pointerId);
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
    ptr.x = e.clientX / zoom; ptr.y = e.clientY / zoom;
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

