import { mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const src = "src/presets";
const dst = "dist/presets";

function walk(s, d) {
  mkdirSync(d, { recursive: true });
  for (const entry of readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, entry.name);
    const dp = path.join(d, entry.name);
    if (entry.isDirectory()) walk(sp, dp);
    else if (entry.name.endsWith(".json")) copyFileSync(sp, dp);
  }
}
// Same for the new preset categories — handled by recursive walk above (custom-fields/, dashboard-pages/, etc.)

if (existsSync(src)) {
  walk(src, dst);
  console.log("copied presets to dist/presets");
} else {
  console.log("no src/presets dir; skipping");
}
