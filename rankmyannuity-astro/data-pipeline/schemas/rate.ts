// Rate schemas — MYGA carrier rates (from rates.myga.yml) and benchmark
// snapshots (from FRED/Treasury/FDIC adapters).
//
// These fields live in the pipeline layer only — MDX does not carry them.

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

export const MygaRateSchema = z.object({
  carrier_slug: z.string().regex(/^[a-z0-9-]+$/),             // FK → carrier MDX
  product_slug: z.string().regex(/^[a-z0-9-]+$/),             // FK → product MDX
  // [Phase 5.0d] Product-variant fidelity (Decision 2 — Option a).
  // The MDX product_slug is intentionally generic (one MDX per product
  // family, e.g. "new-york-life-secure-term-myga") while carriers
  // often publish multiple named variants on the same rate sheet
  // (e.g. NYL's "Secure Term MVA II" and "Secure Term Choice II").
  // We capture the real sold product name here without renaming the
  // MDX. product_variant is human-display copy; product_variant_slug
  // is a normalized kebab-case identifier for deterministic sorting
  // and test assertions.
  product_variant: z.string().min(1),
  product_variant_slug: z.string().regex(/^[a-z0-9-]+$/),
  term_years: z.number().int().min(1).max(20),
  rate: z.number().min(0).max(0.25),                          // decimal, hard cap
  premium_band_min: z.number().int().nonnegative(),
  premium_band_max: z.number().int().positive().nullable(),   // null = no upper bound
  // [Phase 5] Carrier's stated effective date from the rate sheet.
  // May be future-dated (e.g. a rate sheet published 4/22 with
  // effective date 4/27). Preserved verbatim; do NOT reconcile with
  // observed_at.
  effective_date: isoDate,
  // [Phase 5.0d] Date the rate was actually observed/fetched by the
  // pipeline maintainer. Drives the 7-day freshness window in the
  // normalize layer. Distinct from effective_date so the carrier's
  // stated date is never silently overwritten.
  observed_at: isoDate,
  source_name: z.string().min(1),                             // "Athene rate sheet 2026-04-15"
  source_url: z.string().url().nullable(),                    // null if not publicly linkable
}).strict();

export type MygaRate = z.infer<typeof MygaRateSchema>;

// [Phase 5] Benchmark lifecycle status. Mutually exclusive and exhaustive
// (PHASE5_SPEC.md §3):
//   - pilot_empty: the curated source is empty for this benchmark AND the
//                  emitted rate is exactly 0. For top_myga_5yr this means
//                  no qualifying 5-year MYGA rate (strict definition in §1).
//   - degraded:    the adapter fell back to a stale snapshot (e.g. FDIC
//                  fallback path). Never coexists with pilot_empty.
//   - live:        everything else.
//
// The normalize layer is authoritative about which status to emit — it has
// the full runtime context (empty-source flags, adapter fallback signals).
// The schema enforces the data-local invariants that follow from the
// definitions above, so a mislabeled status fails at parse time.
export const BenchmarkStatusSchema = z.enum(["live", "pilot_empty", "degraded"]);
export type BenchmarkStatus = z.infer<typeof BenchmarkStatusSchema>;

// [Phase 5.0d] When a benchmark is `degraded` we record *why* so the UI
// can render a distinct chip (per Decision 3 — Option X + Y strictness).
// Initial enum size is 1 + null; add new causes as future sources land.
//   - stale_myga_rate: the top MYGA rate exists in the corpus but its
//     observed_at is older than MYGA_RATE_FRESHNESS_WINDOW_DAYS.
// Mutual exclusivity with `status` is enforced inline in
// BenchmarkSnapshotSchema.superRefine below.
export const BenchmarkNotLiveCauseSchema = z
  .enum(["stale_myga_rate"])
  .nullable();
export type BenchmarkNotLiveCause = z.infer<typeof BenchmarkNotLiveCauseSchema>;

// [Phase 5] The raw benchmark snapshot shape as returned by a single
// adapter — no `status` field, because status inference requires runtime
// context (empty-source semantics, AdapterResult.status for degraded
// fallback) that only the normalize layer sees. Adapters self-validate
// their snapshot against this schema; normalize then tags status and
// validates the final shape against BenchmarkSnapshotSchema.
export const AdapterBenchmarkSnapshotSchema = z.object({
  label: z.string().min(1),
  rate: z.number().min(-0.05).max(0.25),
  source: z.string().min(1),
  source_url: z.string().url(),
  as_of: isoDate,
  adapter_id: z.enum(["fred","treasury-direct","fdic-cd","curated-yaml"]),
}).strict();

export type AdapterBenchmarkSnapshot = z.infer<typeof AdapterBenchmarkSnapshotSchema>;

export const BenchmarkSnapshotSchema = z.object({
  label: z.string().min(1),                                   // "10-yr Treasury"
  rate: z.number().min(-0.05).max(0.25),                      // decimal
  source: z.string().min(1),                                  // human-readable citation
  source_url: z.string().url(),
  as_of: isoDate,
  adapter_id: z.enum(["fred","treasury-direct","fdic-cd","curated-yaml"]),
  // [Phase 5] Required status. Normalize sets this; consumers read it.
  status: BenchmarkStatusSchema,
  // [Phase 5.0d] Required reason when status === "degraded", null otherwise.
  // See BenchmarkNotLiveCauseSchema and the superRefine below for the
  // mutual-exclusivity invariant.
  not_live_cause: BenchmarkNotLiveCauseSchema,
}).strict().superRefine((val, ctx) => {
  // Mutual-exclusivity invariant between data and status:
  //
  //   status === "pilot_empty"  ⇔  rate === 0
  //
  // i.e. a pilot_empty benchmark MUST have rate 0 (no hidden non-zero rate
  // behind the em-dash), and a rate of 0 MUST be labeled pilot_empty (no
  // live/degraded benchmark can render as 0.00% — that collapses the
  // em-dash UI invariant in PHASE5_SPEC.md §3).
  if (val.status === "pilot_empty" && val.rate !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rate"],
      message:
        "status 'pilot_empty' requires rate === 0; a non-zero benchmark cannot be pilot_empty.",
    });
  }
  if (val.status !== "pilot_empty" && val.rate === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message:
        "rate === 0 implies status 'pilot_empty'; a zero-valued benchmark cannot be 'live' or 'degraded'.",
    });
  }
  // [Phase 5.0d] Mutual-exclusivity invariant between status and
  // not_live_cause (Decision 3 — Option Y strictness):
  //
  //   status === "degraded"  ⇔  not_live_cause !== null
  //
  // A degraded benchmark MUST carry a concrete cause so the UI can
  // render the right chip; a live or pilot_empty benchmark MUST have
  // not_live_cause === null so downstream consumers can rely on the
  // pair as a single switch. This refine lives INLINE in this schema
  // (not in the 5.0c frontmatter cross-field module) per the user's
  // explicit scoping of that predicate file.
  if (val.status === "degraded" && val.not_live_cause === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["not_live_cause"],
      message:
        "status 'degraded' requires a concrete not_live_cause (null is only valid when status is 'live' or 'pilot_empty').",
    });
  }
  if (val.status !== "degraded" && val.not_live_cause !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["not_live_cause"],
      message:
        `not_live_cause must be null when status is '${val.status}'; a concrete cause is only valid for status 'degraded'.`,
    });
  }
});

export type BenchmarkSnapshot = z.infer<typeof BenchmarkSnapshotSchema>;

// The full benchmark panel that drives the calculator comparison and /rates page.
export const BenchmarkPanelSchema = z.object({
  top_myga_5yr: BenchmarkSnapshotSchema,
  treasury_10yr: BenchmarkSnapshotSchema,
  cd_5yr_national_avg: BenchmarkSnapshotSchema,
  sp500_historical: BenchmarkSnapshotSchema,                  // long-run constant; adapter="curated-yaml"
}).strict();

export type BenchmarkPanel = z.infer<typeof BenchmarkPanelSchema>;

// The top-level YAML shape for rates.myga.yml.
//
// rates can be an empty array — this is a valid state for a pilot run where
// no carrier in the active corpus sells an MYGA product we have a source for.
// The pipeline surfaces empty-rates as a note in REVIEW.md (not an error) so
// downstream pages render an explicit "no rates available" state rather than
// silently rendering nothing or inventing values. Per Phase 4 brief: "if a
// field has no reliable source, do not invent or silently backfill it."
export const MygaRatesFileSchema = z.object({
  rates: z.array(MygaRateSchema),
}).strict();

export type MygaRatesFile = z.infer<typeof MygaRatesFileSchema>;

// The top-level YAML shape for benchmarks.curated.yml (only sp500 + cross-check overrides)
export const CuratedBenchmarksFileSchema = z.object({
  sp500_historical: z.object({
    rate: z.number().min(0).max(0.25),
    source: z.string(),
    source_url: z.string().url(),
    as_of: isoDate,
  }),
}).strict();

export type CuratedBenchmarksFile = z.infer<typeof CuratedBenchmarksFileSchema>;
