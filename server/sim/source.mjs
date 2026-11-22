// The game's source, as one script: src/js/build-order.json lists its files in the order they run (they are sections
// of one scope). The one place that reads it: the build (tools/build.mjs), the server (headless.mjs) and the tests
// (tools/lib/source.cjs) all join the game through here, so the three can never differ.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "js");
// the files, in the order they run
export const order = () => JSON.parse(readFileSync(join(JS, "build-order.json"), "utf8"));
// one file, by its path under src/js (e.g. "weapons/catalog.js")
export const read = file => readFileSync(join(JS, file), "utf8");
// the whole game joined, as one body of code (each caller wraps it in its own scope)
export const gameSource = () => order().map(read).join("");
