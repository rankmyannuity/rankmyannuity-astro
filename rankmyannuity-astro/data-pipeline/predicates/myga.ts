// [Phase 5.0b · Task 19 | 5.0d extensions] MYGA predicates — shared module.
//
// SHARED CONTRACT between the normalize layer and CI Gate 4
// (scripts/ci/top-myga-public-requires-nonempty.ts). Any change to
// `isQualifyingFiveYearMygaRate` must update both call sites in the
// same PR. This file is the single source of truth; drift here
// silently changes pipeline benchmark status AND gate behavior
// simultaneously.
//
// Kickoff-ratified scope (PHASE5_KICKOFF.md, Task 19 adjusted plan):
//   - Single-argument, side-effect-free shape predicates. Input in,
//     boolean (or filtered array) out. No options bag, no
//     normalization flags. Same spirit as the mdxSha256 helper
//     ratification in PHASE5_SPEC.md §4.
//   - Scope stays the existing 5-year predicate only. Do NOT
//     generalize to arbitrary terms (3-yr / 7-yr / 10-yr) without
//     a spec decision.
//
// Defines the strict "qualifying 5-year MYGA rate" concept from
// PHASE5_SPEC.md §1. A qualifying rate is:
//   - term_years === 5       (exact, no 4-7yr banding)
//   - rate > 0               (zero means no real rate, not "free money")
//
// Used to decide whether the top_myga_5yr benchmark has any real input.
// If the curated rates list contains zero qualifying entries, the
// benchmark emits status="pilot_empty" with rate=0 (see normalize/index.ts
// and BenchmarkSnapshotSchema invariant).
//
// Also gates the top_myga_public flag (CI check #4 in PHASE5_SPEC.md §6):
// the site cannot publicly expose "top MYGA" messaging while the corpus
// is empty.
//
// ─── 5.0d extension: freshness layer ───────────────────────────────────
//
// User-ratified design (Decision 1 — Option B, verbatim):
//   "Keep hasQualifyingFiveYearMygaRate unchanged (shape-only,
//   single-argument, pure). Do NOT alter its signature. Add a new
//   sibling predicate in the same module: isFreshFiveYearMygaRate(rate,
//   now, windowDays): boolean — pure composition of shape predicate
//   AND freshness check against rate.observed_at. Normalize uses the
//   fresh predicate to decide live vs demoted. CI Gate 4 continues to
//   call the shape-only predicate. Demoted rates remain visible in
//   the manifest."
//
// Call sites (by predicate):
//   - isQualifyingFiveYearMygaRate / qualifyingFiveYearMygaRates /
//     hasQualifyingFiveYearMygaRate  →  CI Gate 4 and normalize-layer
//     shape/debug checks. Freshness is NOT considered here: CI Gate 4
//     only asks "does the corpus contain *any* real 5-yr MYGA rate?"
//     A stale rate is still a real rate from the corpus's perspective,
//     so it must not flip the gate open or shut on its own.
//   - isFreshFiveYearMygaRate                               →  normalize
//     layer only. This predicate decides whether top_myga_5yr emits
//     status="live" (fresh qualifying rate present) or status="degraded"
//     with not_live_cause="stale_myga_rate" (qualifying rate exists but
//     observed_at is older than the freshness window).
//
// Freshness window is ratified at 7 days and encoded as a named
// constant so tests can import the same value the pipeline uses. Do
// NOT hardcode the magic number in the normalize layer.

import type { MygaRate } from "../schemas/rate.ts";

/**
 * Freshness window for a qualifying 5-year MYGA rate, in days. A rate
 * whose `observed_at` is strictly more than this many days before `now`
 * is treated as stale by the normalize layer.
 *
 * User-ratified (Phase 5.0d kickoff): "Freshness window: 7 days. Rates
 * older than the window are treated as not-live by the normalize layer
 * (demoted, not dropped — their shape is still visible so the freshness
 * failure is debuggable). Encode the window as a named constant in the
 * pipeline, not a magic number. Import site for tests."
 */
export const MYGA_RATE_FRESHNESS_WINDOW_DAYS = 7;

/**
 * Returns true iff `rate` is a qualifying 5-year MYGA rate.
 * Pure, no I/O, no side effects. Safe to call from refine-side contexts.
 *
 * SHARED CONTRACT: see module docstring. Changes here must land with
 * corresponding updates in every call site in the same PR.
 */
export function isQualifyingFiveYearMygaRate(rate: MygaRate): boolean {
  return rate.term_years === 5 && rate.rate > 0;
}

/**
 * Returns the subset of qualifying 5-year MYGA rates from a list.
 * Preserves input order.
 */
export function qualifyingFiveYearMygaRates(rates: MygaRate[]): MygaRate[] {
  return rates.filter(isQualifyingFiveYearMygaRate);
}

/**
 * Returns true iff the rates list contains at least one qualifying
 * 5-year MYGA rate. Equivalent to qualifyingFiveYearMygaRates(r).length > 0
 * but avoids the intermediate allocation — use this in hot paths and
 * benchmark-emptiness checks.
 */
export function hasQualifyingFiveYearMygaRate(rates: MygaRate[]): boolean {
  return rates.some(isQualifyingFiveYearMygaRate);
}

// ─── 5.0d: freshness composition ───────────────────────────────────────

/**
 * Returns true iff `rate` is BOTH a qualifying 5-year MYGA rate AND its
 * `observed_at` falls within `windowDays` of `now` (inclusive at the
 * upper boundary: exactly `windowDays` old is still fresh, strictly
 * greater is stale).
 *
 * Pure composition of `isQualifyingFiveYearMygaRate` (shape) and a
 * freshness check against `rate.observed_at`. No I/O, no mutation of
 * either input. `now` and `windowDays` are injected (not read from the
 * environment) so this predicate is deterministic and test-friendly.
 *
 * `now` accepts either a `Date` or an ISO-8601 string for caller
 * convenience; invalid strings raise (same contract as `new Date(s)`).
 * `rate.observed_at` is a YYYY-MM-DD date per MygaRateSchema; it is
 * interpreted as UTC midnight of that day, consistent with the YAML
 * source's lack of timezone information.
 *
 * Used only by the normalize layer (to decide live vs degraded for
 * top_myga_5yr). CI Gate 4 continues to use the shape-only predicate.
 */
export function isFreshFiveYearMygaRate(
  rate: MygaRate,
  now: Date | string,
  windowDays: number,
): boolean {
  if (!isQualifyingFiveYearMygaRate(rate)) return false;
  const nowDate = typeof now === "string" ? new Date(now) : now;
  // Interpret the YAML date as UTC midnight so same-day observations
  // read as 0 days old regardless of the caller's local timezone.
  const observedDate = new Date(`${rate.observed_at}T00:00:00.000Z`);
  if (Number.isNaN(nowDate.getTime()) || Number.isNaN(observedDate.getTime())) {
    return false;
  }
  const ageMs = nowDate.getTime() - observedDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Inclusive at the window boundary: a rate exactly `windowDays` old
  // is fresh; strictly more than `windowDays` old is stale. Negative
  // ages (observed in the future relative to `now`) are also fresh —
  // they indicate a pre-announced rate sheet (e.g. NYL's "effective
  // 4/27" sheet observed on 4/22) and the freshness rule is about
  // staleness, not future-dating.
  return ageDays <= windowDays;
}
