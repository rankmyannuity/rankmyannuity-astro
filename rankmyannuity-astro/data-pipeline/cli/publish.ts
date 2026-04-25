// CLI: publish-data — promotes a reviewed run into src/. Hard gates:
//
// [Phase 5] Gate logic is split into pure, testable helpers at the bottom
// of this file (`frozenTimeGate`, `wallClockRegressionGate`). The CLI body
// below just wires env vars + filesystem state into those helpers and
// calls `process.exit` on failure. Unit tests import the helpers directly.
//
//
//   1. The most recent run must exist and have status "ready_for_review".
//   2. The run dir must contain APPROVED.txt with three fields:
//        reviewer:  <name>
//        timestamp: <ISO timestamp>
//        sha256:    <sha256 of REVIEW.md at approval time>
//      The sha256 must match the current REVIEW.md. If REVIEW.md changed
//      after APPROVED.txt was written, the approval is stale and rejected.
//   3. After promotion, a snapshot is written under data-pipeline/snapshots/
//      so the next refresh's diff has a reference point.
//
// Invoked as: `npm run publish-data`

import { createHash } from "node:crypto";
import { readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runPipeline, promoteToSrc } from "./orchestrator.js";
import { writeNormalizedSnapshot } from "../validate/diff.js";
import { frozenTimeGate, wallClockRegressionGate } from "./publishGates.js";

const projectRoot = process.cwd();
const pipelineRoot = resolve(projectRoot, "data-pipeline");

// Re-run the pipeline so we publish THE CURRENT state, not whatever state
// was captured when refresh-data last ran. The manifest status from this
// fresh run is the authoritative gate. (If anything changed between
// refresh and publish, the mismatch will surface as a new run directory.)
const fresh = await runPipeline({
  projectRoot,
  pipelineRoot,
  runMode: "refresh",
  previewOnly: true,
});

// Find the approval pointer. Priority:
//   1. PIPELINE_APPROVE_RUN=<run_id> env var (CI-friendly)
//   2. Latest run that has APPROVED.txt
const reportsDir = resolve(pipelineRoot, "reports");
const envTarget = process.env.PIPELINE_APPROVE_RUN;
const candidates = readdirSync(reportsDir).sort().reverse();

let approvedRunId: string | null = null;
if (envTarget && candidates.includes(envTarget)) {
  approvedRunId = envTarget;
} else {
  for (const r of candidates) {
    if (existsSync(resolve(reportsDir, r, "APPROVED.txt"))) {
      approvedRunId = r;
      break;
    }
  }
}

if (!approvedRunId) {
  console.error(
    "[publish-data] FAIL: no approved run found. Write APPROVED.txt in the run directory first.",
  );
  console.error(`[publish-data] Run a refresh, review ${fresh.runId}/REVIEW.md, then approve it.`);
  process.exit(1);
}

const approvedRunDir = resolve(reportsDir, approvedRunId);
const approvalPath = resolve(approvedRunDir, "APPROVED.txt");
const reviewPath = resolve(approvedRunDir, "REVIEW.md");

const approvalText = readFileSync(approvalPath, "utf8");
const approvalFields = parseApproval(approvalText);

if (!approvalFields.reviewer || !approvalFields.timestamp || !approvalFields.sha256) {
  console.error(`[publish-data] FAIL: APPROVED.txt is missing one of { reviewer, timestamp, sha256 }.`);
  console.error(`[publish-data] Expected format:`);
  console.error(`[publish-data]   reviewer:  Name Here`);
  console.error(`[publish-data]   timestamp: 2026-04-21T20:00:00Z`);
  console.error(`[publish-data]   sha256:    <hex>`);
  process.exit(1);
}

if (!existsSync(reviewPath)) {
  console.error(`[publish-data] FAIL: REVIEW.md not found at ${reviewPath}`);
  process.exit(1);
}
const reviewBody = readFileSync(reviewPath);
const currentSha = createHash("sha256").update(reviewBody).digest("hex");

if (currentSha !== approvalFields.sha256.toLowerCase()) {
  console.error(`[publish-data] FAIL: approval is stale.`);
  console.error(`[publish-data]   REVIEW.md sha256:   ${currentSha}`);
  console.error(`[publish-data]   APPROVED.txt sha256: ${approvalFields.sha256}`);
  console.error(`[publish-data] The REVIEW.md has changed since approval. Re-review and re-approve.`);
  process.exit(1);
}

// Gate against the *fresh* run's status. If something broke between approval
// and now, refuse publish.
if (fresh.status !== "ready_for_review") {
  console.error(`[publish-data] FAIL: current pipeline state is BLOCKED. Fix the blocking gates before publishing.`);
  console.error(`[publish-data] See ${fresh.reportPaths.review}`);
  process.exit(1);
}

// [Phase 5] Frozen-time refusal. Publishing with PIPELINE_FROZEN_TIME set
// is a footgun — it would commit a manifest whose run_id is a deterministic
// test timestamp rather than real wall-clock. Refuse by default.
//
// Escape hatch: PIPELINE_ALLOW_FROZEN_PUBLISH=1 is the explicit, audited
// override used by the idempotency test harness. CI blocks PRs that add
// this env var to any persistent workflow (see scripts/ci/forbid-frozen-time-default.ts).
{
  const gate = frozenTimeGate({
    frozenTime: fresh.manifest.frozen_time,
    allowOverride: process.env.PIPELINE_ALLOW_FROZEN_PUBLISH === "1",
  });
  if (gate.action === "refuse") {
    console.error(`[publish-data] FAIL: refusing to publish with PIPELINE_FROZEN_TIME set.`);
    console.error(`[publish-data]   frozen_time: ${fresh.manifest.frozen_time}`);
    console.error(`[publish-data] Frozen-time runs are for tests only. Unset PIPELINE_FROZEN_TIME and re-run,`);
    console.error(`[publish-data] or set PIPELINE_ALLOW_FROZEN_PUBLISH=1 if this is a deliberate test-harness publish.`);
    process.exit(1);
  }
  if (gate.action === "warn") {
    console.warn(`[publish-data] WARNING: publishing with PIPELINE_FROZEN_TIME=${fresh.manifest.frozen_time}`);
    console.warn(`[publish-data]          (override via PIPELINE_ALLOW_FROZEN_PUBLISH=1)`);
  }
}

// [Phase 5] Wall-clock regression check. Refuse to publish a run whose
// run_id is older than the most recent snapshot's run_id. This catches:
//   - accidental system clock rollback
//   - publishing a stale frozen-time run on top of a real run
//   - timezone/DST bugs that cause ISO sort order to regress
//
// Carve-out: first_published_run === true means there is no baseline to
// regress against, so we skip the check.
{
  const snapshotsDir = resolve(pipelineRoot, "snapshots");
  const priorSnapshots = existsSync(snapshotsDir)
    ? readdirSync(snapshotsDir)
        .filter((f) => f.startsWith("normalized-") && f.endsWith(".json"))
        .sort()
    : [];
  const gate = wallClockRegressionGate({
    firstPublishedRun: fresh.manifest.first_published_run,
    currentRunId: fresh.manifest.run_id,
    priorSnapshotFilenames: priorSnapshots,
  });
  if (gate.action === "refuse") {
    console.error(`[publish-data] FAIL: wall-clock regression.`);
    console.error(`[publish-data]   current run_id: ${fresh.manifest.run_id}`);
    console.error(`[publish-data]   prior snapshot: ${gate.priorRunIdSafe}`);
    console.error(`[publish-data] The new run_id must be strictly after the most recent snapshot.`);
    console.error(`[publish-data] Check system clock or unset PIPELINE_FROZEN_TIME.`);
    process.exit(1);
  }
}

// All gates passed — promote.
const result = promoteToSrc(fresh, {
  projectRoot,
  pipelineRoot,
  runMode: "refresh",
  previewOnly: false,
});

// Write a post-publish snapshot for the next diff.
const snapshotPath = writeNormalizedSnapshot(fresh.normalize, pipelineRoot, fresh.runId);

console.log();
console.log(`[publish-data] ✓ PUBLISHED run ${fresh.runId}`);
console.log(`[publish-data]   approved run:  ${approvedRunId}`);
console.log(`[publish-data]   reviewer:      ${approvalFields.reviewer}`);
console.log(`[publish-data]   approved at:   ${approvalFields.timestamp}`);
console.log(`[publish-data]   review sha:    ${approvalFields.sha256.slice(0, 16)}…`);
console.log(`[publish-data] Promoted files:`);
console.log(`[publish-data]   benchmarks.generated.ts: ${result.benchmarksPath}`);
console.log(`[publish-data]   rates/myga.json:         ${result.paths.ratesFile}`);
console.log(`[publish-data]   benchmarks.json:         ${result.paths.benchmarksFile}`);
for (const f of result.paths.reviewFiles) {
  console.log(`[publish-data]   review sidecar:          ${f}`);
}
console.log(`[publish-data] Snapshot: ${snapshotPath}`);
console.log();

function parseApproval(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of s.split(/\r?\n/)) {
    const m = /^(reviewer|timestamp|sha256)\s*:\s*(\S.*?)\s*$/i.exec(line);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

// Also expose a helper users can call: writes a valid APPROVED.txt for the
// latest run using the current REVIEW.md sha. Safe to invoke from CI or a
// git hook when the reviewer is identified out-of-band.
export function writeApproval(runDir: string, reviewer: string): string {
  const reviewPath = resolve(runDir, "REVIEW.md");
  const bytes = readFileSync(reviewPath);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const path = resolve(runDir, "APPROVED.txt");
  writeFileSync(path, `reviewer: ${reviewer}\ntimestamp: ${new Date().toISOString()}\nsha256: ${sha}\n`);
  return path;
}
