// [Phase 5] Pure, testable publish-time gate predicates. Extracted from
// publish.ts so Vitest can import them without triggering the CLI's
// top-level process.exit path. The CLI wires these helpers into the
// runtime filesystem / env state; the tests exercise them with fixtures.

/**
 * Frozen-time publish gate.
 *
 * Publishing with PIPELINE_FROZEN_TIME set is a footgun — it commits a
 * manifest whose run_id is a deterministic test timestamp rather than real
 * wall-clock. Refuse by default. The escape hatch
 * PIPELINE_ALLOW_FROZEN_PUBLISH=1 is reserved for the idempotency test
 * harness; CI blocks PRs that add it to any persistent workflow (see
 * scripts/ci/forbid-frozen-time-default.ts).
 *
 *   - { action: "proceed" }   — no frozen_time set; publish normally
 *   - { action: "refuse" }    — frozen_time set without override
 *   - { action: "warn" }      — frozen_time set with override
 */
export function frozenTimeGate(input: {
  frozenTime: string | null;
  allowOverride: boolean;
}): { action: "proceed" | "refuse" | "warn" } {
  if (input.frozenTime === null) return { action: "proceed" };
  if (!input.allowOverride) return { action: "refuse" };
  return { action: "warn" };
}

/**
 * Wall-clock regression publish gate.
 *
 * Refuse to publish a run whose run_id is older than (or equal to) the
 * most recent snapshot's run_id. This catches accidental system clock
 * rollback, publishing a stale frozen-time run on top of a real run, and
 * timezone/DST bugs that cause ISO sort order to regress.
 *
 * Carve-out: `firstPublishedRun === true` means there is no baseline to
 * regress against, so the gate returns "proceed" unconditionally.
 *
 * Snapshot filenames are `normalized-<safeRunId>.json` where safeRunId
 * replaces ':' and '.' in the ISO timestamp with '-' (filesystem-safe).
 * We normalize the fresh run_id the same way before comparing — this
 * keeps the comparison consistent with filesystem-lexicographic order.
 */
export function wallClockRegressionGate(input: {
  firstPublishedRun: boolean;
  currentRunId: string;
  priorSnapshotFilenames: readonly string[];
}):
  | { action: "proceed" }
  | { action: "refuse"; priorRunIdSafe: string } {
  if (input.firstPublishedRun) return { action: "proceed" };
  const sorted = [...input.priorSnapshotFilenames].sort();
  const mostRecent = sorted[sorted.length - 1];
  if (!mostRecent) return { action: "proceed" };
  const priorRunIdSafe = mostRecent
    .replace(/^normalized-/, "")
    .replace(/\.json$/, "");
  const currentRunIdSafe = input.currentRunId.replace(/[:.]/g, "-");
  if (currentRunIdSafe <= priorRunIdSafe) {
    return { action: "refuse", priorRunIdSafe };
  }
  return { action: "proceed" };
}
