  // ---------- loop ----------
  let last = performance.now(), frameAvg = 1 / 60;
  let holyAnnounced = "";
  const world = { sparks: [], rocks: [], picks: [], bombs: [], amp: null, supplies: [] };   // shared-clock objects, computed once per frame
  // once a second, also in a background tab: the network keeps adding effects and ids there while no frame runs
  setInterval(() => {
    const t = performance.now(), cap = (list, n) => { if (list.length > n) list.splice(0, list.length - n); };
    cap(parts, MAX_PARTS); cap(impacts, 120); cap(rings, 80); cap(floaters, 60); cap(arcs, 40); cap(beams, 256);
    for (const [k, at] of seenShots) if (t - at > 5000) seenShots.delete(k);
    grabbed.prune(120000);
    pruneNetwork(t);
    pruneRockMotion(clockNow());
    while (myDrops.length && Date.now() - myDrops[0][4] > DROP_LIFE) myDrops.shift();
    while (myGunDrops.length && Date.now() - myGunDrops[0][5] > GUN_DROP_LIFE) myGunDrops.shift();
    for (const [id, d] of gunDrops) if (t - d.born > GUN_DROP_LIFE) gunDrops.delete(id);
  }, 1000);
  // the shared-clock world at this instant (sparks, junk, pick-ups and the round), the same on every screen and on
  // the server, which steps it without a frame or a page (see server/sim)
  function worldTick(now) {
    const wt = clockNow();
    for (let i = 0; i < SLOTS; i++) world.sparks[i] = spark(i, wt);
    for (let i = 0; i < ROCKS; i++) world.rocks[i] = rock(i, wt);
    const solo = !!MODES[MODE].only;
    world.picks.length = solo ? 0 : PICKS;
    for (let i = 0; i < world.picks.length; i++) world.picks[i] = pickup(i, wt);
    world.bombs = solo ? [] : Object.keys(BOMB_CRATES).map(k => bombPickup(wt, k)).filter(Boolean);
    const holy = world.bombs.find(c => c.type === "holy");   // a fresh holy-bomb crate is announced once
    if (playing && holy && holy.age < 1 && holy.key !== holyAnnounced && !grabbed.has(holy.key)) { holyAnnounced = holy.key; announce("HOLY BOMB", "it is back on its spot · follow the white arrow", "#fff3b0"); }   // back after someone took it
    world.amp = solo ? null : ampPickup(wt);
    world.supplies.length = MODES[MODE].noSupplies ? 0 : SUPPLY_SLOTS;
    roundTick(now);
    for (let i = 0; i < world.supplies.length; i++) world.supplies[i] = supply(i, wt);
    // a black hole drags the junk and the pick-ups in too; what it swallows is gone (on every screen alike)
    const ev = eventAt(wt);
    if (ev.type === "blackhole" && ev.et > 0 && ev.et < EV_LEN + HOLE_BACK)   // (only while a hole is open or easing back: see holePull)
      for (const list of [world.sparks, world.rocks, world.picks, world.supplies, world.bombs, [world.amp]]) for (const o of list) {
        if (o && !(o.slot !== undefined && rockMotion.has(o.slot)) && holePull(o, wt, 0) > 0.9 && !grabbed.has(o.key)) {
          grabbed.add(o.key);   // swallowed: gone (a spot's item comes back on its next cycle)
          swallowFx(o.x, o.y, blackHole(ev), o.type ? (WEAPONS[o.type] || SUPPLIES[o.type] || {}).col || "#c38bff" : "#ffffff");
        }
      }
  }
  let resCheckAt = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
    if (raw < 0.25) {   // ignore pauses (tab switch)
      frameAvg += (raw - frameAvg) * 0.05;
      if (settings.fx === "low") lowQ = true;               // the player asked for light effects
      else if (!lowQ && frameAvg > 1 / 42) lowQ = true;     // under ~42 fps: lighten the load
      else if (lowQ && frameAvg < 1 / 56) lowQ = false;     // back above ~56 fps: full effects
      // dynamic resolution: below ~50 fps draw fewer pixels (down to 55%), and climb back once it runs smoothly
      if (settings.res === "auto" && now - resCheckAt > 1500) {
        resCheckAt = now;
        if (frameAvg > 1 / 50 && resScale > 0.55) { resScale = Math.max(0.55, resScale - 0.15); resize(); }
        else if (frameAvg < 1 / 58 && resScale < 1) { resScale = Math.min(1, resScale + 0.15); resize(); }
      }
    }
    worldTick(now);
    update(now < hitStopUntil ? 0 : dt, now); draw(now);
    if (!playing) drawPreview(now);
    else { drawMinimap(now); renderEnergy(); }
    if (post) post.frame(dt);   // the WebGL look over the finished frame (20b-post.js)
    const cur = playing && mouseAim() ? (settings.aim === "off" || me.dead ? "crosshair" : "none") : "";
    if (cv.style.cursor !== cur) cv.style.cursor = cur;
  }
  requestAnimationFrame(frame);

