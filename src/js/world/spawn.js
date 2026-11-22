  function spawnPoint(tm) {
    if (stationMap()) {
      const cells = [];
      for (let y = 2; y < 19; y++) for (let x = 2; x < 19; x++) if (foundryOpen(x, y) && (tm !== 0 && tm !== 1 || (tm === 0 ? x < 7 : x > 13))) cells.push([x, y]);
      return foundryPoint(...cells[Math.floor(Math.random() * cells.length)]);
    }
    const half = bases && (tm === 0 || tm === 1), rx = () => half ? (tm ? W / 2 : 0) + rndIn(W / 2, 300) : rndIn(W, 300);
    let x = rx(), y = rndIn(H, 300);
    for (let k = 0; k < 30 && inBody(x, y, 160); k++) { x = rx(); y = rndIn(H, 300); }
    return { x, y };
  }
