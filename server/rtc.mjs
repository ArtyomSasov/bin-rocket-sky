// A WebRTC data channel beside a player's WebSocket: unordered and never resent, so a lost snapshot does not hold up
// the ones after it, as it does on TCP (the snapshots are deltas from one the player confirmed, so a loss costs
// nothing). The WebSocket stays: it carries the join, the offer and answer, and everything when the channel is not
// open (or stops working). All players share one UDP port (ICE UDP mux).
//   RTC_PORT: the UDP port (unset: no WebRTC); RTC_IP: the public address the players reach it on (the server sits
//   behind Docker's NAT, so the address it sees itself on is replaced by this one in its offer)
let nd = null;
const PORT = +(process.env.RTC_PORT || 0), PUBLIC_IP = process.env.RTC_IP || "";
if (PORT) {
  try { const m = await import("node-datachannel"); nd = m.PeerConnection ? m : m.default; } catch (e) { console.log(new Date().toISOString(), "webrtc unavailable:", e.message); }
  try { nd?.initLogger?.("Error"); } catch {}
}
export const rtcReady = !!nd;
// the library's threads end, so the process can (after every channel is closed)
export function rtcShutdown() { try { nd?.cleanup?.(); } catch {} }

// the offer's own address (host candidates) replaced by the public one
const publicSdp = sdp => !PUBLIC_IP ? sdp : sdp.replace(/^(a=candidate:\S+ \d+ (?:udp|UDP) \d+ )(\S+)( \d+ typ host)/gm, `$1${PUBLIC_IP}$3`);

// offer a channel to one player: offer(sdp) is called once to send it on, onMessage(text) for what comes back.
// Returns { answer(sdp), send(bytes) -> sent?, open(), close() }
export function openRtc(name, offer, onMessage, onClose) {
  if (!nd) return null;
  const pc = new nd.PeerConnection(name, { iceServers: [], enableIceUdpMux: true, portRangeBegin: PORT, portRangeEnd: PORT, maxMessageSize: 262144 });
  let dc = null, sent = false, closed = false, heard = performance.now();
  const close = () => { if (closed) return; closed = true; try { dc?.close(); } catch {} try { pc.close(); } catch {} onClose?.(); };
  pc.onGatheringStateChange(state => {
    if (state !== "complete" || sent) return;
    const d = pc.localDescription(); if (!d) return;
    sent = true; offer(publicSdp(d.sdp));
  });
  pc.onStateChange(state => { if (state === "failed" || state === "closed") close(); });
  dc = pc.createDataChannel("snap", { unordered: true, maxRetransmits: 0 });
  dc.onMessage(m => { heard = performance.now(); if (typeof m === "string" && m.length < 4096) onMessage(m); });
  dc.onOpen(() => { heard = performance.now(); });
  dc.onClosed(close);
  setTimeout(() => { if (!dc.isOpen()) close(); }, 10000);   // never opened (UDP blocked on the way): the WebSocket carries on alone
  return {
    answer(sdp) { if (typeof sdp !== "string" || sdp.length > 16384 || closed) return; try { pc.setRemoteDescription(sdp, "answer"); } catch { close(); } },
    // what goes over it while it works: open, not choked, and the player heard from on it in the last second and a half
    usable: () => !closed && dc.isOpen() && performance.now() - heard < 1500 && dc.bufferedAmount() < 256 * 1024,
    send(bytes) { try { return dc.sendMessageBinary(bytes); } catch { return false; } },
    close
  };
}
