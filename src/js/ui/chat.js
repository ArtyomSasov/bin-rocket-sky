  // ---------- chat ----------
  // T opens a line to type in (the game's keys let go while it is open); Enter sends it, Esc or leaving it closes it.
  // Lines show over the mini map and fade after 10 s (all of the last few come back while typing). Names and text go
  // in as text only, cleaned of control and invisible characters, at most 140; a peer sending lines too fast is cut
  const chatEl = document.getElementById("chat"), chatLog = document.getElementById("chatLog"), chatIn = document.getElementById("chatIn");
  const cleanChatText = t => String(t).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
  const chatRate = new Map();
  function chatShow(name, text, mine, from = "") {
    text = cleanChatText(text); name = cleanChatText(name).slice(0, 14) || "Pilot";
    if (!text) return;
    if (from && !mine) {   // a peer's lines: a few in a burst, then about one a second
      const now = performance.now(), r = chatRate.get(from) || { tok: 4, at: now };
      r.tok = Math.min(4, r.tok + (now - r.at) / 900); r.at = now; chatRate.set(from, r);
      if (r.tok < 1) return; r.tok--;
    }
    const line = document.createElement("div"), who = document.createElement("b");
    line.className = "chat-line" + (mine ? " me" : ""); who.textContent = name; line.append(who, document.createTextNode(text));
    chatLog.append(line); while (chatLog.children.length > 8) chatLog.firstChild.remove();
    chatEl.hidden = false;
    setTimeout(() => line.classList.add("old"), 10000);
    if (!mine) sfx("hit", 0.15, 2.6);
  }
  function chatOpen() {
    if (!playing || !chatIn.hidden) return;
    keys.clear(); firing = false;
    chatEl.hidden = false; chatEl.classList.add("open"); chatIn.hidden = false; chatIn.value = ""; chatIn.focus();
  }
  function chatClose() { chatIn.hidden = true; chatEl.classList.remove("open"); chatIn.blur(); cv.focus(); }
  function chatSend() {
    const text = cleanChatText(chatIn.value);
    chatClose();
    if (!text) return;
    if (serverRun) toServer({ t: "chat", m: text });   // (the server sends it back to everyone, me too)
    else { chatShow(me.name || "You", text, true); if (net.chat) net.chat(text); }
  }
  addEventListener("keydown", e => {
    if (e.code === "KeyT" && !e.repeat && playing && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); chatOpen(); }
  });
  chatIn.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); chatSend(); }
    else if (e.key === "Escape") { e.preventDefault(); chatClose(); }
  });
  chatIn.addEventListener("blur", () => { if (!chatIn.hidden) chatClose(); });
  document.getElementById("chatBtn").addEventListener("click", e => { e.stopPropagation(); chatOpen(); });   // (a touch screen has no T)

