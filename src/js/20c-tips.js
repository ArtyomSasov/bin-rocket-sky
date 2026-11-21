  // ---------- first steps: a short card for a newcomer ----------
  // On a first match a small card at the bottom walks through the controls, one step at a time; each step is ticked
  // off by doing it (not by reading it), and the card goes for good once all are done or it is closed. Touch screens
  // get their own steps
  const TIPS_KEY = "binrocket.tips";
  const TIP_STEPS = COARSE ? [
    ["Drag the stick on the left to fly", t => t.flown > 400],
    ["Hold the boost button to boost, tap it to dash", t => t.boosted],
    ["Tap the fire button to shoot", t => t.shots >= 3],
    ["ALT fires the gun's second mode; tap a gun in the bar to switch", t => t.alt || t.switched]
  ] : [
    ["Fly with W A S D", t => t.flown > 400],
    ["Hold Shift to boost, tap it to dash", t => t.boosted],
    ["Aim with the mouse, the left button fires", t => t.shots >= 3],
    ["The right button fires the gun's second mode; 1–9 or Q / E switch guns", t => t.alt || t.switched]
  ];
  const tipsEl = document.getElementById("tips"), tipsText = document.getElementById("tipsText"), tipsStep = document.getElementById("tipsStep");
  let tips = null;   // { step, flown, boosted, shots, alt, switched, x, y, shots0, weapon0, dash0, doneAt }
  tipsEl?.querySelector("button")?.addEventListener("click", () => { store.set(TIPS_KEY, "done"); tips = { closed: true }; tipsEl.hidden = true; });
  function tipsTick(now) {
    if (!tipsEl || tips?.closed) return;
    if (!tips) {
      if (store.get(TIPS_KEY) === "done" || !playing || me.dead) return;
      tips = { step: 0, flown: 0, boosted: false, shots: 0, alt: false, switched: false, x: me.x, y: me.y, shots0: stats.shots, weapon0: me.weapon, dash0: me.dashAt || 0 };
    }
    if (!playing) { tipsEl.hidden = true; return; }
    if (!me.dead) {
      const d = Math.hypot(me.x - tips.x, me.y - tips.y); if (d < 300) tips.flown += d;   // (not a respawn's jump)
      tips.x = me.x; tips.y = me.y;
      if (me.boostOn || (me.dashAt || 0) > tips.dash0) tips.boosted = true;
      tips.shots = stats.shots - tips.shots0;
      if (altFiring || keys.has("KeyC")) tips.alt = true;
      if (me.weapon !== tips.weapon0) tips.switched = true;
    }
    if (tips.doneAt) {   // the last step ticked: "Ready" for a moment, then gone for good
      if (now - tips.doneAt > 1800) { store.set(TIPS_KEY, "done"); tips.closed = true; tipsEl.hidden = true; }
      return;
    }
    while (tips.step < TIP_STEPS.length && TIP_STEPS[tips.step][1](tips)) tips.step++;
    if (tips.step >= TIP_STEPS.length) { tips.doneAt = now; tipsText.textContent = "Ready. Good hunting!"; tipsStep.textContent = "✓"; tipsEl.classList.add("done"); return; }
    const txt = TIP_STEPS[tips.step][0];
    if (tipsText.textContent !== txt) { tipsText.textContent = txt; tipsStep.textContent = (tips.step + 1) + "/" + TIP_STEPS.length; tipsEl.classList.remove("pop"); void tipsEl.offsetWidth; tipsEl.classList.add("pop"); }
    tipsEl.hidden = false;
  }
