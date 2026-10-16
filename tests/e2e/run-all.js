/* Runs every browser test in this folder, one after the other.
   Run: node tests/e2e/run-all.js   (or: npm run test:e2e) */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const scripts = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith(".js") && f !== "lib.js" && f !== "run-all.js")
  .sort();

const failed = [];
for (const f of scripts) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit" });
  if (r.status !== 0) failed.push(f);
  console.log("");
}
console.log(failed.length ? "FAILED: " + failed.join(", ") : "All " + scripts.length + " browser test files passed.");
process.exit(failed.length ? 1 : 0);
