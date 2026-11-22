  // ---------- bot picker ----------
  const botChoice = (() => { try { const v = JSON.parse(store.get("binrocket.bots")); if (v && Number.isInteger(v.n) && v.n >= 0 && v.n <= MAX_BOTS && BOT_LEVELS[v.level]) return v; } catch {} return { n: 0, level: "normal" }; })();
  function segButtons(el, items, current, onPick) {
    for (const [val, label, hint] of items) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      if (hint) { const s = document.createElement("small"); s.textContent = hint; b.append(s); }
      b.setAttribute("aria-pressed", String(val === current));
      b.addEventListener("click", () => { for (const o of el.children) o.setAttribute("aria-pressed", String(o === b)); onPick(val); });
      el.appendChild(b);
    }
  }
  const botSlider = document.getElementById("botCount"), botOutput = document.getElementById("botCountValue");
  botSlider.max = MAX_BOTS; botSlider.value = botChoice.n;
  const showBotCount = () => { botOutput.value = botChoice.n ? botChoice.n + " bots" : "No bots"; botSlider.setAttribute("aria-valuetext", botOutput.value); };
  showBotCount();
  botSlider.addEventListener("input", () => { botChoice.n = Math.max(0, Math.min(MAX_BOTS, Number(botSlider.value))); showBotCount(); store.set("binrocket.bots", JSON.stringify(botChoice)); });
  segButtons(document.getElementById("botLevel"), Object.entries(BOT_LEVELS).map(([k, L]) => [k, L.label]), botChoice.level, v => { botChoice.level = v; store.set("binrocket.bots", JSON.stringify(botChoice)); });

