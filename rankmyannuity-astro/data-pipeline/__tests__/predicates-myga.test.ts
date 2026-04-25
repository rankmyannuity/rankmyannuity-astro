// [Phase 5.0b · Task 19] Unit tests for the canonical MYGA predicate module.
//
// These tests import from data-pipeline/predicates/myga.ts (the NEW
// canonical location) rather than the back-compat shim at
// data-pipeline/helpers/qualifyingFiveYearMygaRate.ts. They formalize
// the four cases called out in the PHASE5_KICKOFF.md Task 19 adjusted
// plan:
//
//   1. empty corpus                  → false
//   2. only non-5-year terms         → false
//   3. 5-year failing band condition → false   (rate <= 0)
//   4. qualifying 5-year entry       → true
//
// The older helpers.test.ts file contains additional sanity tests that
// exercise the back-compat re-export path; those stay to prove the
// shim works. Do not delete them.

import { describe, it, expect } from "vitest";

import {
  isQualifyingFiveYearMygaRate,
  qualifyingFiveYearMygaRates,
  hasQualifyingFiveYearMygaRate,
} from "../predicates/myga.ts";
import type { MygaRate } from "../schemas/rate.ts";

function mkRate(partial: Partial<MygaRate>): MygaRate {
  return {
    carrier_slug: "athene",
    product_slug: "athene-maxrate",
    product_variant: "Athene MaxRate",
    product_variant_slug: "athene-maxrate",
    term_years: 5,
    rate: 0.055,
    premium_band_min: 100000,
    premium_band_max: 499999,
    effective_date: "2026-04-15",
    observed_at: "2026-04-15",
    source_name: "test",
    source_url: null,
    ...partial,
  };
}

describe("predicates/myga — hasQualifyingFiveYearMygaRate (Task 19 cases)", () => {
  // Case 1: empty corpus
  it("returns false on an empty corpus", () => {
    expect(hasQualifyingFiveYearMygaRate([])).toBe(false);
    expect(qualifyingFiveYearMygaRates([])).toEqual([]);
  });

  // Case 2: only non-5-year terms
  it("returns false when only non-5-year terms are present", () => {
    const list = [
      mkRate({ term_years: 3, rate: 0.05 }),
      mkRate({ term_years: 4, rate: 0.055 }),
      mkRate({ term_years: 7, rate: 0.06 }),
      mkRate({ term_years: 10, rate: 0.065 }),
    ];
    expect(hasQualifyingFiveYearMygaRate(list)).toBe(false);
    expect(qualifyingFiveYearMygaRates(list)).toEqual([]);
  });

  // Case 3: 5-year entry failing the band condition (rate <= 0)
  //
  // The "band condition" in the Task 19 kickoff wording is the rate > 0
  // test. `rate === 0` is the operative case in the schema because
  // rate < 0 is already rejected by MygaRateSchema (rates are non-
  // negative). We include rate === 0 because that's the boundary the
  // predicate actively filters; rate < 0 cannot occur in validated
  // data and is not a useful test input here.
  it("returns false when the only 5-year entry has rate === 0", () => {
    const list = [mkRate({ term_years: 5, rate: 0 })];
    expect(hasQualifyingFiveYearMygaRate(list)).toBe(false);
    expect(qualifyingFiveYearMygaRates(list)).toEqual([]);
    expect(isQualifyingFiveYearMygaRate(list[0])).toBe(false);
  });

  // Case 4: qualifying 5-year entry
  it("returns true when at least one qualifying 5-year entry is present", () => {
    const qualifying = mkRate({ term_years: 5, rate: 0.0545 });
    const mixed = [
      mkRate({ term_years: 3, rate: 0.05 }),
      mkRate({ term_years: 5, rate: 0 }), // band-failing
      qualifying,
      mkRate({ term_years: 7, rate: 0.062 }),
    ];
    expect(hasQualifyingFiveYearMygaRate(mixed)).toBe(true);
    expect(qualifyingFiveYearMygaRates(mixed)).toEqual([qualifying]);
    expect(isQualifyingFiveYearMygaRate(qualifying)).toBe(true);
  });

  // Guard-rail: the single-rate predicate is pure and side-effect-free.
  // Calling it twice on the same input yields the same result and does
  // not mutate the input. This formalizes the "Input in, boolean out"
  // contract from PHASE5_KICKOFF.md Task 19.
  it("is pure and does not mutate its input", () => {
    const r = mkRate({ term_years: 5, rate: 0.055 });
    const snapshot = JSON.stringify(r);
    expect(isQualifyingFiveYearMygaRate(r)).toBe(true);
    expect(isQualifyingFiveYearMygaRate(r)).toBe(true);
    expect(JSON.stringify(r)).toBe(snapshot);
  });
});
