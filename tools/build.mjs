// Builds the game into one self-contained page.
//
//   node tools/build.mjs                 -> index.html (what GitHub Pages serves)
//   node tools/build.mjs --body out.html -> the same page without <!doctype>/<html>/<head> wrappers
//                                           (the form a claude.ai artifact is published from)
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
if (args[0] === "--body") {
  if (!args[1]) throw new Error("usage: node tools/build.mjs --body <out.html>");
  writeFileSync(args[1], body);
  console.log(`wrote ${args[1]} (${parts.length} script sections)`);
} else {
  const page = "<!doctype html>\n" +
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n' +
    body + "</body></html>\n";
  writeFileSync(join(root, "index.html"), page);
  console.log(`wrote index.html (${parts.length} script sections)`);
}
