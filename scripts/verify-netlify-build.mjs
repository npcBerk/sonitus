import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(".netlify/functions/manifest.json", "utf8"));
const byName = new Map(manifest.functions.map((fn) => [fn.name, fn]));
const background = byName.get("market-snapshot-background");
const schedule = byName.get("market-snapshot-schedule");
const nextHandler = byName.get("___netlify-server-handler");

assert.equal(background?.invocationMode, "background", "Netlify market scan must be bundled as a Background Function");
assert.equal(background?.routes?.[0]?.literal, "/internal/netlify/market-snapshot-background", "Background scan route is missing");
assert.equal(schedule?.schedule, "*/10 * * * *", "Ten-minute Netlify schedule is missing");
assert.ok(nextHandler, "Netlify OpenNext server handler is missing");

console.log("Netlify function manifest verified.");
