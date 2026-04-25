// [Phase 5] UI liveness utilities.
//
// Single source of truth for how the site renders a review or benchmark
// that is NOT live. The rule set (PHASE5_SPEC.md §§3–4):
//
//  • A not-live review or a not-live benchmark renders its rate / grade
//    as an em-dash (—), never a "0.00%" or similar numeric fallback.
//  • A "Not live" chip is rendered adjacent to the value, using a stable
//    set of labels keyed by the cause.
//  • Not-live pages emit robots meta tags that block indexing so search
//    engines don't ingest pilot / degraded / empty content as authoritative.
//  • Every benchmark cell on every route uses the same structural testid
//    (data-testid="benchmark-value") so a single assertion covers all
//    surfaces in tests.
//
// This file is framework-agnostic pure TS — it returns data, and the
// Astro/React components import the data and render it. Keeping the
// logic out of components makes it unit-testable without a DOM harness.

// ─── Benchmark liveness ────────────────────────────────────────────────────

export type BenchmarkStatus = "live" | "pilot_empty" | "degraded";

// [Phase 5.0d] Subset of not_live_cause values the UI cares about. The
// schema enum (BenchmarkNotLiveCauseSchema) is authoritative; this type
// stays in sync by structural match. Keep the `null` alternative so
// callers can pass the pair through without narrowing upstream.
export type BenchmarkNotLiveCause = "stale_myga_rate" | null;

// Exact chip labels. Externally visible copy — change with editorial
// approval (tests assert the label string verbatim).
export const BENCHMARK_CHIP_LABEL: Record<
  Exclude<BenchmarkStatus, "live">,
  string
> = {
  pilot_empty: "Not live — awaiting data",
  degraded: "Not live — stale fallback",
};

/**
 * [Phase 5.0d] Chip label for a benchmark whose `status === "degraded"`
 * with `not_live_cause === "stale_myga_rate"`. Distinct from the
 * generic "Not live — stale fallback" chip because the user wants the
 * freshness failure to surface the age in days (“Stale — last observed
 * N days ago”) so maintainers can spot the refresh gap at a glance
 * without opening the manifest.
 *
 * `ageDays` is computed from the rate's `observed_at` and the current
 * render time. Negative ages (observation is in the future relative to
 * now, e.g. a pre-announced rate sheet) shouldn't occur for *stale*
 * rates, but we clamp to 0 defensively so a clock-skew edge never
 * renders “–1 days” copy.
 */
export function staleMygaRateChipLabel(ageDays: number): string {
  const n = Math.max(0, Math.floor(ageDays));
  const unit = n === 1 ? "day" : "days";
  return `Stale — last observed ${n} ${unit} ago`;
}

/**
 * Whether a benchmark should be rendered in its "not live" visual state.
 * Mirrors the PHASE5_SPEC.md §3 invariant: any status other than "live"
 * triggers the em-dash + chip treatment.
 */
export function isBenchmarkNotLive(status: BenchmarkStatus): boolean {
  return status !== "live";
}

/**
 * The exact string rendered in a benchmark's value slot. Live benchmarks
 * format their rate as two-decimal percent; not-live benchmarks render
 * the em-dash — NEVER "0.00%".
 */
export function benchmarkValueString(
  status: BenchmarkStatus,
  rate: number,
): string {
  if (isBenchmarkNotLive(status)) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}

// ─── Review liveness ───────────────────────────────────────────────────────

export type ReviewStatus = "live" | "not_live";
export type ReviewNotLiveCause =
  | "pilot_carrier"
  | "degraded_benchmark"
  | "empty_benchmark"
  | "retired_carrier";

// External copy keyed by cause. Verbatim-asserted in tests.
export const REVIEW_CHIP_LABEL: Record<ReviewNotLiveCause, string> = {
  pilot_carrier: "Pilot review — not yet editorially approved",
  degraded_benchmark: "Not live — benchmark degraded",
  empty_benchmark: "Not live — benchmark awaiting data",
  retired_carrier: "Retired carrier",
};

/**
 * Whether a review should be rendered in its "not live" visual state.
 */
export function isReviewNotLive(status: ReviewStatus): boolean {
  return status !== "live";
}

/**
 * The exact string rendered in a review's grade slot when the grade
 * would otherwise be shown. Not-live reviews always render an em-dash.
 */
export function reviewGradeString(
  status: ReviewStatus,
  letter: "A+" | "A" | "B" | "C" | "F" | null,
): string {
  if (isReviewNotLive(status) || letter === null) return "—";
  return letter;
}

// ─── Header / meta tags ────────────────────────────────────────────────────

/**
 * Exact header string asserted in tests. Used by <h1> / page title on
 * not-live pages to make the state explicit to both users and crawlers.
 * The invariant in PHASE5_SPEC.md §4 requires the literal "(not live)"
 * suffix to appear in the rendered header whenever isReviewNotLive is
 * true — tests verify byte-for-byte.
 */
export function pageHeaderForReview(
  baseTitle: string,
  status: ReviewStatus,
): string {
  return isReviewNotLive(status) ? `${baseTitle} (not live)` : baseTitle;
}

/**
 * Meta tags to emit on not-live pages. Returned as a structured array so
 * the caller (Astro layout) can render each as a <meta> element. For
 * live pages this returns an empty array.
 */
export interface MetaTag {
  name: string;
  content: string;
}

export function notLiveMetaTags(
  status: ReviewStatus | BenchmarkStatus,
): MetaTag[] {
  const notLive =
    status === "not_live" || status === "pilot_empty" || status === "degraded";
  if (!notLive) return [];
  return [
    // Keep crawlers out of pilot / stale content. Both name="robots" and
    // googlebot-specific; belt-and-suspenders because some verticals
    // (e.g. news) honor only the specific one.
    { name: "robots", content: "noindex, nofollow" },
    { name: "googlebot", content: "noindex, nofollow" },
  ];
}

// ─── Structural testid ─────────────────────────────────────────────────────

// Every benchmark-value rendering site (calculator card, rates table cell,
// review sidecar grade) tags its value element with this testid. A single
// Vitest assertion "no benchmark-value contains '%' when its chip is
// present" then covers every surface uniformly.
export const BENCHMARK_VALUE_TESTID = "benchmark-value";
export const NOT_LIVE_CHIP_TESTID = "not-live-chip";
