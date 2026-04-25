// [Phase 5.0e] Unit tests for the exported MYGA top-rate comparator and
// integration tests for the "max-over-fresh, fall back to max-over-
// qualifying, else pilot_empty" selection algorithm.
//
// User-ratified contract (verbatim from the 5.0e kickoff):
//
//   qualifying = qualifyingFiveYearMygaRates(rates)
//   fresh      = qualifying.filter(r => isFreshFiveYearMygaRate(r, now,
//                                         MYGA_RATE_FRESHNESS_WINDOW_DAYS))
//
//   if fresh.length > 0:
//       winner = max(fresh, by comparator)
//       status: "live", not_live_cause: null, rate: winner.rate
//
//   else if qualifying.length > 0:
//       winner = max(qualifying, by comparator)
//       status: "degraded", not_live_cause: "stale_myga_rate",
//       rate: winner.rate              // demoted, not dropped
//
//   else:
//       status: "pilot_empty", not_live_cause: null, rate: 0
//
// Comparator (used for both max(fresh) and max(qualifying)):
//   primary:    rate descending
//   tiebreak 1: observed_at descending
//   tiebreak 2: product_variant_slug ascending
//
// The comparator tests exercise the function in isolation so future
// refactors can't silently change the tiebreak chain without a red
// test. The integration tests exercise the full normalize() entry point
// through PIPELINE_FROZEN_TIME, covering each ratified invariant:
// stale-fresh crossover, all-stale preservation, tiebreak precedence.

import { afterEach, beforeEach, describe, it, expect } from "vitest";

import type { MdxCorpus, MdxReviewRecord } from "../adapters/mdx.ts";
import type {
  AdapterBenchmarkSnapshot,
  CuratedBenchmarksFile,
  MygaRate,
  MygaRatesFile,
} from "../schemas/rate.ts";
import {
  compareMygaTopRateWinner,
  normalize,
  type NormalizeInputs,
  type TaggedAdapterSnapshot,
} from "../normalize/index.ts";

// ─── Comparator unit tests (pure, no I/O) ────────────────────────────────

// Helper: build a MygaRate with only the three comparator-relevant
// fields non-default. Other fields are filled with plausible values so
// the rate is a legal MygaRate shape if asserted against the schema in
// other contexts.
function cmpRate(
  rate: number,
  observed_at: string,
  product_variant_slug: string,
): MygaRate {
  return {
    carrier_slug: "test-carrier",
    product_slug: "test-product",
    product_variant: product_variant_slug,
    product_variant_slug,
    term_years: 5,
    rate,
    premium_band_min: 100000,
    premium_band_max: null,
    effective_date: observed_at,
    observed_at,
    source_name: "test",
    source_url: "https://example.com/rates",
  };
}

describe("compareMygaTopRateWinner — primary key (rate desc)", () => {
  it("prefers the higher rate regardless of observed_at or variant_slug", () => {
    const higher = cmpRate(0.06, "2026-01-01", "zzz");
    const lower = cmpRate(0.05, "2026-04-22", "aaa");
    // Comparator returns a negative number when the first arg should
    // sort BEFORE the second (i.e. is the preferred winner).
    expect(compareMygaTopRateWinner(higher, lower)).toBeLessThan(0);
    expect(compareMygaTopRateWinner(lower, higher)).toBeGreaterThan(0);
  });
});

describe("compareMygaTopRateWinner — tiebreak 1 (observed_at desc)", () => {
  it("prefers the more recent observation when rates tie", () => {
    const newer = cmpRate(0.05, "2026-04-22", "zzz");
    const older = cmpRate(0.05, "2026-04-15", "aaa");
    expect(compareMygaTopRateWinner(newer, older)).toBeLessThan(0);
    expect(compareMygaTopRateWinner(older, newer)).toBeGreaterThan(0);
  });
});

describe("compareMygaTopRateWinner — tiebreak 2 (product_variant_slug asc)", () => {
  it("falls back to variant_slug ascending when rate and observed_at tie", () => {
    const aa = cmpRate(0.05, "2026-04-22", "aa-slug");
    const bb = cmpRate(0.05, "2026-04-22", "bb-slug");
    expect(compareMygaTopRateWinner(aa, bb)).toBeLessThan(0);
    expect(compareMygaTopRateWinner(bb, aa)).toBeGreaterThan(0);
  });

  it("returns 0 on full equality (total-order witness)", () => {
    const a = cmpRate(0.05, "2026-04-22", "same");
    const b = cmpRate(0.05, "2026-04-22", "same");
    expect(compareMygaTopRateWinner(a, b)).toBe(0);
  });
});

describe("compareMygaTopRateWinner — purity and total-order properties", () => {
  it("is pure: repeated calls with the same inputs return the same output", () => {
    const a = cmpRate(0.046, "2026-04-22", "aaa");
    const b = cmpRate(0.045, "2026-04-22", "bbb");
    const first = compareMygaTopRateWinner(a, b);
    const second = compareMygaTopRateWinner(a, b);
    const third = compareMygaTopRateWinner(a, b);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("is antisymmetric: sign(compare(a, b)) === -sign(compare(b, a))", () => {
    const pairs: [MygaRate, MygaRate][] = [
      [cmpRate(0.05, "2026-04-22", "a"), cmpRate(0.04, "2026-04-22", "a")], // primary
      [cmpRate(0.05, "2026-04-22", "a"), cmpRate(0.05, "2026-04-15", "a")], // tb1
      [cmpRate(0.05, "2026-04-22", "a"), cmpRate(0.05, "2026-04-22", "b")], // tb2
    ];
    for (const [a, b] of pairs) {
      expect(Math.sign(compareMygaTopRateWinner(a, b))).toBe(
        -Math.sign(compareMygaTopRateWinner(b, a)),
      );
    }
  });

  it("sorts an array deterministically across all three axes", () => {
    // Three rates that exercise each comparator axis:
    //   - high  : highest rate                      (wins on primary)
    //   - midA  : mid rate, newest observed_at      (wins tb1 within mid)
    //   - midB  : mid rate, older observed_at       (loses tb1)
    //   - lowA  : lowest rate, slug "aaa"           (wins tb2 within low)
    //   - lowB  : lowest rate, slug "zzz"           (loses tb2)
    const high = cmpRate(0.06, "2026-01-01", "mmm");
    const midA = cmpRate(0.05, "2026-04-22", "zzz");
    const midB = cmpRate(0.05, "2026-04-15", "aaa");
    const lowA = cmpRate(0.04, "2026-04-22", "aaa");
    const lowB = cmpRate(0.04, "2026-04-22", "zzz");

    const unsorted = [lowB, midB, high, lowA, midA];
    const sorted = [...unsorted].sort(compareMygaTopRateWinner);

    expect(sorted.map((r) => r.product_variant_slug)).toEqual([
      "mmm", // high (primary)
      "zzz", // midA (tb1 beats midB within 0.05 tier)
      "aaa", // midB
      "aaa", // lowA (tb2 beats lowB within 0.04 tier, same observed_at)
      "zzz", // lowB
    ]);
  });
});

// ─── Integration tests (normalize + freshness + selection) ───────────────

// Minimal MDX corpus that satisfies validateMdxProductFKs and
// validateRateFKs for the NYL product family. Both 5.0e test rates share
// the same carrier_slug + product_slug so a single product record covers
// them — this is the "variant-vs-slug" pattern from 5.0d.
function makeCarrierRecord(slug: string): MdxReviewRecord {
  return {
    slug,
    mdx_path: `reviews/${slug}`,
    kind: "carrier",
    frontmatter: {
      status: "pilot",
      carrier: { slug },
    } as unknown as MdxReviewRecord["frontmatter"],
    body: "",
    file_sha256: "deadbeef".padEnd(64, "0"),
    file_path: `/tmp/${slug}.mdx`,
  };
}

function makeProductRecord(slug: string, carrierSlug: string): MdxReviewRecord {
  return {
    slug,
    mdx_path: `reviews/${slug}`,
    kind: "product",
    frontmatter: {
      status: "pilot",
      product: { slug, carrierSlug },
    } as unknown as MdxReviewRecord["frontmatter"],
    body: "",
    file_sha256: "feedface".padEnd(64, "0"),
    file_path: `/tmp/${slug}.mdx`,
  };
}

function makeNylCorpus(): MdxCorpus {
  return {
    carriers: [makeCarrierRecord("new-york-life")],
    products: [
      makeProductRecord("new-york-life-secure-term-myga", "new-york-life"),
    ],
  };
}

// Shape identical to the 5.0d freshness test helper; duplicated here to
// keep 5.0e additions self-contained and to avoid cross-file imports on
// test-only scaffolding.
function mkNylRate(
  variantSlug: "secure-term-mva-ii" | "secure-term-choice-ii",
  rate: number,
  observed_at: string,
): MygaRate {
  const variantLabel =
    variantSlug === "secure-term-mva-ii"
      ? "Secure Term MVA II"
      : "Secure Term Choice II";
  return {
    carrier_slug: "new-york-life",
    product_slug: "new-york-life-secure-term-myga",
    product_variant: variantLabel,
    product_variant_slug: variantSlug,
    term_years: 5,
    rate,
    premium_band_min: 100000,
    premium_band_max: 1499999,
    effective_date: "2026-04-27",
    observed_at,
    source_name: `NYL ${variantLabel} rate sheet`,
    source_url: "https://www.nylannuities.com/resources/rates",
  };
}

function stubTaggedAdapter(
  adapter_id: AdapterBenchmarkSnapshot["adapter_id"],
  label: string,
  rate: number,
  source: string,
  source_url: string,
  as_of: string,
): TaggedAdapterSnapshot {
  return {
    snapshot: { label, rate, source, source_url, as_of, adapter_id },
    adapter_status: "ok",
  };
}

function makeNormalizeInputs(
  rates: MygaRate[],
  mdx: MdxCorpus = makeNylCorpus(),
): NormalizeInputs {
  const mygaRates: MygaRatesFile = { rates };
  const curatedBenchmarks: CuratedBenchmarksFile = {
    sp500_historical: {
      rate: 0.1,
      source: "curated S&P 500 long-run avg",
      source_url: "https://example.com/sp500",
      as_of: "2026-04-01",
    },
  };
  return {
    mdx,
    mygaRates,
    curatedBenchmarks,
    fredDgs10: stubTaggedAdapter(
      "fred",
      "10-yr Treasury (FRED DGS10)",
      0.044,
      "FRED DGS10",
      "https://fred.stlouisfed.org/series/DGS10",
      "2026-04-22",
    ),
    fredDgs1: stubTaggedAdapter(
      "fred",
      "1-yr Treasury (FRED DGS1)",
      0.05,
      "FRED DGS1",
      "https://fred.stlouisfed.org/series/DGS1",
      "2026-04-22",
    ),
    treasuryDirect10yr: stubTaggedAdapter(
      "treasury-direct",
      "10-yr Treasury (TreasuryDirect)",
      0.044,
      "TreasuryDirect",
      "https://www.treasurydirect.gov/",
      "2026-04-22",
    ),
    fdicCd5yr: stubTaggedAdapter(
      "fdic-cd",
      "5-yr CD national avg (FDIC)",
      0.018,
      "FDIC National Rates",
      "https://www.fdic.gov/resources/bankers/national-rates/",
      "2026-04-22",
    ),
  };
}

const ORIGINAL_FROZEN_TIME = process.env.PIPELINE_FROZEN_TIME;
function setFrozenTime(iso: string): void {
  process.env.PIPELINE_FROZEN_TIME = iso;
}
beforeEach(() => {
  delete process.env.PIPELINE_FROZEN_TIME;
});
afterEach(() => {
  if (ORIGINAL_FROZEN_TIME === undefined) {
    delete process.env.PIPELINE_FROZEN_TIME;
  } else {
    process.env.PIPELINE_FROZEN_TIME = ORIGINAL_FROZEN_TIME;
  }
});

describe("normalize — top_myga_5yr selection algorithm (5.0e)", () => {
  // ─── Two fresh rates: benchmark picks the higher rate ────────────────

  it("picks the higher rate when BOTH qualifying rates are fresh (max-over-fresh)", () => {
    setFrozenTime("2026-04-22T20:00:00.000Z");
    const mva = mkNylRate("secure-term-mva-ii", 0.046, "2026-04-22");
    const choice = mkNylRate("secure-term-choice-ii", 0.045, "2026-04-22");
    const out = normalize(makeNormalizeInputs([mva, choice]));

    const top = out.benchmarkPanel.top_myga_5yr;
    expect(top.status).toBe("live");
    expect(top.not_live_cause).toBeNull();
    // MVA II wins on primary (rate desc).
    expect(top.rate).toBeCloseTo(0.046, 6);

    // Both rates are preserved in the manifest (invariant-shaped: count
    // matches the input, variants present regardless of sort order).
    expect(out.mygaRates).toHaveLength(2);
    const variantSet = new Set(out.mygaRates.map((r) => r.product_variant_slug));
    expect(variantSet).toEqual(
      new Set(["secure-term-mva-ii", "secure-term-choice-ii"]),
    );
  });

  // ─── Stale-fresh crossover: load-bearing invariant (i) ───────────────
  //
  // This is the test that EXPOSES the 5.0d-vs-5.0e semantic change.
  // Under 5.0d the benchmark card would have shown the stale MVA II
  // with a stale chip; under 5.0e the card shows the fresh Choice II
  // as LIVE. If this test ever regresses, the selection algorithm has
  // silently regressed to "freshness as decorator" and needs to be
  // repaired immediately — don't paper over it.

  it("falls back to the lower FRESH rate when the higher rate is STALE (invariant i: stale-fresh crossover)", () => {
    setFrozenTime("2026-04-22T20:00:00.000Z");
    // MVA II 4.60% observed 10 days ago → stale (beyond the 7-day window).
    const staleHigh = mkNylRate("secure-term-mva-ii", 0.046, "2026-04-12");
    // Choice II 4.50% observed today → fresh.
    const freshLow = mkNylRate("secure-term-choice-ii", 0.045, "2026-04-22");
    const out = normalize(makeNormalizeInputs([staleHigh, freshLow]));

    const top = out.benchmarkPanel.top_myga_5yr;
    // Card is LIVE and picks the FRESH LOWER rate, not the stale higher.
    expect(top.status).toBe("live");
    expect(top.not_live_cause).toBeNull();
    expect(top.rate).toBeCloseTo(0.045, 6);
    expect(top.source).toContain("Choice II");

    // Stale row is still in the manifest so /rates renders it with its
    // own stale chip; it just doesn't claim the benchmark headline.
    expect(out.mygaRates).toHaveLength(2);
    const variantSet = new Set(out.mygaRates.map((r) => r.product_variant_slug));
    expect(variantSet).toEqual(
      new Set(["secure-term-mva-ii", "secure-term-choice-ii"]),
    );
  });

  // ─── All-stale fallback: load-bearing invariant (ii) ─────────────────

  it("demotes to 'degraded' + not_live_cause='stale_myga_rate' when ALL qualifying rates are stale, and preserves the MAX-of-stale value (invariant ii: all-stale preservation)", () => {
    setFrozenTime("2026-04-30T00:00:00.000Z"); // both rates far stale
    const staleHigh = mkNylRate("secure-term-mva-ii", 0.046, "2026-04-12");
    const staleLow = mkNylRate("secure-term-choice-ii", 0.045, "2026-04-15");
    const out = normalize(makeNormalizeInputs([staleHigh, staleLow]));

    const top = out.benchmarkPanel.top_myga_5yr;
    expect(top.status).toBe("degraded");
    expect(top.not_live_cause).toBe("stale_myga_rate");
    // Max over qualifying (MVA II @ 0.046) wins — NOT max over fresh
    // (empty) and NOT pilot_empty. "Demoted, not dropped."
    expect(top.rate).toBeCloseTo(0.046, 6);
    expect(top.source).toContain("MVA II");

    // Both rates still appear in the manifest.
    expect(out.mygaRates).toHaveLength(2);

    // A human-readable all-stale note is emitted (pluralization-agnostic
    // match: mentions the freshness window and the stale_myga_rate cause).
    const staleNote = out.notes.find(
      (n) => /freshness window/i.test(n) && /stale_myga_rate/.test(n),
    );
    expect(staleNote).toBeDefined();
  });

  // ─── Tiebreak 1: equal rate, more-recent observed_at wins ────────────

  it("breaks rate ties by observed_at DESC (more recent observation wins the headline)", () => {
    setFrozenTime("2026-04-22T20:00:00.000Z");
    // Two fresh rates at the SAME rate, different observed_at dates.
    // Expected winner: secure-term-choice-ii (observed 2026-04-22 beats
    // 2026-04-18 on tiebreak 1).
    const oldA = mkNylRate("secure-term-mva-ii", 0.046, "2026-04-18");
    const newB = mkNylRate("secure-term-choice-ii", 0.046, "2026-04-22");
    const out = normalize(makeNormalizeInputs([oldA, newB]));

    const top = out.benchmarkPanel.top_myga_5yr;
    expect(top.status).toBe("live");
    expect(top.rate).toBeCloseTo(0.046, 6);
    expect(top.source).toContain("Choice II");
  });

  // ─── Tiebreak 2: equal rate + equal observed_at, variant_slug asc ────
  //
  // Contrived but documents the contract: if the primary and first
  // tiebreak both tie, the lexicographically smaller variant_slug wins.
  // Here "secure-term-choice-ii" < "secure-term-mva-ii" so Choice II
  // wins despite arguing from the same sheet on the same day.

  it("breaks rate+observed_at ties by product_variant_slug ASC (documents the total-order contract)", () => {
    setFrozenTime("2026-04-22T20:00:00.000Z");
    const a = mkNylRate("secure-term-mva-ii", 0.046, "2026-04-22");
    const b = mkNylRate("secure-term-choice-ii", 0.046, "2026-04-22");
    const out = normalize(makeNormalizeInputs([a, b]));

    const top = out.benchmarkPanel.top_myga_5yr;
    expect(top.status).toBe("live");
    // "secure-term-choice-ii" < "secure-term-mva-ii" lexicographically.
    expect(top.source).toContain("Choice II");
  });
});
