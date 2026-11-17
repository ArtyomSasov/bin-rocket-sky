// Builds the game into one self-contained page.
//
//   node tools/build.mjs                 -> index.html (what GitHub Pages serves)
//   node tools/build.mjs --body out.html -> the same page without <!doctype>/<html>/<head> wrappers
//                                           (the form a claude.ai artifact is published from)
//   node tools/build.mjs --debug out.html -> a full page with test hooks on window.__t (for tools/smoke.js)
//
// The game ships as a single HTML file so it can be hosted anywhere (and published as an artifact) with
// only sfx/ and bot.png next to it. The source lives in src/:
//   src/index.html  markup, with <!-- @styles --> and <!-- @script --> where the parts go
//   src/styles.css  all the styling
//   src/js/*.js     the game code, in file-name order. The files are sections of ONE scope: they are joined
//                   inside a single (() => { ... })() so they share variables, exactly like one long script.
//                   Keep the numeric prefixes: order matters (a section may use constants from an earlier one
//                   while it runs, e.g. the world is built at load time).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");

const jsDir = join(root, "src", "js");
const parts = readdirSync(jsDir).filter(f => f.endsWith(".js")).sort();
const script = "<script>\n(() => {\n" + parts.map(f => readFileSync(join(jsDir, f), "utf8")).join("") + "})();\n</script>\n";
const template = read("src/index.html");
for (const mark of ["<!-- @styles -->", "<!-- @script -->"]) {
  if (template.split(mark).length !== 2) throw new Error(`src/index.html must contain ${mark} exactly once`);
}
const body = template
  .replace("<!-- @styles -->", () => "<style>\n" + read("src/styles.css") + "</style>")
  .replace("<!-- @script -->\n", () => script);

const args = process.argv.slice(2);
// test hooks: read-only views of the game's state for tools/smoke.js (never in the published page)
const HOOK = '  window.__t = { me, get myShotLog() { return myShotLog; }, deathFx: (...a) => deathFx(...a), hurt: (...a) => hurt(...a), get bodies() { return bodies; }, get bots() { return bots; }, ' +
  'get shots() { return shots; }, get mode() { return MODE; }, get bases() { return bases; }, get flagCarrier() { return flagCarrier; } };\n';
if (args[0] === "--debug") {
  if (!args[1]) throw new Error("usage: node tools/build.mjs --debug <out.html>");
  const mark = '  buildPlanets("lobby");\n';
  if (body.split(mark).length !== 2) throw new Error("debug hook anchor not found");
  writeFileSync(args[1], "<!doctype html>\n<html><head><meta charset=utf-8></head><body>\n" + body.replace(mark, mark + HOOK) + "</body></html>\n");
  console.log(`wrote ${args[1]} (debug hooks)`);
} else if (args[0] === "--body") {
  if (!args[1]) throw new Error("usage: node tools/build.mjs --body <out.html>");
  writeFileSync(args[1], body);
  console.log(`wrote ${args[1]} (${parts.length} script sections)`);
} else {
  // the service worker: every file the game needs, and a version that changes with the build
  const { createHash } = await import("node:crypto");
  // the sound pack: every sound file under sfx/pack, listed for the game (sfx/pack/index.json)
  const walk = d => readdirSync(join(root, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + "/" + e.name) : /\.(wav|mp3|ogg)$/i.test(e.name) ? [d + "/" + e.name] : []);
  const packFiles = walk("sfx/pack").map(f => f.slice("sfx/pack/".length)).sort();
  writeFileSync(join(root, "sfx/pack/index.json"), JSON.stringify(packFiles));
  const assets = ["bot.png", "holy.png", "manifest.webmanifest", "vendor/qrcode.min.js", "vendor/jsQR.min.js", "sfx/pack/index.json", ...packFiles.map(f => "sfx/pack/" + f), ...readdirSync(join(root, "sfx")).filter(f => /\.(wav|mp3)$/.test(f)).sort().map(f => "sfx/" + f)];
  const files = ["./", "index.html", "bin-rocket-sky.html", ...assets];
  const page = "<!doctype html>\n" +
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n' +
    body.replace("<script>\n(() => {", () => "<script>window.BRS_PACK_FILES = " + JSON.stringify(packFiles) + ";</script>\n<script>\n(() => {") + "</body></html>\n";
  writeFileSync(join(root, "index.html"), page);
  // the one-file game: the same page with its sounds, sprite and QR libraries inside, to download and pass on
  // (Nearby Share, AirDrop, Bluetooth): it opens from the file with no internet, offline or in a local room
  const dataUrl = (f, type) => `data:${type};base64,` + readFileSync(join(root, f)).toString("base64");
  const sfx = Object.fromEntries(readdirSync(join(root, "sfx")).filter(f => /\.(wav|mp3)$/.test(f)).map(f => [f.replace(/\.\w+$/, ""), dataUrl("sfx/" + f, f.endsWith(".mp3") ? "audio/mpeg" : "audio/wav")]));
  const pack = Object.fromEntries(packFiles.map(f => [f, dataUrl("sfx/pack/" + f, f.endsWith(".mp3") ? "audio/mpeg" : f.endsWith(".ogg") ? "audio/ogg" : "audio/wav")]));
  const inline = "<script>window.BRS_FILE = true; window.BRS_SPRITE = " + JSON.stringify(dataUrl("bot.png", "image/png")) + "; window.BRS_HOLY = " + JSON.stringify(dataUrl("holy.png", "image/png")) + "; window.BRS_SFX = " + JSON.stringify(sfx) + "; window.BRS_PACK = " + JSON.stringify(pack) + ";</script>\n"
    + ["vendor/qrcode.min.js", "vendor/jsQR.min.js"].map(f => "<script>\n" + read(f).replace(/<\/script/gi, "<\\/script") + "\n</script>\n").join("");
  if (page.split("<script>\n(() => {").length !== 2) throw new Error("one-file anchor not found");
  writeFileSync(join(root, "bin-rocket-sky.html"), page.replace("<script>\n(() => {", () => inline + "<script>\n(() => {"));
  // Asset-only and worker-only changes must also replace the offline cache.
  const hash = createHash("sha256").update(read("src/sw.js")).update(files.join());
  for (const file of files.filter(f => f !== "./")) hash.update(readFileSync(join(root, file)));
  const version = hash.digest("hex").slice(0, 12);
  writeFileSync(join(root, "sw.js"), read("src/sw.js").replace("__VERSION__", version).replace("__FILES__", JSON.stringify(files)));
  console.log(`wrote index.html (${parts.length} script sections) and bin-rocket-sky.html`);
}
