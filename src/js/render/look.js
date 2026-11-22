  // weapon icons (24x24 SVG path data, even-odd fill): used on crates (canvas) and in the HUD (SVG)
  const ICONS = {
    fire: "M2 6h19v6h-9v3H9l-2 6H2l3-9H2ZM13 12v2h-2v-2Z",
    laser: "M2 10h9v6H2ZM5 16h3v4H5ZM11 9h6v2.5h-6ZM11 13.5h6v2.5h-6ZM18 9.5l4 3-4 3 1-3Z",
    rocket: "M2 9h15v6H2ZM6 15h3v4H6ZM8 7h4v2H8ZM17 9.5h2l3 2.5-3 2.5h-2Z",
    scatter: "M8 7.5h14V10H8ZM8 11h14v2.5H8ZM2 9l6-1.5V15l-6 1.5ZM11 14h6v3h-6Z",
    rail: "M2 10h7v5H2ZM4 15h3v4H4ZM9 11.25h13v1.5H9ZM11 9h2v2.25h-2ZM11 12.75h2V15h-2ZM15 9h2v2.25h-2ZM15 12.75h2V15h-2ZM19 9h2v2.25h-2ZM19 12.75h2V15h-2Z",
    mine: "M12 6a6 6 0 1 0 0.01 0ZM12 10a2 2 0 1 0 0.01 0ZM11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM4.2 5.6l1.4-1.4 2.4 2.4-1.4 1.4zM16 17.4l1.4-1.4 2.4 2.4-1.4 1.4zM18.4 4.2l1.4 1.4-2.4 2.4-1.4-1.4zM4.2 18.4l2.4-2.4 1.4 1.4-2.4 2.4z",
    cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
    orb: "M2 10h8v6H2ZM5 16h3v4H5ZM10 11.5h8v3h-8ZM18 10.5h4v5h-4ZM14 4.5a3 3 0 1 0 0.01 0Z",
    shard: "M2 9h11v7H2ZM5 16h3v4H5ZM13 8h4v9h-4ZM17 9l5-2v3l-5 1ZM17 12h5v1.5h-5ZM17 14.5l5 1v3l-5-2Z",
    amp: "M12 0l2 3.3a8.8 8.8 0 0 1 6.7 6.7L24 12l-3.3 2a8.8 8.8 0 0 1-6.7 6.7L12 24l-2-3.3A8.8 8.8 0 0 1 3.3 14L0 12l3.3-2A8.8 8.8 0 0 1 10 3.3ZM13.4 7.5h-1.9L8 13v1.7h4.1V17h1.8v-2.3h1.4v-1.6h-1.4ZM12.1 10v3.1H10Z",   // Quad damage: a spiked sphere with a 4
    shield: "M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z",
    nuke: "M14.10 8.36L17.25 2.91A10.5 10.5 0 0 0 6.75 2.91L9.90 8.36A4.2 4.2 0 0 1 14.10 8.36ZM7.80 12.00L1.50 12.00A10.5 10.5 0 0 0 6.75 21.09L9.90 15.64A4.2 4.2 0 0 1 7.80 12.00ZM14.10 15.64L17.25 21.09A10.5 10.5 0 0 0 22.50 12.00L16.20 12.00A4.2 4.2 0 0 1 14.10 15.64ZM12 9.8a2.2 2.2 0 1 0 0.01 0Z",
    holy: "M12 10a6.5 6.5 0 1 0 0.01 0ZM12 1C6.5 1 3.5 2.4 3.5 4.2S6.5 7.4 12 7.4s8.5-1.4 8.5-3.2S17.5 1 12 1Zm0 1.7c4 0 6.4.8 6.4 1.5S16 5.7 12 5.7 5.6 4.9 5.6 4.2 8 2.7 12 2.7Z",
    void: "M12 2a10 10 0 1 0 .01 0ZM12 6a6 6 0 1 1-.01 0ZM12 9a3 3 0 1 0 .01 0Z",
    saw: "M20.5 1.5l2 2-11 12.5-3.5.5.5-3.5ZM7.5 14l2.5 2.5-1.5 1.5 3 3-1.5 1.5-3-3-2 2-1.5-1.5 2-2-3-3L4 13.5l3 3Z",   // the Blood Blade (the saw's old slot)
    gamma: "M12 2a10 10 0 1 0 .01 0ZM12 5l-3 5 3 2-4 6 8-6-3-2 3-5Z",
    minigun: "M2 9h7v7H2ZM4 16h3v4H4ZM9 10h1v5H9ZM10 8.5h12v2H10ZM10 11.5h12v2H10ZM10 14.5h12v2H10Z",
    gren: "M2 10h7v6H2ZM4 16h3v4H4ZM13.5 7.5a4.5 4.5 0 1 0 0.01 0ZM18 10.5h4v3h-4Z"
  };
  const ICON_PATHS = Object.fromEntries(Object.entries(ICONS).map(([k, d]) => [k, new Path2D(d)]));
  const FIRE_KEYS = ["Space", "KeyF", "KeyJ", "Enter"];
  // customization: index 0 of every list is the original look
  const CUSTOM = {
    // a colour is a hue, or [hue, saturation x, lightness x] for the darker and greyer ones (new items go at the end:
    // the index is what goes over the network)
    body:  { label: "Body",  items: [["Teal", null], ["Pink", 330], ["Orange", 22], ["Lime", 95], ["Sky", 205], ["Gold", 46], ["Violet", 268],
                                     ["Recycling green", [135, 1.1, 0.85]], ["Hi-vis", [72, 1.6, 1.2]], ["Charcoal", [225, 0.12, 0.5]], ["Steel", [210, 0.22, 1]]] },
    // the bin lid colours of household collections: recycling, garden, food, general waste, glass
    lid:   { label: "Lid",   items: [["Lavender", null], ["Navy", 222], ["Red", 2], ["Mint", 155], ["Rose", 318], ["Amber", 38],
                                     ["Recycling blue", [212, 1.3, 0.85]], ["Garden green", [120, 1.1, 0.75]], ["Food brown", [28, 0.75, 0.6]], ["General black", [230, 0.1, 0.4]], ["Glass purple", [275, 1, 0.8]]] },
    flame: { label: "Fire",  items: [["By level", null], ["Blue", "blue"], ["Green", "green"], ["Pink", "pink"], ["Rainbow", "rainbow"], ["Toxic", "toxic"]] },
    trail: { label: "Trail", items: [["Sparkle", null], ["Fire", "fire"], ["Ice", "ice"], ["Gold", "gold"], ["Rainbow", "rainbow"], ["Litter", "litter"], ["Eco", "eco"]] },
    hat:   { label: "Hat",   items: [["None", null], ["Party", "party"], ["Top hat", "tophat"], ["Halo", "halo"], ["Bow", "bow"], ["Cap", "cap"],
                                     ["Hard hat", "hardhat"], ["Traffic cone", "cone"], ["Hi-vis beanie", "hivis"], ["Recycling", "recycle"]] }
  };
  const CUSTOM_KEYS = ["body", "lid", "flame", "trail", "hat"];
  const FLAMES = {
    blue:  { outer: [60, 120, 255], mid: [80, 200, 255],  core: [225, 250, 255] },
    green: { outer: [40, 200, 90],  mid: [140, 255, 120], core: [235, 255, 215] },
    pink:  { outer: [255, 60, 160], mid: [255, 140, 210], core: [255, 236, 250] },
    toxic: { outer: [120, 255, 30], mid: [210, 255, 80], core: [245, 255, 210] }
  };
  const TRAILS = {
    fire: ["#fff3b0", "#ffd23f", "#ff9a2e", "#ff5a1f"],
    ice: ["#bff9ff", "#7df9ff", "#ffffff", "#9fd8ff"],
    gold: ["#ffd36b", "#fff1b8", "#ffb43c", "#ffffff"],
    rainbow: ["#ff6b6b", "#ffb43c", "#ffe66b", "#6bff95", "#6bd5ff", "#8c7bff", "#ff7bea"],
    litter: ["#e8e0d0", "#5a8ac8", "#c85a4a", "#6ab06a", "#d8c050"],   // scraps of paper, cans and wrappers
    eco: ["#6bff95", "#3ad06a", "#c8ffb0", "#9ff3c0"]
  };
  const cleanCustom = v => CUSTOM_KEYS.map((k, i) => {
    const n = Array.isArray(v) ? Math.floor(Number(v[i])) : 0;
    return n >= 0 && n < CUSTOM[k].items.length ? n : 0;
  });
  // team modes paint every bin's body and lid in its team's colour (the rest of the look stays the pilot's own)
  const TEAM_SKIN = [{ body: 352, lid: 8 }, { body: 212, lid: 226 }];   // hues: Red, Blue
  const customVal = (ck, key) => ck.team !== undefined && TEAM_SKIN[ck.team][key] !== undefined ? TEAM_SKIN[ck.team][key]
    : CUSTOM[key].items[ck[CUSTOM_KEYS.indexOf(key)]][1];

  const img = new Image(); img.src = window.BRS_SPRITE || "bot.png";   // the one-file game carries the sprite inside
  const holyImg = new Image(); holyImg.src = window.BRS_HOLY || "holy.png";   // the holy bomb's skin
  // the bin's hull, detailed: drawn once onto the art in the hull's own colours (darker and lighter teal), so the
  // look's recolouring still finds and tints it. In the art's pixels (320 x 320, the bin seen three-quarter on)
  function detailBin(q) {
    const face = (ox, oy, ux, uy, vx, vy) => q.setTransform(ux, uy, vx, vy, ox, oy);   // a face of the hull: (0,0)-(1,1) across it
    const dark = a => `rgba(8,72,74,${a})`, lite = a => `rgba(190,255,246,${a})`;
    q.save();
    // the front: corner ribs pressed in down both edges, a band under the lid with two hinge knuckles, bolts
    face(80, 77, 138, 19, -15, 73);
    q.lineCap = "round";
    for (const u of [0.07, 0.13, 0.87, 0.93]) {
      q.lineWidth = 0.022; q.strokeStyle = dark(0.45); q.beginPath(); q.moveTo(u, 0.16); q.lineTo(u, 0.9); q.stroke();
      q.lineWidth = 0.012; q.strokeStyle = lite(0.35); q.beginPath(); q.moveTo(u + 0.016, 0.17); q.lineTo(u + 0.016, 0.9); q.stroke();
    }
    q.fillStyle = dark(0.38); q.fillRect(0.02, 0.0, 0.96, 0.075);
    q.fillStyle = lite(0.3); q.fillRect(0.02, 0.075, 0.96, 0.018);
    for (const u of [0.22, 0.72]) {
      q.fillStyle = dark(0.55); q.beginPath(); q.roundRect(u, -0.01, 0.07, 0.1, 0.02); q.fill();
      q.fillStyle = lite(0.45); q.beginPath(); q.roundRect(u + 0.008, 0.0, 0.054, 0.025, 0.01); q.fill();
    }
    for (const [u, v] of [[0.035, 0.14], [0.965, 0.14], [0.035, 0.93], [0.965, 0.93]]) {
      q.fillStyle = dark(0.6); q.beginPath(); q.arc(u, v, 0.022, 0, 6.283); q.fill();
      q.fillStyle = lite(0.6); q.beginPath(); q.arc(u - 0.006, v - 0.008, 0.009, 0, 6.283); q.fill();
    }
    // the right side: three vent slits
    face(220, 92, 26, -6, -3, 66);
    for (const v of [0.3, 0.45, 0.6]) {
      q.fillStyle = dark(0.6); q.beginPath(); q.roundRect(0.18, v, 0.64, 0.07, 0.03); q.fill();
      q.fillStyle = lite(0.35); q.fillRect(0.2, v + 0.07, 0.6, 0.02);
    }
    // the rim round the nozzle, front: a plate with the recycling arrows embossed
    face(64, 150, 152, 16, -1, 22);
    q.fillStyle = dark(0.3); q.beginPath(); q.roundRect(0.38, 0.12, 0.24, 0.76, 0.07); q.fill();
    q.translate(0.5, 0.5); q.scale(1, 152 / 22 * 0.13); q.lineWidth = 0.026; q.strokeStyle = lite(0.8);
    for (let k = 0; k < 3; k++) {   // three chasing arrows
      const a0 = k * 2.094 - 1.4, a1 = a0 + 1.5, r = 0.075;
      q.beginPath(); q.arc(0, 0, r, a0, a1); q.stroke();
      const ex = Math.cos(a1) * r, ey = Math.sin(a1) * r, tx = -Math.sin(a1), ty = Math.cos(a1);
      q.fillStyle = lite(0.75); q.beginPath(); q.moveTo(ex + tx * 0.025, ey + ty * 0.025); q.lineTo(ex - ty * 0.02, ey + tx * 0.02); q.lineTo(ex + ty * 0.02, ey - tx * 0.02); q.fill();
    }
    q.restore();
  }
  // the art with its painted flame removed: our animated fire is drawn behind it from the nozzle
  let body = null;
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx2 = c.getContext("2d", { willReadFrequently: true }); cx2.drawImage(img, 0, 0);
    const d = cx2.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2];
      if (r > 150 && r - b > 70 && r >= gg) px[i + 3] = 0;
    }
    cx2.putImageData(d, 0, 0);
    const k = document.createElement("canvas"); k.width = c.width; k.height = c.height;   // the hull's detail, laid only where the hull is
    try { detailBin(k.getContext("2d")); cx2.globalCompositeOperation = "source-atop"; cx2.drawImage(k, 0, 0); cx2.globalCompositeOperation = "source-over"; } catch {}   // (an old browser: the plain art)
    body = c;
  };
