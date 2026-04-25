// Normalize layer — takes the raw outputs from every adapter and builds
// the canonical in-memory shape that emit-collections and emit-data
// consume. This is also where the cross-field validation lives: foreign
// keys between MDX carriers/products and YAML rates/reviews, and the
// cross-adapter sanity checks (FRED vs TreasuryDirect within 10bps).
//
// Per Phase 4 brief: "Do not silently reconcile data. If source data
// conflicts, flag it and stop for review." Conflicts bubble up as
// strings in `conflicts`; any non-empty conflicts array blocks publish.

import type { MdxCorpus, MdxReviewRecord } from "../adapters/mdx.js";
import type {
  MygaRatesFile,
  CuratedBenchmarksFile,
  BenchmarkSnapshot,
  AdapterBenchmarkSnapshot,
  BenchmarkStatus,
  MygaRate,
} from "../schemas/rate.js";
import { BenchmarkSnapshotSchema } from "../schemas/rate.js";
import {
  ReviewSidecarSchema,
  type ReviewSidecar,
  type ReviewSidecarNotLiveCause,
} from "../schemas/review.js";
import type { ShippingApprovalsFile } from "../schemas/shipping.js";
import { findShippingApproval } from "../helpers/shippingYaml.js";
import {
  // [Phase 5.0e] hasQualifyingFiveYearMygaRate was dropped from this file
  // when the top_myga_5yr IIFE switched to a length-based branch on
  // qualifyingFiveYearMygaRates(...).length. Both predicates remain the
  // same pure shape check; this just removes a redundant call.
  qualifyingFiveYearMygaRates,
  isFreshFiveYearMygaRate,
  MYGA_RATE_FRESHNESS_WINDOW_DAYS,
} from "../predicates/myga.js";
import { PIPELINE_VERSION } from "../schemas/manifest.js";
import { gradeRate } from "../../src/lib/calculator/calculatorMath.js";
import { now } from "../adapters/types.js";

// [Phase 5] Adapter runtime status signal. Normalize maps this to the
// benchmark's final `status` field: AdapterStatus "degraded" becomes
// BenchmarkStatus "degraded"; anything else becomes "live" unless the
// data is empty (rate === 0 from a missing source), in which case it
// becomes "pilot_empty". See PHASE5_SPEC.md §3.
export type AdapterRuntimeStatus = "ok" | "degraded";

// A tagged adapter snapshot: the payload plus the runtime status signal
// that only the adapter layer knows. Normalize needs both to pick the
// correct BenchmarkStatus.
export interface TaggedAdapterSnapshot {
  snapshot: AdapterBenchmarkSnapshot;
  adapter_status: AdapterRuntimeStatus;
}

export interface NormalizeInputs {
  mdx: MdxCorpus;
  mygaRates: MygaRatesFile;
  curatedBenchmarks: CuratedBenchmarksFile;
  fredDgs10: TaggedAdapterSnapshot;
  fredDgs1: TaggedAdapterSnapshot;
  treasuryDirect10yr: TaggedAdapterSnapshot;
  fdicCd5yr: TaggedAdapterSnapshot;
  // [Phase 5] Shipping approvals + per-MDX sha256 lookup drive the
  // shipping→pilot downgrade (PHASE5_SPEC.md §2). Both are optional to
  // preserve backward compatibility in tests that don't exercise this path;
  // when absent, no downgrade is applied and MDX status is trusted as-is.
  // In the real pipeline the orchestrator always provides them.
  shippingApprovals?: ShippingApprovalsFile;
  // Map keyed by MDX slug → current sha256 hex of the file bytes.
  // The orchestrator fills this by calling helpers/mdxSha256.ts per MDX.
  mdxSha256Lookup?: Map<string, string>;
}

// The primary output of normalize: an assembled model ready for emit.
export interface NormalizeOutput {
  // Benchmark panel for /calculator and /rates. Rounded to 4 decimal
  // places so FP artifacts (e.g. 0.0185 -> 0.018500000000000003) never
  // propagate into generated code and the idempotency test stays stable.
  benchmarkPanel: {
    top_myga_5yr: BenchmarkSnapshot;
    treasury_10yr: BenchmarkSnapshot;
    cd_5yr_national_avg: BenchmarkSnapshot;
    sp500_historical: BenchmarkSnapshot;
  };
  // Legacy-compatible array matching src/data/benchmarks.ts shape.
  // [Phase 5] Each entry now carries the BenchmarkStatus so the
  // calculator island can render em-dash + chip without having to
  // reload the richer panel JSON.
  legacyBenchmarkRates: Array<{ label: string; rate: number; source: string; status: BenchmarkStatus }>;
  mygaRates: MygaRate[];                                  // sorted deterministically
  reviews: ReviewSidecar[];                               // one per MDX file, schema-valid
  // Non-fatal notes (shown in REVIEW.md)
  notes: string[];
  // Fatal issues (block publish)
  conflicts: string[];
  missing_required: string[];
  schema_failures: string[];
}

export const CROSS_CHECK_BPS_TOLERANCE = 10; // 0.10%

// Round to 4 decimal places. Benchmarks are displayed at most at 2 decimal
// percent (0.00%), so 4 decimals of storage precision is more than enough
// and avoids FP noise like 0.018500000000000003 from /100 divisions.
export function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

// [Phase 5] Round the adapter snapshot and tag a final BenchmarkStatus.
// The status predicate mirrors BenchmarkSnapshotSchema.superRefine:
//   rate === 0        ⇒ pilot_empty   (source is empty; no real value)
//   adapter degraded  ⇒ degraded      (live call failed; using fallback)
//   otherwise         ⇒ live
// pilot_empty takes precedence over degraded (a zero-rate fallback is
// still semantically empty, per spec §3: "Never coexists with pilot_empty").
function tagAdapterSnapshot(tagged: TaggedAdapterSnapshot): BenchmarkSnapshot {
  const rounded = round4(tagged.snapshot.rate);
  const status: BenchmarkStatus =
    rounded === 0
      ? "pilot_empty"
      : tagged.adapter_status === "degraded"
        ? "degraded"
        : "live";
  // Final validation against the full schema catches any drift between
  // this predicate and the schema-level invariant (rate===0 ⇔ pilot_empty).
  return BenchmarkSnapshotSchema.parse({
    ...tagged.snapshot,
    rate: rounded,
    status,
    // [Phase 5.0d] Adapter-sourced benchmarks (FRED / TreasuryDirect /
    // FDIC) do not carry a 5.0d-style cause today — the only enum
    // value is "stale_myga_rate". An adapter "degraded" here means a
    // fallback snapshot was served; if a future phase extends the enum
    // to cover that, plumb the cause through TaggedAdapterSnapshot. For
    // now we intentionally parse this as null for live/pilot_empty and
    // leave the refine to catch any drift if/when we allow a degraded
    // adapter status on these benchmarks. (As of 5.0d, the adapters
    // return "ok" in the pipeline's exercised paths; degraded would
    // currently fail the cross-exclusion refine and surface as a
    // schema_failure — the intended behavior until we extend the enum.)
    not_live_cause: null,
  });
}

// ─── FK validation helpers ───────────────────────────────────────────────

// Every rate.carrier_slug must match some MDX carrier slug AND every
// rate.product_slug must match some MDX product slug. An orphan rate is
// fatal: it means the curated YAML points at a carrier/product we don't
// review, which violates the pilot scope and also breaks the /rates page
// link-out. Per brief: "If required fields are missing, fail the build."
function validateRateFKs(
  rates: MygaRate[],
  mdx: MdxCorpus,
): { ok: boolean; errors: string[] } {
  const carrierSlugs = new Set(mdx.carriers.map((c) => c.slug));
  const productSlugs = new Set(mdx.products.map((p) => p.slug));
  const errors: string[] = [];
  for (const r of rates) {
    if (!carrierSlugs.has(r.carrier_slug)) {
      errors.push(
        `rates.myga.yml: carrier_slug "${r.carrier_slug}" not found in MDX reviews (known: ${[...carrierSlugs].join(", ") || "none"})`,
      );
    }
    if (!productSlugs.has(r.product_slug)) {
      errors.push(
        `rates.myga.yml: product_slug "${r.product_slug}" not found in MDX reviews (known: ${[...productSlugs].join(", ") || "none"})`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

// Every MDX product must reference a carrier we also review. Orphan
// products (product.carrierSlug with no matching carrier MDX) are fatal.
function validateMdxProductFKs(mdx: MdxCorpus): string[] {
  const carrierSlugs = new Set(mdx.carriers.map((c) => c.slug));
  const errors: string[] = [];
  for (const p of mdx.products) {
    if (!carrierSlugs.has(p.frontmatter.product.carrierSlug)) {
      errors.push(
        `MDX product ${p.slug}: carrierSlug "${p.frontmatter.product.carrierSlug}" has no matching carrier review (known: ${[...carrierSlugs].join(", ") || "none"})`,
      );
    }
  }
  return errors;
}

// MDX review's related arrays (relatedReviews, relatedArticles) are soft —
// we only warn when a relatedReviews slug has no matching review, since
// those become site-level links. Related articles are out of scope (Phase 4
// doesn't rebuild the articles collection).
function validateRelatedReviews(mdx: MdxCorpus): string[] {
  const reviewSlugs = new Set([
    ...mdx.carriers.map((c) => c.slug),
    ...mdx.products.map((p) => p.slug),
  ]);
  const notes: string[] = [];
  const all: MdxReviewRecord[] = [...mdx.carriers, ...mdx.products];
  for (const r of all) {
    const related = (r.frontmatter as unknown as { relatedReviews?: string[] })
      .relatedReviews ?? [];
    for (const slug of related) {
      if (!reviewSlugs.has(slug)) {
        notes.push(
          `MDX ${r.slug}: relatedReviews references "${slug}" which is not a review in the current corpus`,
        );
      }
    }
  }
  return notes;
}

// ─── Shipping sha256 downgrade ───────────────────────────────────────────

// [Phase 5] A carrier/product MDX may author `status: "shipping"` in its
// frontmatter. Shipping status is a promoted state that must be approved
// in sources/carriers.shipping.yml with a pinned sha256 of the MDX bytes
// at approval time. If:
//   - no approval entry exists for the slug, OR
//   - the approval's mdx_sha256 does not match the current file bytes
// then we DOWNGRADE status to "pilot" in-memory (mutating the frontmatter
// copy on the record), emit a REVIEW.md note, and let the rest of the
// pipeline proceed as if the carrier were pilot. This is the mechanism
// that makes shipping promotion auditable and tamper-evident: any edit to
// a shipping MDX without re-approval silently reverts its live status.
//
// This function MUTATES `rec.frontmatter.status` on downgrade. Callers
// should treat the MdxCorpus as mutable for the duration of normalize()
// (which is true in the current architecture — the corpus is reloaded
// from disk each run).
export function applyShippingSha256Downgrade(
  mdx: MdxCorpus,
  shipping: ShippingApprovalsFile | undefined,
  sha256Lookup: Map<string, string> | undefined,
): string[] {
  const notes: string[] = [];
  if (!shipping || !sha256Lookup) return notes;

  const all: MdxReviewRecord[] = [...mdx.carriers, ...mdx.products];
  for (const rec of all) {
    const fm = rec.frontmatter as { status?: "pilot" | "shipping" | "retired" };
    if (fm.status !== "shipping") continue;

    const approval = findShippingApproval(shipping, rec.slug);
    const currentSha = sha256Lookup.get(rec.slug);

    if (!approval) {
      fm.status = "pilot";
      notes.push(
        `${rec.slug}: MDX declares status "shipping" but no matching entry in carriers.shipping.yml — downgraded to "pilot" in emitted sidecar. Add an approval entry or change MDX status.`,
      );
      continue;
    }
    if (!currentSha) {
      // No sha entry means the orchestrator couldn't read the file; be
      // conservative and downgrade rather than trust a stale approval.
      fm.status = "pilot";
      notes.push(
        `${rec.slug}: shipping approval exists but current MDX sha256 could not be computed — downgraded to "pilot" for safety.`,
      );
      continue;
    }
    if (approval.mdx_sha256 !== currentSha) {
      fm.status = "pilot";
      notes.push(
        `${rec.slug}: shipping approval sha256 (${approval.mdx_sha256.slice(0, 8)}…) does not match current MDX (${currentSha.slice(0, 8)}…) — downgraded to "pilot". Re-review the MDX and update carriers.shipping.yml to re-promote.`,
      );
      continue;
    }
    // Approval exists and sha matches — leave status as "shipping".
  }
  return notes;
}

// ─── Cross-adapter conflict detection ────────────────────────────────────

// [Phase 5] Accepts TaggedAdapterSnapshot rather than BenchmarkSnapshot
// because the cross-check runs BEFORE normalize tags statuses — the
// adapter payload is the raw source we compare. We read .snapshot.rate
// and .snapshot.as_of to preserve the original numeric/date semantics.
function crossCheckTreasuries(
  fred: TaggedAdapterSnapshot,
  td: TaggedAdapterSnapshot,
): { conflicts: string[]; notes: string[] } {
  const conflicts: string[] = [];
  const notes: string[] = [];
  const fredRate = fred.snapshot.rate;
  const tdRate = td.snapshot.rate;
  const fredAsOf = fred.snapshot.as_of;
  const tdAsOf = td.snapshot.as_of;
  const diffBps = Math.abs(fredRate - tdRate) * 10000;
  if (diffBps > CROSS_CHECK_BPS_TOLERANCE) {
    conflicts.push(
      `FRED DGS10 (${(fredRate * 100).toFixed(2)}%, ${fredAsOf}) vs TreasuryDirect (${(tdRate * 100).toFixed(2)}%, ${tdAsOf}) differ by ${diffBps.toFixed(0)}bps (threshold ${CROSS_CHECK_BPS_TOLERANCE}bps). Brief requires stop-and-review on source conflicts.`,
    );
  } else {
    notes.push(
      `FRED DGS10 and TreasuryDirect cross-check OK: ${(fredRate * 100).toFixed(2)}% vs ${(tdRate * 100).toFixed(2)}% (${diffBps.toFixed(1)}bps apart, within ${CROSS_CHECK_BPS_TOLERANCE}bps tolerance).`,
    );
  }
  return { conflicts, notes };
}

// ─── Review sidecar builder ──────────────────────────────────────────────

// [Phase 5] Derive the review sidecar's liveness pair from the inputs
// available to normalize. Precedence (first match wins):
//
//   1. MDX carrier/product status === "retired" ⇒ not_live / retired_carrier
//   2. MDX carrier/product status === "pilot"   ⇒ not_live / pilot_carrier
//   3. top_myga_5yr benchmark status === "pilot_empty" ⇒ not_live / empty_benchmark
//   4. top_myga_5yr benchmark status === "degraded"    ⇒ not_live / degraded_benchmark
//   5. otherwise ⇒ live / null
//
// The pilot-carrier check is dominant because the editorial scope is the
// carrier review itself — even if the comparison benchmark is healthy, a
// pilot review cannot publish as "live" (PHASE5_SPEC.md §4). sha256
// downgrade is applied upstream: normalize will rewrite MDX status from
// shipping→pilot when the carriers.shipping.yml approval hash no longer
// matches, so by the time we reach this function that mutation is already
// reflected in `rec.frontmatter`.
function deriveReviewLiveness(
  rec: MdxReviewRecord,
  topMyga: BenchmarkSnapshot,
): { status: "live" | "not_live"; not_live_cause: ReviewSidecarNotLiveCause | null } {
  const mdxStatus =
    (rec.frontmatter as { status?: "pilot" | "shipping" | "retired" }).status ??
    "pilot";
  if (mdxStatus === "retired") {
    return { status: "not_live", not_live_cause: "retired_carrier" };
  }
  if (mdxStatus === "pilot") {
    return { status: "not_live", not_live_cause: "pilot_carrier" };
  }
  // MDX status === "shipping" — now consider benchmark health.
  if (topMyga.status === "pilot_empty") {
    return { status: "not_live", not_live_cause: "empty_benchmark" };
  }
  if (topMyga.status === "degraded") {
    return { status: "not_live", not_live_cause: "degraded_benchmark" };
  }
  return { status: "live", not_live_cause: null };
}

// For each MDX review we emit exactly one sidecar JSON. The sidecar
// carries the pipeline-computed data (linked rate, benchmark delta,
// computed grade) — the MDX continues to hold the editorial body. Pages
// read both and render together.
function buildReviewSidecar(
  rec: MdxReviewRecord,
  rates: MygaRate[],
  topMyga: BenchmarkSnapshot,
  generated_at: string,
): { sidecar: ReviewSidecar | null; schemaError?: string } {
  // Find a linked rate. For product reviews, link by product_slug. For
  // carrier reviews, there is no single product to link — leave linked_rate
  // as null. This is intentional and documented in REVIEW.md.
  let linked: MygaRate | null = null;
  if (rec.kind === "product") {
    linked = rates.find((r) => r.product_slug === rec.slug) ?? null;
  }

  const linked_rate: ReviewSidecar["linked_rate"] = linked
    ? {
        term_years: linked.term_years,
        rate: round4(linked.rate),
        effective_date: linked.effective_date,
        // [Phase 5.0d] observed_at + product_variant plumbed through.
        observed_at: linked.observed_at,
        product_variant: linked.product_variant,
        product_variant_slug: linked.product_variant_slug,
        source_name: linked.source_name,
        source_url: linked.source_url,
        premium_band_min: linked.premium_band_min,
        premium_band_max: linked.premium_band_max,
      }
    : null;

  const benchmark_delta: ReviewSidecar["benchmark_delta"] = linked_rate
    ? (() => {
        const delta = round4(linked_rate.rate - topMyga.rate);
        const absPct = (Math.abs(delta) * 100).toFixed(2);
        const dir = delta >= 0 ? "above" : "below";
        return {
          vs_top_myga_5yr: delta,
          formatted: `${absPct}% ${dir} top MYGA (${(topMyga.rate * 100).toFixed(2)}%)`,
        };
      })()
    : null;

  // Computed grade: pipeline uses the EXISTING calculatorMath.gradeRate.
  // We grade using the linked rate's `rate`. If no linked rate, emit null —
  // pages render a "Rate not available for automated grading" state.
  // (Brief: "No silent edits to existing grades, labels, or rankings logic.")
  const computed_grade: ReviewSidecar["computed_grade"] = linked_rate
    ? (() => {
        const g = gradeRate(linked_rate.rate);
        const letter = g.grade as "A+" | "A" | "B" | "C" | "F";
        return {
          rate_used: linked_rate.rate,
          letter,
          grade_class: g.gradeClass,
          grade_label: g.gradeLabel,
          source_fn: "calculatorMath.gradeRate" as const,
        };
      })()
    : null;

  const carrier_slug =
    rec.kind === "carrier"
      ? (rec.frontmatter as { carrier: { slug: string } }).carrier.slug
      : (rec.frontmatter as { product: { carrierSlug: string } }).product.carrierSlug;
  const product_slug =
    rec.kind === "product"
      ? (rec.frontmatter as { product: { slug: string } }).product.slug
      : null;

  // [Phase 5] Derive liveness. The schema .superRefine enforces the pair
  // invariant, so if deriveReviewLiveness ever drifts, ReviewSidecarSchema
  // will block emit.
  const { status, not_live_cause } = deriveReviewLiveness(rec, topMyga);

  const sidecar = {
    slug: rec.slug,
    kind: rec.kind,
    mdx_path: rec.mdx_path,
    carrier_slug,
    product_slug,
    linked_rate,
    benchmark_delta,
    computed_grade,
    status,
    not_live_cause,
    generated_at,
    pipeline_version: PIPELINE_VERSION,
  };

  const checked = ReviewSidecarSchema.safeParse(sidecar);
  if (!checked.success) {
    return {
      sidecar: null,
      schemaError: `${rec.slug}: sidecar failed schema: ${checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  }
  return { sidecar: checked.data };
}

// ─── 5.0e-ratified MYGA top-rate comparator ──────────────────────────────
//
// This comparator is the SINGLE source of truth for "which MYGA rate wins"
// anywhere in the pipeline. Both the fresh-path winner pick and the
// all-stale fallback winner pick in the top_myga_5yr IIFE feed through it,
// so the two paths can never disagree on tiebreak semantics.
//
// Tiebreak chain (total order, ratified in the 5.0e kickoff):
//   primary:    rate descending                    (higher yield wins)
//   tiebreak 1: observed_at descending             (fresher observation wins)
//   tiebreak 2: product_variant_slug ascending     (deterministic, documented)
//
// Returns a negative number if `a` should sort BEFORE `b` (i.e. `a` is the
// preferred winner). Callers that want the winner can do
// `rates.slice().sort(compareMygaTopRateWinner)[0]` or the equivalent
// reduce-with-comparator idiom used below.
//
// Exported so data-pipeline/__tests__/normalize-myga-selection.test.ts can
// pin the comparator contract in isolation. Pure; no I/O; no dependence
// on `now()` — freshness is filtered upstream of this comparator, not
// inside it.
export function compareMygaTopRateWinner(a: MygaRate, b: MygaRate): number {
  if (a.rate !== b.rate) return b.rate - a.rate;                // rate desc
  if (a.observed_at !== b.observed_at) {
    return a.observed_at < b.observed_at ? 1 : -1;              // observed_at desc
  }
  return a.product_variant_slug.localeCompare(b.product_variant_slug); // variant_slug asc
}

// Pick the best rate from a non-empty array using compareMygaTopRateWinner.
// Uses reduce rather than sort so we don't mutate or allocate for a single
// winner pick; caller must guarantee the array is non-empty.
function pickMygaTopRate(rates: readonly MygaRate[]): MygaRate {
  if (rates.length === 0) {
    // Defensive: every call site pre-checks length. If this ever fires it
    // indicates a bug in the caller's branching logic, not a data issue.
    throw new Error("pickMygaTopRate called with empty array — caller bug");
  }
  return rates.reduce((best, r) => (compareMygaTopRateWinner(r, best) < 0 ? r : best));
}

// ─── Main entry ──────────────────────────────────────────────────────────

export function normalize(inputs: NormalizeInputs): NormalizeOutput {
  const notes: string[] = [];
  const conflicts: string[] = [];
  const missing_required: string[] = [];
  const schema_failures: string[] = [];
  const generated_at = now();

  // 1) Sanitize (round) all benchmark snapshots and tag status (§3).
  //
  // [Phase 5.0e] top_myga_5yr selection algorithm — RATIFIED SEMANTIC
  // ("max-over-fresh, fall back to max-over-qualifying, else pilot_empty").
  // This REPLACES the 5.0d "max-over-qualifying with freshness-as-decorator"
  // behavior. The difference is load-bearing when the corpus contains
  // multiple qualifying rates and the highest one goes stale before the
  // lower ones do — under 5.0d the benchmark card would show the stale
  // high rate with a stale chip; under 5.0e it shows the fresh lower rate
  // as the live headline.
  //
  //   qualifying = shape-only predicate (term_years===5 AND rate>0)
  //   fresh      = qualifying ∩ isFreshFiveYearMygaRate(_, now, window)
  //
  //   if fresh.length > 0       → live,        winner = max(fresh)
  //   else if qualifying.length → degraded,    winner = max(qualifying)   // all-stale demotion, not dropped
  //   else                      → pilot_empty, rate = 0                   // no real rates at all
  //
  // Both max picks use compareMygaTopRateWinner so the tiebreak chain
  // (rate desc, observed_at desc, variant_slug asc) is consistent across
  // live and degraded paths.
  const top_myga_5yr: BenchmarkSnapshot = (() => {
    const qualifying = qualifyingFiveYearMygaRates(inputs.mygaRates.rates);

    // 1a) No qualifying rate at all → pilot_empty. A 5-year rate of 0 is
    // not a real rate and must not prop up the benchmark; emitting 0.00
    // with an honest placeholder citation is the "flag and stop" move —
    // any reviewer will spot it in REVIEW.md, and /rates renders an
    // empty state.
    if (qualifying.length === 0) {
      notes.push(
        "No 5-year MYGA rates in rates.myga.yml — top_myga_5yr benchmark is emitted at 0.00%. The /calculator 'Top MYGA' card and /rates page will render an empty state. Add an MYGA rate with a matching product review MDX to populate.",
      );
      return BenchmarkSnapshotSchema.parse({
        label: "5-yr MYGA (top rate)",
        rate: 0,
        source: "no curated MYGA rate available for pilot corpus",
        source_url: "https://rankmyannuity.pro/methodology",
        as_of: generated_at.slice(0, 10),
        adapter_id: "curated-yaml" as const,
        status: "pilot_empty" as const,
        not_live_cause: null,
      });
    }

    // 1b) Split qualifying into fresh vs stale using the 5.0d freshness
    // predicate. `now` is injected (via generated_at) so the pipeline is
    // deterministic under PIPELINE_FROZEN_TIME.
    const fresh = qualifying.filter((r) =>
      isFreshFiveYearMygaRate(r, generated_at, MYGA_RATE_FRESHNESS_WINDOW_DAYS),
    );

    // 1c) Fresh-path (preferred). Pick max over fresh; emit live.
    if (fresh.length > 0) {
      const top = pickMygaTopRate(fresh);
      return BenchmarkSnapshotSchema.parse({
        label: "5-yr MYGA (top rate)",
        rate: round4(top.rate),
        source: top.source_name,
        source_url: top.source_url ?? "https://rankmyannuity.pro/methodology",
        as_of: top.effective_date,
        adapter_id: "curated-yaml" as const,
        status: "live" as const,
        not_live_cause: null,
      });
    }

    // 1d) All-stale fallback ("demoted, not dropped"). Pick max over the
    // full qualifying set — the rate value stays in the manifest so the
    // failure is debuggable, and /rates renders the card as degraded with
    // a "Stale — last observed N days ago" chip keyed off the winner's
    // observed_at. Does NOT fall back to pilot_empty: a stale rate is
    // still a real rate.
    const top = pickMygaTopRate(qualifying);
    const ageDaysApprox = Math.floor(
      (new Date(generated_at).getTime() -
        new Date(`${top.observed_at}T00:00:00.000Z`).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    notes.push(
      `Top 5-yr MYGA rate (${top.carrier_slug}/${top.product_variant_slug}, ${(top.rate * 100).toFixed(2)}%) was last observed on ${top.observed_at} — ${ageDaysApprox} days ago, beyond the ${MYGA_RATE_FRESHNESS_WINDOW_DAYS}-day freshness window. All ${qualifying.length} qualifying 5-yr MYGA rate(s) are stale; benchmark is emitted with status "degraded" and not_live_cause "stale_myga_rate". The rate value is preserved in the manifest but /rates and /calculator will render a "Stale — last observed N days ago" chip. Refresh rates.myga.yml to restore live status.`,
    );
    return BenchmarkSnapshotSchema.parse({
      label: "5-yr MYGA (top rate)",
      rate: round4(top.rate),
      source: top.source_name,
      source_url: top.source_url ?? "https://rankmyannuity.pro/methodology",
      as_of: top.effective_date,
      adapter_id: "curated-yaml" as const,
      status: "degraded" as const,
      not_live_cause: "stale_myga_rate" as const,
    });
  })();

  const treasury_10yr = tagAdapterSnapshot(inputs.fredDgs10);
  const cd_5yr_national_avg = tagAdapterSnapshot(inputs.fdicCd5yr);
  const sp500_historical: BenchmarkSnapshot = BenchmarkSnapshotSchema.parse({
    label: "S&P 500 historical avg",
    rate: round4(inputs.curatedBenchmarks.sp500_historical.rate),
    source: inputs.curatedBenchmarks.sp500_historical.source,
    source_url: inputs.curatedBenchmarks.sp500_historical.source_url,
    as_of: inputs.curatedBenchmarks.sp500_historical.as_of,
    adapter_id: "curated-yaml" as const,
    // [Phase 5] S&P 500 historical is a curated constant — always live by
    // definition (degraded doesn't apply; a zero value here would be a
    // source-yaml bug and fail the schema invariant).
    status: "live" as const,
    not_live_cause: null,
  });

  // 2) Cross-adapter check (FRED vs TreasuryDirect).
  const { conflicts: xConflicts, notes: xNotes } = crossCheckTreasuries(
    inputs.fredDgs10,
    inputs.treasuryDirect10yr,
  );
  conflicts.push(...xConflicts);
  notes.push(...xNotes);

  // 2b) [Phase 5] Shipping sha256 downgrade. Mutates frontmatter.status on
  // the corpus where an authored "shipping" status no longer matches its
  // approval hash. Must run BEFORE buildReviewSidecar so deriveReviewLiveness
  // sees the downgraded status. See PHASE5_SPEC.md §2.
  const downgradeNotes = applyShippingSha256Downgrade(
    inputs.mdx,
    inputs.shippingApprovals,
    inputs.mdxSha256Lookup,
  );
  notes.push(...downgradeNotes);

  // 3) MDX FK validation.
  const mdxProductErrs = validateMdxProductFKs(inputs.mdx);
  missing_required.push(...mdxProductErrs);

  // 4) Rates FK validation.
  //
  // [Phase 5.0e] Sort tiebreak chain ratified by the kickoff:
  //   (carrier_slug asc, product_slug asc, term_years asc,
  //    observed_at desc, rate desc, product_variant_slug asc).
  //
  // The first three keys preserve the 5.0b carrier→product→term
  // grouping the /rates table relies on. The last three keys mirror the
  // top_myga_5yr selection comparator (compareMygaTopRateWinner) on its
  // primary+tiebreak axes, so within a (carrier, product, term) group the
  // row the benchmark card would pick sorts to the TOP of the table —
  // "deliberate symmetry" per the 5.0e brief's optional consistency
  // enhancement. Display order and selection order are now guaranteed
  // consistent for multi-variant groups (e.g. NYL's MVA II + Choice II).
  //
  // Note the inversion on observed_at vs rate: rate desc first in the
  // comparator but observed_at desc first here. This is intentional and
  // documented in PHASE5E_CHECKLIST.md under "Display-vs-selection
  // symmetry": for DISPLAY we prefer freshness-then-yield so a freshly
  // observed lower rate still sorts near the top of its group, mirroring
  // the selection algorithm's fresh-first precedence.
  const sortedRates = [...inputs.mygaRates.rates].sort((a, b) => {
    if (a.carrier_slug !== b.carrier_slug) return a.carrier_slug.localeCompare(b.carrier_slug);
    if (a.product_slug !== b.product_slug) return a.product_slug.localeCompare(b.product_slug);
    if (a.term_years !== b.term_years) return a.term_years - b.term_years;
    if (a.observed_at !== b.observed_at) return a.observed_at < b.observed_at ? 1 : -1; // observed_at desc
    if (a.rate !== b.rate) return b.rate - a.rate;                                      // rate desc
    return a.product_variant_slug.localeCompare(b.product_variant_slug);                // variant_slug asc
  });
  const fk = validateRateFKs(sortedRates, inputs.mdx);
  if (!fk.ok) missing_required.push(...fk.errors);

  // 5) Related-reviews soft notes.
  notes.push(...validateRelatedReviews(inputs.mdx));

  // 6) Build review sidecars (sorted by slug for deterministic output).
  const allReviews = [...inputs.mdx.carriers, ...inputs.mdx.products].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const reviews: ReviewSidecar[] = [];
  for (const rec of allReviews) {
    const { sidecar, schemaError } = buildReviewSidecar(rec, sortedRates, top_myga_5yr, generated_at);
    if (schemaError) schema_failures.push(schemaError);
    if (sidecar) reviews.push(sidecar);
  }

  // 7) Build legacy-compat array that src/data/benchmarks.ts can re-export.
  const legacyBenchmarkRates = [
    {
      label: top_myga_5yr.label,
      rate: top_myga_5yr.rate,
      source: `${top_myga_5yr.source} (${top_myga_5yr.as_of})`,
      status: top_myga_5yr.status,
    },
    {
      label: treasury_10yr.label,
      rate: treasury_10yr.rate,
      source: `${treasury_10yr.source} (${treasury_10yr.as_of})`,
      status: treasury_10yr.status,
    },
    {
      label: cd_5yr_national_avg.label,
      rate: cd_5yr_national_avg.rate,
      source: `${cd_5yr_national_avg.source} (${cd_5yr_national_avg.as_of})`,
      status: cd_5yr_national_avg.status,
    },
    {
      label: sp500_historical.label,
      rate: sp500_historical.rate,
      source: `${sp500_historical.source} (${sp500_historical.as_of})`,
      status: sp500_historical.status,
    },
  ];

  return {
    benchmarkPanel: {
      top_myga_5yr,
      treasury_10yr,
      cd_5yr_national_avg,
      sp500_historical,
    },
    legacyBenchmarkRates,
    mygaRates: sortedRates.map((r) => ({ ...r, rate: round4(r.rate) })),
    reviews,
    notes,
    conflicts,
    missing_required,
    schema_failures,
  };
}
