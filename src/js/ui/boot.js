  // ---------- loading ----------
  // the sounds and pictures start loading as the page opens; a bar under Take off shows how far, and the button says
  // the sounds are still loading (it works all the same: they come in as they are ready)
  if (window.OfflineAudioContext || window.webkitOfflineAudioContext) preloadSounds();
  {
    const bar = document.getElementById("loadBar"), fill = bar.querySelector("i"), text = document.getElementById("loadText");
    const pics = { total: 0, done: 0 };
    let shown = -1, finished = false;
    const show = st => {
      const total = st.total + pics.total, done = st.done + pics.done, ready = (preloading || audio) && done >= total && total > 0;
      const pct = total ? Math.round(100 * done / total) : 0;
      goBtn.classList.toggle("loading", !ready);
      if (pct === shown && !ready) return;
      shown = pct; fill.style.width = (ready ? 100 : pct) + "%"; bar.setAttribute("aria-valuenow", ready ? 100 : pct);
      if (!ready) { text.textContent = (preloading || audio) ? `Loading sounds… ${pct}%  (${done}/${total})` : "Sounds load with your first click"; return; }
      if (finished) return;
      finished = true;
      bar.classList.add(st.failed ? "warn" : "done");
      text.textContent = st.failed ? `Ready · ${st.failed} sound${st.failed > 1 ? "s" : ""} could not load` : "All sounds ready";
      if (!st.failed) setTimeout(() => bar.classList.add("gone"), 1800);
    };
    for (const im of [img, holyImg]) if (!im.complete) {
      pics.total++;
      const ok = () => { pics.done++; show(loadState); };
      im.addEventListener("load", ok, { once: true }); im.addEventListener("error", ok, { once: true });
    }
    loadWatch(show);
  }
