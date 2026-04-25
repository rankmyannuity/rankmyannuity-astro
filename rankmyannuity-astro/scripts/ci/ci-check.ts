#!/usr/bin/env tsx
// [Phase 5] CI aggregator: runs all Phase 5 CI gates in sequence and
// aggregates exit codes. Exits 0 only if every gate passes; exits 1 if
// any gate fails.
//
// Why an aggregator instead of CI platform config? Per user directive
// (Phase 5 kickoff, option A):
//   "If CI does not exist, do NOT make CI platform rollout a Phase 5
//    side-quest. Implement as scripts/ci/*.ts + npm run ci:check."
//
// This keeps the gates runnable locally, in any CI provider, or as a
// pre-commit hook, without coupling Phase 5 to a specific platform.
//
// Each gate is a standalone script with its own exit code. The
// aggregator runs them serially (fast on a small repo) and collects
// their exit codes. Output from each gate is streamed through so the
// user sees per-gate progress and errors in order.
//
// Usage:
//   npm run ci:check        # runs all gates
//   tsx scripts/ci/ci-check.ts  # same, direct
//
// Add new gates by appending to GATES below.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

interface Gate {
  name: string;
  script: string; // path relative to projectRoot
}

const projectRoot = process.cwd();

const GATES: Gate[] = [
  {
    name: "shipping-requires-approval",
    script: "scripts/ci/shipping-requires-approval.ts",
  },
  {
    name: "forbid-frozen-time-default",
    script: "scripts/ci/forbid-frozen-time-default.ts",
  },
  {
    name: "shipping-sha256-match",
    script: "scripts/ci/shipping-sha256-match.ts",
  },
  {
    name: "top-myga-public-requires-nonempty",
    script: "scripts/ci/top-myga-public-requires-nonempty.ts",
  },
  // [Phase 6.0a-step-4] F1-C — shipping-review rendering contract enforced
  // against BUILT OUTPUT (dist/). Unlike the four gates above (source-only
  // linters), this gate reads derived state. It enforces its own precondition
  // (dist/ must exist) and uses exit code 2 for contract violations to
  // distinguish them from linter-level failures (exit 1). The aggregator
  // does NOT invoke `astro build` — CI / local flow is
  // `npm run build && npm run ci:check`.
  //
  // See scripts/ci/shipping-renders-canonical.ts for the full assertion
  // set (S1/S2/S3a for shipping; P1/P2 for pilot; retired excluded).
  {
    name: "shipping-renders-canonical",
    script: "scripts/ci/shipping-renders-canonical.ts",
  },
];

function runGate(gate: Gate): { name: string; code: number } {
  const abs = resolve(projectRoot, gate.script);
  const result = spawnSync("npx", ["tsx", abs], {
    stdio: "inherit",
    cwd: projectRoot,
    env: process.env,
  });
  // spawnSync.status can be null if the process was killed by a signal.
  const code =
    result.status === null ? (result.signal ? 128 : 1) : result.status;
  return { name: gate.name, code };
}

function main(): number {
  console.log(`[ci:check] Running ${GATES.length} CI gate(s)...\n`);

  const results: { name: string; code: number }[] = [];
  for (const gate of GATES) {
    console.log(`──────── ${gate.name} ────────`);
    const r = runGate(gate);
    results.push(r);
    console.log(""); // blank line between gates
  }

  console.log(`──────── summary ────────`);
  const failed = results.filter((r) => r.code !== 0);
  for (const r of results) {
    const status = r.code === 0 ? "PASS" : `FAIL (exit ${r.code})`;
    console.log(`  ${status}  ${r.name}`);
  }

  if (failed.length === 0) {
    console.log(`\n[ci:check] All ${results.length} gate(s) passed.`);
    return 0;
  }

  console.error(
    `\n[ci:check] ${failed.length} of ${results.length} gate(s) failed.`,
  );
  return 1;
}

process.exit(main());
