// Orchestrator — shared logic for refresh-data / publish-data. Runs every
// adapter, normalizes, diffs, writes the manifest, and writes reports. The
// two CLI commands call this with different run_mode flags and different
// downstream behavior (preview-only vs actual publish).

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadMygaRates, loadCuratedBenchmarks } from "../adapters/curated-yaml.js";
import { loadMdxReviews } from "../adapters/mdx.js";
import { fetchFredSeries, DGS10_CONFIG, DGS1_CONFIG } from "../adapters/fred.js";
import { fetchTreasuryDirect10Yr } from "../adapters/treasury-direct.js";
import { fetchFdicCd5Yr } from "../adapters/fdic-cd.js";
import type { AdapterResult, AdapterProvenance } from "../adapters/types.js";
import { normalize, type NormalizeOutput, type TaggedAdapterSnapshot, type AdapterRuntimeStatus } from "../normalize/index.js";
import { readShippingYaml } from "../helpers/shippingYaml.js";
import { mdxSha256 } from "../helpers/mdxSha256.js";
import { carrierReviewMdxPath } from "../helpers/carrierReviewMdxPath.js";
import { diffVsPrevious, canonicalize } from "../validate/diff.js";
import { writeReports } from "../validate/reports.js";
import { ManifestSchema, PIPELINE_VERSION, type Manifest } from "../schemas/manifest.js";
import { emitCollections } from "../publish/emit-collections.js";
import { emitBenchmarksGenerated } from "../publish/emit-data.js";
import { now } from "../adapters/types.js";

export interface RunConfig {
  projectRoot: string;
  pipelineRoot: string;
  runMode: "refresh" | "ci" | "test";
  // When true, emit under reports/<run_id>/preview/ without touching src/.
  previewOnly: boolean;
}

export interface RunOutcome {
  runId: string;
  runDir: string;
  status: "ready_for_review" | "blocked";
  manifest: Manifest;
  normalize: NormalizeOutput;
  reportPaths: { review: string; conflicts?: string; missing?: string };
}

export async function runPipeline(cfg: RunConfig): Promise<RunOutcome> {
  const runId = now();                                      // ISO timestamp
  const safeRunId = runId.replace(/[:.]/g, "-");
  const runDir = resolve(cfg.pipelineRoot, "reports", safeRunId);
  if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });

  // 1) Run every adapter.
  const mygaRates = loadMygaRates(cfg.pipelineRoot);
  const curatedBenchmarks = loadCuratedBenchmarks(cfg.pipelineRoot);
  const mdx = loadMdxReviews(cfg.projectRoot);

  // [Phase 5] Load shipping approvals (empty-list if file absent). Compute
  // sha256 of every MDX file — the normalize layer compares each shipping
  // approval's pinned hash against this lookup to detect tampering and
  // downgrade to pilot on mismatch.
  const shippingApprovals = readShippingYaml(
    resolve(cfg.pipelineRoot, "sources", "carriers.shipping.yml"),
  );
  const mdxSha256Lookup = new Map<string, string>();
  if (mdx.data) {
    const all = [...mdx.data.carriers, ...mdx.data.products];
    for (const rec of all) {
      try {
        // [Phase 6.0a] Path derivation uses the shared helper so Layer 1
        // (scripts/ci/shipping-sha256-match.ts) and Layer 2 (this lookup,
        // consumed by applyShippingSha256Downgrade) agree on a single
        // convention: src/content/reviews/<slug>.mdx. Prior code did
        // resolve(projectRoot, rec.mdx_path) where mdx_path was an Astro
        // collection id ("reviews/<slug>") — not a filesystem path —
        // causing every readFileSync to throw ENOENT and the lookup to
        // always be empty, silently downgrading every shipping approval.
        const abs = carrierReviewMdxPath(cfg.projectRoot, rec.slug);
        mdxSha256Lookup.set(rec.slug, mdxSha256(abs));
      } catch {
        // Leave unset — normalize will conservatively downgrade any shipping
        // record whose sha can't be computed.
      }
    }
  }

  const [fredDgs10, fredDgs1, treasuryDirect10yr, fdicCd5yr] = await Promise.all([
    fetchFredSeries(DGS10_CONFIG, { pipelineRoot: cfg.pipelineRoot }),
    fetchFredSeries(DGS1_CONFIG, { pipelineRoot: cfg.pipelineRoot }),
    fetchTreasuryDirect10Yr({ pipelineRoot: cfg.pipelineRoot }),
    fetchFdicCd5Yr({ pipelineRoot: cfg.pipelineRoot }),
  ]);

  // Aggregate any adapter-level hard failures; these block the run immediately.
  const adapterFailures: string[] = [];
  const ar: AdapterResult<unknown>[] = [mygaRates, curatedBenchmarks, mdx, fredDgs10, fredDgs1, treasuryDirect10yr, fdicCd5yr];
  for (const r of ar) {
    if (r.status === "failed") adapterFailures.push(...r.errors);
  }

  // If MDX or curated-yaml failed, we can't normalize at all. Emit a
  // minimal manifest and stop. Don't normalize further on garbage input.
  const critical_failed =
    mygaRates.status === "failed" ||
    curatedBenchmarks.status === "failed" ||
    mdx.status === "failed" ||
    fredDgs10.status === "failed" ||
    fdicCd5yr.status === "failed";

  // 2) Normalize (only if adapters we absolutely need succeeded).
  // [Phase 5] Tag each adapter snapshot with its runtime AdapterStatus so
  // normalize can derive the correct BenchmarkStatus (degraded ⇒ degraded;
  // rate=0 ⇒ pilot_empty; else live). AdapterStatus "ok" and "failed" both
  // map to "ok" here — failed is already handled by critical_failed above.
  const toAdapterRuntimeStatus = <T,>(r: AdapterResult<T>): AdapterRuntimeStatus =>
    r.status === "degraded" ? "degraded" : "ok";

  let norm: NormalizeOutput;
  if (!critical_failed && mygaRates.data && curatedBenchmarks.data && mdx.data && fredDgs10.data && fredDgs1.data && treasuryDirect10yr.data && fdicCd5yr.data) {
    const fredDgs10Tagged: TaggedAdapterSnapshot = {
      snapshot: fredDgs10.data,
      adapter_status: toAdapterRuntimeStatus(fredDgs10),
    };
    const fredDgs1Tagged: TaggedAdapterSnapshot = {
      snapshot: fredDgs1.data,
      adapter_status: toAdapterRuntimeStatus(fredDgs1),
    };
    const treasuryDirect10yrTagged: TaggedAdapterSnapshot = {
      snapshot: treasuryDirect10yr.data,
      adapter_status: toAdapterRuntimeStatus(treasuryDirect10yr),
    };
    const fdicCd5yrTagged: TaggedAdapterSnapshot = {
      snapshot: fdicCd5yr.data,
      adapter_status: toAdapterRuntimeStatus(fdicCd5yr),
    };
    norm = normalize({
      mdx: mdx.data,
      mygaRates: mygaRates.data,
      curatedBenchmarks: curatedBenchmarks.data,
      fredDgs10: fredDgs10Tagged,
      fredDgs1: fredDgs1Tagged,
      treasuryDirect10yr: treasuryDirect10yrTagged,
      fdicCd5yr: fdicCd5yrTagged,
      shippingApprovals,
      mdxSha256Lookup,
    });
  } else {
    // Build a stub normalize output so downstream code can still write
    // a REVIEW.md that clearly explains the failure.
    norm = {
      benchmarkPanel: undefined as never,
      legacyBenchmarkRates: [],
      mygaRates: [],
      reviews: [],
      notes: [],
      conflicts: [],
      missing_required: [],
      schema_failures: [
        `Pipeline halted before normalization: one or more critical adapters failed. See adapter errors: ${adapterFailures.join(" | ")}`,
      ],
    };
  }

  // 3) Diff vs previous snapshot (only if we have a valid norm output).
  const diff = !critical_failed && norm.benchmarkPanel
    ? diffVsPrevious(norm, cfg.pipelineRoot)
    : {
        previous_snapshot: null,
        added: 0,
        removed: 0,
        modified: 0,
        threshold_breaches: [],
        notes: ["Diff skipped: normalization did not complete."],
      };

  // 4) Build the manifest.
  const sources: Manifest["sources"] = [
    mygaRates.provenance,
    curatedBenchmarks.provenance,
    mdx.provenance,
    fredDgs10.provenance,
    fredDgs1.provenance,
    treasuryDirect10yr.provenance,
    fdicCd5yr.provenance,
  ];

  const blocking =
    norm.schema_failures.length > 0 ||
    norm.conflicts.length > 0 ||
    norm.missing_required.length > 0 ||
    adapterFailures.length > 0;

  // [Phase 5] Capture the frozen-time env value if set. Used by REVIEW.md
  // warning block, publish-data refusal, and wall-clock regression check.
  const frozen_time_env = process.env.PIPELINE_FROZEN_TIME;
  const frozen_time =
    frozen_time_env && /^\d{4}-\d{2}-\d{2}T/.test(frozen_time_env)
      ? frozen_time_env
      : null;

  // [Phase 5] first_published_run is true when no previous snapshot exists.
  // The diff layer already reports previous_snapshot===null on first run, so
  // we just mirror that signal onto the manifest for downstream consumers
  // (REVIEW.md header flag, wall-clock regression carve-out).
  const first_published_run = diff.previous_snapshot === null;

  const manifestRaw: Manifest = {
    run_id: runId,
    pipeline_version: PIPELINE_VERSION,
    run_mode: cfg.runMode,
    sources,
    counts: {
      carriers: mdx.data?.carriers.length ?? 0,
      products: mdx.data?.products.length ?? 0,
      rates: norm.mygaRates.length,
      benchmarks: norm.benchmarkPanel ? 4 : 0,
      reviews: norm.reviews.length,
    },
    diff_vs_previous: {
      previous_snapshot: diff.previous_snapshot,
      added: diff.added,
      removed: diff.removed,
      modified: diff.modified,
      threshold_breaches: diff.threshold_breaches,
    },
    conflicts: norm.conflicts,
    missing_required: norm.missing_required,
    schema_failures: norm.schema_failures.concat(
      adapterFailures.length > 0 ? [`adapter-level errors: ${adapterFailures.join(" | ")}`] : [],
    ),
    status: blocking ? "blocked" : "ready_for_review",
    frozen_time,
    first_published_run,
  };

  const manifest = ManifestSchema.parse(manifestRaw);
  writeFileSync(resolve(runDir, "manifest.json"), canonicalize(manifest));

  // 5) Preview emit — ALWAYS write the generated artifacts into the run
  // directory's preview/ subtree. These are a preview even when
  // previewOnly=false so publish-data can compare them byte-for-byte
  // before moving them into src/.
  const previewRoot = resolve(runDir, "preview");
  const previewPaths = emitCollections(norm.benchmarkPanel ? norm : blankNorm(), cfg.projectRoot, {
    previewOnly: true,
    outRoot: previewRoot,
  });
  // emit-data in preview mode just writes into preview/benchmarks.generated.ts
  if (norm.benchmarkPanel) {
    const banner = emitBenchmarksGeneratedToPath(norm, resolve(previewRoot, "benchmarks.generated.ts"));
    void banner;
  }

  // 6) Reports.
  const reportPaths = writeReports({
    runId: safeRunId,
    runDir,
    normalize: norm,
    diff,
    manifest,
  });

  return {
    runId: safeRunId,
    runDir,
    status: manifest.status,
    manifest,
    normalize: norm,
    reportPaths,
  };
}

// Promote a reviewed run into src/. Called by publish-data.ts after the
// APPROVED.txt gate passes. This is the ONLY function in the pipeline that
// writes to src/.
export function promoteToSrc(
  outcome: RunOutcome,
  cfg: RunConfig,
): { paths: ReturnType<typeof emitCollections>; benchmarksPath: string } {
  if (outcome.manifest.status !== "ready_for_review") {
    throw new Error(`Cannot promote a blocked run (status=${outcome.manifest.status}).`);
  }
  if (!outcome.normalize.benchmarkPanel) {
    throw new Error("Cannot promote: normalize output has no benchmark panel.");
  }
  const paths = emitCollections(outcome.normalize, cfg.projectRoot);
  const benchmarksPath = emitBenchmarksGenerated(outcome.normalize, cfg.projectRoot);
  return { paths, benchmarksPath };
}

// --- local helpers ---------------------------------------------------------

function blankNorm(): NormalizeOutput {
  return {
    benchmarkPanel: undefined as never,
    legacyBenchmarkRates: [],
    mygaRates: [],
    reviews: [],
    notes: [],
    conflicts: [],
    missing_required: [],
    schema_failures: [],
  };
}

// Variant of emit-data that takes an explicit output path — used for the
// preview-only path so we don't need to overload emitBenchmarksGenerated.
function emitBenchmarksGeneratedToPath(out: NormalizeOutput, path: string): string {
  // Build the same content emit-data produces, but route it to `path`.
  const header = [
    `// ──────────────────────────────────────────────────────────────────`,
    `// PREVIEW — GENERATED FILE — DO NOT HAND-EDIT`,
    `// This is a preview emitted under reports/<run>/preview/. It is not`,
    `// read by any Astro page. The publish step promotes the production`,
    `// copy to src/data/benchmarks.generated.ts.`,
    `// ──────────────────────────────────────────────────────────────────`,
    ``,
  ].join("\n");
  const body =
    `export type BenchmarkStatus = "live" | "pilot_empty" | "degraded";\n` +
    `export interface BenchmarkRate { label: string; rate: number; source: string; status: BenchmarkStatus; }\n` +
    `export const benchmarkRates: readonly BenchmarkRate[] = ` +
    JSON.stringify(out.legacyBenchmarkRates, null, 2) +
    ` as const;\n`;
  writeFileSync(path, header + body);
  return path;
}
