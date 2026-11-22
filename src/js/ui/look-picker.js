  // ---------- the start card: the pilot's look (a preview and the pickers) ----------
  const pv = document.getElementById("preview"), pctx = pv.getContext("2d");
  function drawPreview(now) {
    const main = g, mainTS = TS; g = pctx; TS = 1;
    try {
    const k = pv.width / 150;
    pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.setTransform(k * 1.25, 0, 0, k * 1.25, 0, 0);
    drawBot({ ...me, thrust: 0.9, a: -Math.PI / 2 + Math.sin(now / 900) * 0.25 }, 60, 66, now, true, { name: "" });   // low enough for a hat or halo
    } finally { g = main; TS = mainTS; }
  }
  me.ck = cleanCustom((() => { try { return JSON.parse(store.get("binrocket.custom")); } catch { return null; } })());
  const optsEl = document.getElementById("customOpts");
  const swatchBg = (key, val) => key === "body" ? (val === null ? "#4fd6c8" : toneCss(val, 65, 55))
    : key === "lid" ? (val === null ? "#9d8fc8" : toneCss(val, 45, 60))
    : key === "flame" ? (val === null ? "linear-gradient(#ffe08a,#ff5a1f)" : val === "rainbow" ? "linear-gradient(90deg,#ff6b6b,#ffe66b,#6bff95,#6bd5ff,#ff7bea)" : `rgb(${FLAMES[val].mid})`)
    : null;
  const lookPanels = [];
  function setLook(ck) {
    me.ck = ck;
    store.set("binrocket.custom", JSON.stringify(me.ck));
    for (const p of lookPanels) for (const o of p.querySelectorAll(".sw")) {
      o.setAttribute("aria-pressed", String(+o.dataset.i === me.ck[CUSTOM_KEYS.indexOf(o.dataset.key)]));
    }
  }
  function lookPicker(el) {
  lookPanels.push(el);
  for (const key of CUSTOM_KEYS) {
    const row = document.createElement("div"); row.className = "opt-row";
    const lab = document.createElement("span"); lab.textContent = CUSTOM[key].label;
    const sws = document.createElement("div"); sws.className = "sws";
    CUSTOM[key].items.forEach(([name, val], i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sw"; b.title = name; b.setAttribute("aria-label", CUSTOM[key].label + ": " + name);
      const bg = swatchBg(key, val);
      if (bg) b.style.setProperty("--c", bg); else { b.classList.add("txt"); b.textContent = name; }
      b.dataset.key = key; b.dataset.i = i;
      b.setAttribute("aria-pressed", String(me.ck[CUSTOM_KEYS.indexOf(key)] === i));
      b.addEventListener("click", () => {
        const ck = me.ck.slice(); ck[CUSTOM_KEYS.indexOf(key)] = i;
        setLook(ck);   // others see it with my next state
      });
      sws.appendChild(b);
    });
    row.append(lab, sws); el.appendChild(row);
  }
  }
  lookPicker(optsEl);
  lookPicker(document.getElementById("menuLook"));
  document.getElementById("randomLook").addEventListener("click", () => {
    setLook(CUSTOM_KEYS.map(key => Math.floor(Math.random() * CUSTOM[key].items.length)));
  });
