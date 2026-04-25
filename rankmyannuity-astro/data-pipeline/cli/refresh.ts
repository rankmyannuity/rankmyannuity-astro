// CLI: refresh-data — runs every adapter, normalizes, diffs, writes a
// timestamped run directory under data-pipeline/reports/<run_id>/ that
// contains REVIEW.md, manifest.json, a preview of every generated file,
// and (when applicable) conflicts.md / missing.md.
//
// This command never writes to src/. It is safe to run as often as
// wanted — publish-data is the command that promotes a reviewed run.
//
// Invoked as: `npm run refresh-data`

import { resolve } from "node:path";
import { runPipeline } from "./orchestrator.js";

const projectRoot = process.cwd();
const pipelineRoot = resolve(projectRoot, "data-pipeline");

const outcome = await runPipeline({
  projectRoot,
  pipelineRoot,
  runMode: "refresh",
  previewOnly: true,
});

const banner =
  outcome.status === "ready_for_review"
    ? "✓ ready for review"
    : "✗ BLOCKED — fix gates before publish";

console.log();
console.log(`[refresh-data] run ${outcome.runId}`);
console.log(`[refresh-data] status: ${banner}`);
console.log(`[refresh-data] review: ${outcome.reportPaths.review}`);
if (outcome.reportPaths.conflicts) {
  console.log(`[refresh-data] conflicts: ${outcome.reportPaths.conflicts}`);
}
if (outcome.reportPaths.missing) {
  console.log(`[refresh-data] missing: ${outcome.reportPaths.missing}`);
}
console.log(`[refresh-data] run dir: ${outcome.runDir}`);
console.log();

if (outcome.status === "blocked") {
  process.exit(2);
}
