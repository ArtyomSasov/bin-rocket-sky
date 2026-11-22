  const COARSE = matchMedia("(pointer: coarse)").matches;
  const COMPACT = matchMedia("(pointer: coarse), (max-width: 700px), (max-height: 500px)");   // the compact HUD (same query as in styles.css)
  const MAX_DPR = COARSE ? 1.5 : 2, MAX_PARTS = COARSE ? 1200 : 2500;
  const cv = document.getElementById("c");
  let g = cv.getContext("2d", { alpha: false });   // swapped briefly to draw the start-screen preview
  const DISPLAY_FONT = getComputedStyle(document.documentElement).getPropertyValue('--display');
  let vw = 0, vh = 0, dpr = 1, zoom = 1, baseZoom = 1, viewZoom = 1;   // zoom = baseZoom (screen size) x viewZoom (pulls back on boost)
  let resScale = 1;   // share of the screen's resolution we draw at: a fixed setting, or lowered by the frame loop when slow
  let TS = 1;   // text scale: undoes the camera zoom so labels stay readable
  function resize() {
    dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1) * resScale;
    baseZoom = Math.max(0.62, Math.min(1, Math.min(innerWidth, innerHeight) / 700));   // runs before the helpers exist
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    applyView();
  }
  // the camera's zoom, every frame: how much of the world is on screen
  function applyView() {
    zoom = baseZoom * viewZoom;
    TS = 1 / zoom;
    vw = innerWidth / zoom; vh = innerHeight / zoom;   // world units visible on screen
    g.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  }
  addEventListener("resize", resize); resize();

