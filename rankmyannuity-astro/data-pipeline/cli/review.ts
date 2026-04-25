// CLI: review-data — prints the REVIEW.md path for the most recent run.
// Intentionally minimal — it just finds the newest run directory and
// reports the review file. Editors can `cat` or open it themselves.
//
// Invoked as: `npm run review-data`

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const pipelineRoot = resolve(process.cwd(), "data-pipeline");
const reportsDir = resolve(pipelineRoot, "reports");

if (!existsSync(reportsDir)) {
  console.error("No reports/ directory yet. Run `npm run refresh-data` first.");
  process.exit(1);
}

const runs = readdirSync(reportsDir).sort().reverse();
if (runs.length === 0) {
  console.error("No runs in reports/. Run `npm run refresh-data` first.");
  process.exit(1);
}

const latest = resolve(reportsDir, runs[0]);
const reviewPath = resolve(latest, "REVIEW.md");

if (!existsSync(reviewPath)) {
  console.error(`REVIEW.md missing in ${latest}`);
  process.exit(1);
}

console.log(`[review-data] latest run: ${runs[0]}`);
console.log(`[review-data] review:     ${reviewPath}`);
console.log();
console.log(readFileSync(reviewPath, "utf8"));
