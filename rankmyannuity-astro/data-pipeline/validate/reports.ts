// Report writers — produce REVIEW.md, conflicts.md, and missing.md for
// the reviewer gate. REVIEW.md is always written; conflicts.md and
// missing.md are only written when there is content (empty files would
// create noise in the review).
//
// Per Phase 4 brief:
//   - "Both schema contracts and diff review are required."
//   - "If source data conflicts, flag it and stop for review."
//   - "If required fields are missing, fail the build rather than
//      publishing partial/guessed values."
//
// The CLI checks manifest.status before allowing publish. This module
// just writes human-readable markdown.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizeOutput } from "../normalize/index.js";
import type { DiffResult } from "./diff.js";
import type { Manifest } from "../schemas/manifest.js";

export interface ReportContext {
  runId: string;
  runDir: string;            // absolute dir to write reports into
  normalize: NormalizeOutput;
  diff: DiffResult;
  manifest: Manifest;
}

export function writeReports(ctx: ReportContext): { review: string; conflicts?: string; missing?: string } {
  if (!existsSync(ctx.runDir)) mkdirSync(ctx.runDir, { recursive: true });

  const review = writeReview(ctx);
  const paths: { review: string; conflicts?: string; missing?: string } = { review };

  if (ctx.normalize.conflicts.length > 0) {
    paths.conflicts = writeConflicts(ctx);
  }
  if (ctx.normalize.missing_required.length > 0) {
    paths.missing = writeMissing(ctx);
  }

  return paths;
}

// ─── REVIEW.md ──────────────────────────────────────────────────────────

function writeReview(ctx: ReportContext): string {
  const { normalize: n, diff, manifest } = ctx;
  const lines: string[] = [];
  const p = (s: string) => lines.push(s);

  p(`# Pipeline Review — ${ctx.runId}`);
  p(``);
  p(`**Pipeline version:** \`${manifest.pipeline_version}\`  `);
  p(`**Run mode:** \`${manifest.run_mode}\`  `);
  p(`**Status:** \`${manifest.status}\`  `);
  // [Phase 5] Surface the first-publish carve-out so reviewers know why
  // the wall-clock regression check was skipped (if so).
  p(`**First published run:** \`${manifest.first_published_run ? "yes" : "no"}\``);
  p(``);

  // [Phase 5] Frozen-time warning block. Any run with a frozen clock is
  // deterministic-test output — it should NEVER be promoted without the
  // PIPELINE_ALLOW_FROZEN_PUBLISH override, and reviewers should see this
  // loud and early so a frozen run doesn't get APPROVED.txt by mistake.
  if (manifest.frozen_time !== null) {
    p(`> ⚠️ **FROZEN CLOCK RUN** — \`PIPELINE_FROZEN_TIME=${manifest.frozen_time}\``);
    p(`>`);
    p(`> This run used a deterministic frozen clock instead of wall-clock time. \`publish-data\` will refuse to promote it unless \`PIPELINE_ALLOW_FROZEN_PUBLISH=1\` is also set. Do NOT approve this run for production publish.`);
    p(``);
  }

  // Gate summary
  p(`## Gate summary`);
  p(``);
  p(`| Gate | Count | Blocks publish? |`);
  p(`|------|------:|:---------------:|`);
  p(`| Schema failures | ${n.schema_failures.length} | yes |`);
  p(`| Source conflicts | ${n.conflicts.length} | yes |`);
  p(`| Missing required fields | ${n.missing_required.length} | yes |`);
  p(`| Threshold breaches | ${diff.threshold_breaches.length} | no (review only) |`);
  p(`| Notes | ${n.notes.length} | no |`);
  p(``);
  if (manifest.status === "blocked") {
    p(`> **This run is BLOCKED.** \`publish-data\` will refuse to promote it until every blocking gate is clean. See sections below and the companion files \`conflicts.md\` / \`missing.md\`.`);
    p(``);
  } else {
    p(`> This run is **ready for review**. Inspect the diff and threshold breaches below, then approve by writing \`APPROVED.txt\` into the run directory.`);
    p(``);
  }

  // Counts
  p(`## What was generated`);
  p(``);
  p(`- **Carriers (MDX):** ${manifest.counts.carriers}`);
  p(`- **Products (MDX):** ${manifest.counts.products}`);
  p(`- **MYGA rates:** ${manifest.counts.rates}`);
  p(`- **Benchmarks:** ${manifest.counts.benchmarks}`);
  p(`- **Review sidecars emitted:** ${manifest.counts.reviews}`);
  p(``);

  // Benchmark panel
  p(`## Benchmark panel`);
  p(``);
  p(`| Benchmark | Rate | Status | As of | Source | Adapter |`);
  p(`|-----------|-----:|:------:|:------|--------|---------|`);
  for (const key of ["top_myga_5yr", "treasury_10yr", "cd_5yr_national_avg", "sp500_historical"] as const) {
    const s = n.benchmarkPanel[key];
    // [Phase 5] pilot_empty benchmarks render an em-dash — never "0.00%"
    // — to preserve the UI invariant in PHASE5_SPEC.md §3.
    const rateCell = s.status === "pilot_empty" ? "—" : `${(s.rate * 100).toFixed(2)}%`;
    p(`| ${s.label} | ${rateCell} | \`${s.status}\` | ${s.as_of} | [${s.source}](${s.source_url}) | \`${s.adapter_id}\` |`);
  }
  p(``);

  // [Phase 5] Degraded benchmarks call-out (conditional). Degraded means
  // the adapter fell back to a stale snapshot — not a hard failure, but the
  // reviewer should see the provenance at a glance so a "stale cache used"
  // decision is visible in the approval trail.
  const degradedBenchmarks = (
    ["top_myga_5yr", "treasury_10yr", "cd_5yr_national_avg", "sp500_historical"] as const
  )
    .map((k) => n.benchmarkPanel[k])
    .filter((s) => s.status === "degraded");
  if (degradedBenchmarks.length > 0) {
    p(`### ⚠️ Degraded benchmarks`);
    p(``);
    p(`One or more benchmarks fell back to a stale snapshot instead of a fresh adapter fetch. UI will render these with a "not live" chip.`);
    p(``);
    for (const s of degradedBenchmarks) {
      p(`- **${s.label}** — rate ${(s.rate * 100).toFixed(2)}% as of ${s.as_of} ([source](${s.source_url}), adapter \`${s.adapter_id}\`)`);
    }
    p(``);
  }

  // MYGA rates
  p(`## MYGA rates`);
  p(``);
  if (n.mygaRates.length === 0) {
    p(`_No MYGA rates in the current pilot corpus._`);
  } else {
    p(`| Carrier | Product | Term | Rate | Effective | Source |`);
    p(`|---------|---------|-----:|-----:|:----------|--------|`);
    for (const r of n.mygaRates) {
      const src = r.source_url ? `[${r.source_name}](${r.source_url})` : r.source_name;
      p(`| ${r.carrier_slug} | ${r.product_slug} | ${r.term_years}yr | ${(r.rate * 100).toFixed(2)}% | ${r.effective_date} | ${src} |`);
    }
  }
  p(``);

  // Reviews
  p(`## Review sidecars`);
  p(``);
  p(`| Slug | Kind | Linked rate | Computed grade |`);
  p(`|------|------|:-----------:|:--------------:|`);
  for (const r of n.reviews) {
    const rate = r.linked_rate ? `${(r.linked_rate.rate * 100).toFixed(2)}% (${r.linked_rate.term_years}yr)` : "—";
    const grade = r.computed_grade ? r.computed_grade.letter : "—";
    p(`| \`${r.slug}\` | ${r.kind} | ${rate} | ${grade} |`);
  }
  p(``);

  // Diff
  p(`## Diff vs previous snapshot`);
  p(``);
  if (diff.previous_snapshot) {
    p(`Compared to \`${diff.previous_snapshot.split("/").pop()}\`.`);
  } else {
    p(`No previous snapshot — this is the first run.`);
  }
  p(`- Added: ${diff.added}`);
  p(`- Removed: ${diff.removed}`);
  p(`- Modified: ${diff.modified}`);
  p(``);
  if (diff.threshold_breaches.length > 0) {
    p(`### Threshold breaches`);
    p(``);
    for (const b of diff.threshold_breaches) p(`- ${b}`);
    p(``);
  } else {
    p(`_No threshold breaches._`);
    p(``);
  }
  if (diff.notes.length > 0) {
    for (const n_ of diff.notes) p(`> ${n_}`);
    p(``);
  }

  // Notes
  if (n.notes.length > 0) {
    p(`## Notes`);
    p(``);
    for (const note of n.notes) p(`- ${note}`);
    p(``);
  }

  // Schema failures
  if (n.schema_failures.length > 0) {
    p(`## Schema failures (BLOCKING)`);
    p(``);
    for (const s of n.schema_failures) p(`- ${s}`);
    p(``);
  }

  // Adapter provenance
  p(`## Adapter provenance`);
  p(``);
  p(`| Adapter | Records | HTTP | Cached | SHA-256 | Fetched at |`);
  p(`|---------|--------:|-----:|:------:|:--------|:-----------|`);
  for (const s of manifest.sources) {
    const http = s.http_status === null ? "—" : String(s.http_status);
    p(`| \`${s.adapter_id}\` | ${s.record_count} | ${http} | ${s.cached ? "yes" : "no"} | \`${s.sha256.slice(0, 12)}…\` | ${s.fetched_at} |`);
  }
  p(``);

  // Approval instructions
  p(`## How to approve`);
  p(``);
  p(`Write \`APPROVED.txt\` in this directory with the reviewer's name, timestamp, and the SHA-256 of this REVIEW.md, then run \`npm run publish-data\`. The publish step refuses to run when the manifest is \`blocked\` or when \`APPROVED.txt\` is missing, stale, or does not match the current review.`);
  p(``);

  const path = resolve(ctx.runDir, "REVIEW.md");
  writeFileSync(path, lines.join("\n"));
  return path;
}

function writeConflicts(ctx: ReportContext): string {
  const lines: string[] = [];
  lines.push(`# Source conflicts — ${ctx.runId}`);
  lines.push(``);
  lines.push(`The pipeline detected conflicting values across source adapters. Per Phase 4 brief, these are NOT silently reconciled — the run is blocked until a human resolves them.`);
  lines.push(``);
  for (const c of ctx.normalize.conflicts) lines.push(`- ${c}`);
  lines.push(``);
  const path = resolve(ctx.runDir, "conflicts.md");
  writeFileSync(path, lines.join("\n"));
  return path;
}

function writeMissing(ctx: ReportContext): string {
  const lines: string[] = [];
  lines.push(`# Missing required fields — ${ctx.runId}`);
  lines.push(``);
  lines.push(`The pipeline could not resolve one or more fields that are required for the generated artifacts. Per Phase 4 brief, the build fails rather than publishing partial or guessed values.`);
  lines.push(``);
  for (const m of ctx.normalize.missing_required) lines.push(`- ${m}`);
  lines.push(``);
  const path = resolve(ctx.runDir, "missing.md");
  writeFileSync(path, lines.join("\n"));
  return path;
}
