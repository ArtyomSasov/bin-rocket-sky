  // ---------- the local room: devices in one place, on the same Wi-Fi (a phone hotspot will do), no internet ----------
  // One device hosts. Each guest connects straight to it over WebRTC. The handshake is two short codes, shown as QR
  // codes (host -> guest, then guest -> host) or copied as text, so no server is involved at all. Only the
  // candidates on the local network are used. The host relays every pilot's state to the others, like the broker does.
  const lan = { host: false, guest: false, code: "", myId: "p" + Math.random().toString(36).slice(2, 10), peers: [] };
  const LAN_TAG = "BRS17";
  const QR_LIB = "vendor/qrcode.min.js";
  const JSQR_LIB = "vendor/jsQR.min.js";
  const scriptLoads = new Map();
  const loadScript = src => {
    if ((src === QR_LIB && window.qrcode) || (src === JSQR_LIB && window.jsQR)) return Promise.resolve();   // built into the one-file game
    if (scriptLoads.has(src)) return scriptLoads.get(src);
    const promise = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.onload = res;
      s.onerror = () => { s.remove(); scriptLoads.delete(src); rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    scriptLoads.set(src, promise);
    return promise;
  };

  // ---- the handshake, packed small: ICE user and password, the DTLS fingerprint and the local candidates
  // (an offer also carries the lobby code). Everything is checked piece by piece and the SDP is rebuilt from it.
  function packSdp(sdp, code) {
    const get = re => (sdp.match(re) || [])[1] || "";
    const fp = get(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/).split(":").map(h => String.fromCharCode(parseInt(h, 16))).join("");
    const cands = [...sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/gi)].map(m => m[1] + "," + m[2]);
    return [LAN_TAG, code || "", get(/a=ice-ufrag:(\S+)/), get(/a=ice-pwd:(\S+)/), btoa(fp), get(/a=setup:(\S+)/) === "actpass" ? "o" : "a", ...new Set(cands)].join("|");
  }
  function unpackSdp(text) {
    const [tag, code, ufrag, pwd, fpB, role, ...cands] = String(text).trim().split("|");
    const ok = tag === LAN_TAG && /^([a-z0-9]{4,16})?$/.test(code) && /^[A-Za-z0-9+/]{4,32}$/.test(ufrag) && /^[A-Za-z0-9+/]{22,64}$/.test(pwd)
      && /^[A-Za-z0-9+/]{43}=$/.test(fpB) && (role === "o" || role === "a") && cands.length && cands.length <= 12
      && cands.every(c => /^([0-9a-f.:]{3,45}|[0-9a-f-]{36}\.local),\d{1,5}$/i.test(c));
    if (!ok) throw new Error("not a Bin Rocket code");
    const fp = [...atob(fpB)].map(ch => ch.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()).join(":");
    const lines = ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0", "a=msid-semantic: WMS",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0", "a=ice-ufrag:" + ufrag, "a=ice-pwd:" + pwd,
      "a=fingerprint:sha-256 " + fp, "a=setup:" + (role === "o" ? "actpass" : "active"), "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144"];
    cands.forEach((c, i) => { const [ip, port] = c.split(","); lines.push(`a=candidate:${i + 1} 1 udp ${2122260223 - i} ${ip} ${port} typ host generation 0`); });
    lines.push("a=end-of-candidates");
    return { sdp: lines.join("\r\n") + "\r\n", code, offer: role === "o" };
  }
  // no trickling: wait until the local candidates are in (they come at once on a LAN), then show the code
  const gathered = pc => new Promise(r => {
    if (pc.iceGatheringState === "complete") { r(); return; }
    const t = setTimeout(r, 3000);
    pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); r(); } });
  });

  // ---- the data channel: states (unordered, retried for 0.4 s at most: a state is several packets, and a
  // late one is replaced by the next anyway), pings
  function lanSendTo(peer, data) { if (peer.ch && peer.ch.readyState === "open") try { peer.ch.send(data); } catch {} }
  function lanSend(p) { const data = JSON.stringify({ i: lan.myId, p }); for (const peer of lan.peers) lanSendTo(peer, data); }
  function lanReceive(peer, data) {
    if (typeof data !== "string" || data.length > 65536) return;
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== "object") return;
    if (m.t === "ping") { lanSendTo(peer, JSON.stringify({ t: "pong", v: m.v })); return; }
    if (m.t === "pong") { if (Number.isFinite(m.v)) gotPing(performance.now() - m.v); return; }
    if (typeof m.i !== "string" || !/^p[a-z0-9]{1,12}$/.test(m.i) || m.i === lan.myId || !m.p) return;
    if (lan.host) {   // a guest speaks only for itself; the host passes it on to everyone else
      if (!peer.id) peer.id = m.i; else if (peer.id !== m.i) return;
      for (const o of lan.peers) if (o !== peer) lanSendTo(o, data);
    }
    receiveState(m.i, m.p);
  }
  function lanWire(peer, onOpen) {
    const ch = peer.ch;
    ch.onmessage = e => lanReceive(peer, e.data);
    ch.onopen = () => { if (!lan.peers.includes(peer)) lan.peers.push(peer); lanRefresh(); onOpen && onOpen(); };
    const gone = () => {
      const i = lan.peers.indexOf(peer); if (i < 0) return;
      lan.peers.splice(i, 1);
      if (peer.id) removeRemote(peer.id);
      if (!lan.host) announce("HOST LOST", "the local room has closed", "#ff8a8a", 3);
      lanRefresh();
    };
    ch.onclose = gone;
    peer.pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(peer.pc.connectionState)) gone(); };
  }
  // host: a new invitation (one per guest)
  async function lanInvite() {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const peer = { pc, ch: pc.createDataChannel("brs", { ordered: false, maxPacketLifeTime: 400 }), id: null };
    lanWire(peer, () => lanDialogStep("joined"));
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    return { text: packSdp(pc.localDescription.sdp, lan.code), accept: t => { const d = unpackSdp(t); if (d.offer) throw new Error("that is a host's code"); return pc.setRemoteDescription({ type: "answer", sdp: d.sdp }); } };
  }
  // guest: answer the host's invitation
  async function lanAnswer(text) {
    const d = unpackSdp(text);
    if (!d.offer || !d.code) throw new Error("scan the code on the host's screen");
    const pc = new RTCPeerConnection({ iceServers: [] });
    const peer = { pc, ch: null, id: null };
    pc.ondatachannel = e => { peer.ch = e.channel; lanWire(peer, () => lanDialogStep("connected")); };
    await pc.setRemoteDescription({ type: "offer", sdp: d.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    return { code: d.code, text: packSdp(pc.localDescription.sdp) };
  }
  function lanRefresh() {
    if (!localRun || !playing && !lan.guest) return;
    const n = remotes.size + 1;
    if (lan.host) setStatus(lan.peers.length > 0, "Local room · you host · " + n + (n === 1 ? " pilot" : " pilots"));
    else setStatus(lan.peers.length > 0, lan.peers.length ? "Local room · " + n + " pilots" : "Local room · not connected");
  }
  // the lobby is set up (initNet): states go to the room from now on
  function lanStart(code) {
    lan.code = code; lan.host = !lan.guest;
    net.send = lanSend;
    net.hz = 20;   // straight to the devices in the room, no broker's message budget: 20 states a second instead of 8
    document.getElementById("boardTitle").textContent = "Local room · " + MODES[MODE].label + " · " + MAPS[mapThemeOf(code)].label;
    if (lan.host) { const b = document.getElementById("lanAdd"); b.hidden = false; b.onclick = () => lanDialog("host"); }
    setInterval(() => { lanRefresh(); if (!lan.host) for (const p of lan.peers) lanSendTo(p, JSON.stringify({ t: "ping", v: performance.now() })); }, 2000);
    lanRefresh();
    if (lan.host) lanDialog("host");   // straight away: invite the first player
  }

  // ---- QR codes: drawn with qrcode-generator, read with the camera (BarcodeDetector where there is one, else jsQR)
  async function drawQr(canvas, text) {
    const g2 = canvas.getContext("2d");
    try { await loadScript(QR_LIB); } catch { g2.clearRect(0, 0, canvas.width, canvas.height); return false; }
    const qr = qrcode(0, "L"); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), q = 2, s = Math.floor(canvas.width / (n + q * 2)), o = (canvas.width - s * n) / 2;
    g2.fillStyle = "#fff"; g2.fillRect(0, 0, canvas.width, canvas.height); g2.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g2.fillRect(o + c * s, o + r * s, s, s);
    return true;
  }
  let camStream = null;
  function stopCam() { if (camStream) for (const t of camStream.getTracks()) t.stop(); camStream = null; }
  async function scanQr(video) {
    stopCam();
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = camStream; await video.play();
    const det = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
    if (!det) await loadScript(JSQR_LIB);
    const c = document.createElement("canvas"), cg = c.getContext("2d", { willReadFrequently: true });
    return new Promise((res, rej) => {
      const tick = async () => {
        if (!camStream) { rej(new Error("stopped")); return; }
        let text = "";
        try {
          if (det) { const r = await det.detect(video); text = r[0] ? r[0].rawValue : ""; }
          else if (video.videoWidth) {
            c.width = video.videoWidth; c.height = video.videoHeight; cg.drawImage(video, 0, 0);
            const r = jsQR(cg.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" }); text = r ? r.data : "";
          }
        } catch {}
        if (text.startsWith(LAN_TAG + "|")) { stopCam(); res(text); } else setTimeout(tick, 120);
      };
      tick();
    });
  }

  // ---- the dialog: the host invites players one by one; a guest scans the host, then shows its own code back
  const lanEl = document.getElementById("lanDlg"), lanQr = document.getElementById("lanQr"), lanCam = document.getElementById("lanCam");
  const lanHint = document.getElementById("lanHint"), lanStat = document.getElementById("lanStatus"), lanPaste = document.getElementById("lanPaste");
  const lanCodeEl = document.getElementById("lanCode"), lanScanBtn = document.getElementById("lanScan"), lanNext = document.getElementById("lanNext");
  let lanFlow = null;   // what a scanned or pasted code is for: (text) => Promise
  function showQr(text) {
    lanCam.hidden = true; lanQr.hidden = false; lanCodeEl.textContent = text;
    drawQr(lanQr, text).then(ok => { if (!ok) lanStat.textContent = "No QR here (the page was never opened online): copy the code instead."; });
  }
  async function takeCode(text) {
    if (!lanFlow) return;
    const flow = lanFlow;
    try { lanStat.textContent = "Connecting…"; await flow(text); }
    catch (e) { lanStat.textContent = (e && e.message) || "That code didn't work"; }
  }
  async function startScan() {
    lanQr.hidden = true; lanCam.hidden = false; lanStat.textContent = "Point the camera at the code";
    try { await takeCode(await scanQr(lanCam)); } catch (e) { if (e && e.message !== "stopped") lanStat.textContent = "No camera: paste the code below instead"; }
    lanCam.hidden = true;
  }
  async function lanDialog(role) {
    lanEl.hidden = false; lanPaste.value = ""; lanNext.hidden = true;
    lanStat.textContent = ""; lanCodeEl.textContent = "";
    if (role === "host") {
      lanHint.textContent = "1. The player taps “Join a room nearby” and scans this code. 2. Then you scan the code on their screen.";
      lanScanBtn.textContent = "Scan their code"; lanScanBtn.hidden = false;
      lanStat.textContent = "Preparing…";
      const inv = await lanInvite();
      showQr(inv.text); lanStat.textContent = "Waiting for the player…";
      lanFlow = t => inv.accept(t).then(() => { lanStat.textContent = "Connecting…"; });
    } else {
      lanHint.textContent = "1. Scan the code on the host's screen. 2. Then show the host the code that appears here.";
      lanScanBtn.textContent = "Scan the host's code"; lanScanBtn.hidden = false;
      lanQr.hidden = true;
      lanFlow = async t => {
        const a = await lanAnswer(t);
        lan.guest = true; lan.code = a.code;
        lanScanBtn.hidden = true; lanFlow = null;
        lanHint.textContent = "Now let the host scan this code.";
        showQr(a.text); lanStat.textContent = "Waiting for the host…";
      };
      startScan();
    }
  }
  function lanDialogStep(what) {
    if (what === "joined") {   // host: a guest is in
      lanStat.textContent = "Connected! " + (lan.peers.length + 1) + " in the room."; lanNext.hidden = false; lanScanBtn.hidden = true;
      lanQr.hidden = true; lanCodeEl.textContent = "";
    } else {                   // guest: in the host's room, take off at once
      lanEl.hidden = true; stopCam();
      document.getElementById("startForm").requestSubmit();
    }
  }
  lanScanBtn.addEventListener("click", startScan);
  lanNext.addEventListener("click", () => lanDialog("host"));
  document.getElementById("lanCopy").addEventListener("click", e => { if (lanCodeEl.textContent) copyText(lanCodeEl.textContent, e.currentTarget, "Copy my code", "Copied"); });
  lanPaste.addEventListener("input", () => { const t = lanPaste.value.trim(); if (t.startsWith(LAN_TAG + "|") && t.split("|").length >= 7) takeCode(t); });
  document.getElementById("lanClose").addEventListener("click", () => { lanEl.hidden = true; stopCam(); lanFlow = null; cv.focus(); });
  document.getElementById("lanJoin").addEventListener("click", () => lanDialog("guest"));
