// [Phase 5.0f] Cross-carrier selection tests.
//
// These tests exercise the 5.0e-ratified max-over-fresh selector across
// TWO carriers (NYL + Pacific Life Pacific Harbor) — the first non-NYL
// rate in the corpus. They re-affirm invariants (i) stale-fresh
// crossover and (ii) all-stale preservation in the cross-carrier
// setting, plus the new 5.0f cross-carrier winner transition: when a
// non-NYL fresh rate beats the NYL fresh rate, the benchmark card's
// headline rate AND source citation both update to the non-NYL carrier.
//
// The 5.0e tests already proved comparator, freshness, and selection
// semantics at the single-carrier level (two NYL variants on one
// sheet). These tests confirm the SAME semantics hold when the winning
// rate belongs to a DIFFERENT carrier than the "historically top"
// rate — i.e. no carrier-pinning exists in the selection path.
//
// Paired with the 5.0f pre-seed rendering-carrier-pinning audit (grep
// scope: src/pages/rates.astro, src/lib/ui/, data-pipeline/normalize/,
// data-pipeline/schemas/; result: CLEAN, only two NYL mentions found
// and both were non-runtime docstring examples), these tests close
// the cross-carrier selection loop at both the data layer (these
// tests) and the rendering layer (audit).

import { afterEach, beforeEach, describe, it, expect } from "vitest";

import type { MdxCorpus, MdxReviewRecord } from "../adapters/mdx.ts";
import type {
  AdapterBenchmarkSnapshot,
  CuratedBenchmarksFile,
  MygaRate,
  MygaRatesFile,
} from "../schemas/rate.ts";
import {
  normalize,
  type NormalizeInputs,
  type TaggedAdapterSnapshot,
} from "../normalize/index.ts";

// ─── MDX corpus: two carriers, two MYGA products ─────────────────────────

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

// Cross-carrier corpus: NYL Secure Term MYGA + Pacific Life Pacific
// Harbor. Both carriers and both products are pilot-status — matches
// the 5.0f scaffold and seed exactly.
function makeCrossCarrierCorpus(): MdxCorpus {
  return {
    carriers: [
      makeCarrierRecord("new-york-life"),
      makeCarrierRecord("pacific-life"),
    ],
    products: [
      makeProductRecord("new-york-life-secure-term-myga", "new-york-life"),
      makeProductRecord("pacific-life-pacific-harbor", "pacific-life"),
    ],
  };
}

// ─── Rate builders — one per carrier family ──────────────────────────────

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

function mkPacificHarborRate(
  rate: number,
  observed_at: string,
): MygaRate {
  return {
    carrier_slug: "pacific-life",
    product_slug: "pacific-life-pacific-harbor",
    product_variant: "Pacific Harbor",
    product_variant_slug: "pacific-harbor",
    term_years: 5,
    rate,
    premium_band_min: 200000,
    premium_band_max: null,
    effective_date: "2026-04-16",
    observed_at,
    source_name: "Pacific Life Pacific Harbor rate sheet (Pacific Life Advisory)",
    source_url: "https://ria.pacificlife.com/home/rates.html",
  };
}

// ─── Adapter stubs (shape-identical to the 5.0e fixtures) ────────────────

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
  mdx: MdxCorpus = makeCrossCarrierCorpus(),
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

// ─── Test 1: Cross-carrier selection (5.0f headline transition) ──────────
//
// Fresh NYL MVA II 4.60% + fresh Pacific Harbor 5.15% (matches the
// actual 5.0f seeded corpus). Expected: benchmark card's headline
// rate AND source citation both reference Pacific Life (Pacific
// Harbor), NOT NYL. This is the first cross-carrier winner transition
// in the corpus and directly exercises the "no carrier-pinning in
// selection" property.

describe("normalize — cross-carrier top_myga_5yr selection (5.0f)", () => {
  it("picks the non-NYL carrier when its fresh rate is higher (headline rate AND source citation both transition)", () => {
    setFrozenTime("2026-04-22T20:00:00.000Z");
    const nylFreshLow = mkNylRate("secure-term-mva-ii", 0.046, "2026-04-22");
    const pacificFreshHigh = mkPacificHarborRate(0.0515, "2026-04-22");
    const out = normalize(makeNormalizeInputs([nylFreshLow, pacificFreshHigh]));

    const top = out.benchmarkPanel.top_myga_5yr;
    // Headline rate is Pacific Harbor 5.15%, not NYL 4.60%.
    expect(top.status).toBe("live");
    expect(top.not_live_cause).toBeNull();
    expect(top.rate).toBeCloseTo(0.0515, 6);
    // Source citation references Pacific Life / Pacific Harbor, not NYL.
    expect(top.source).toContain("Pacific Harbor");
    expect(top.source).not.toContain("MVA II");
    expect(top.source).not.toContain("New York Life");
    // source_url points to the Pacific Life rate sheet.
    expect(top.source_url).toBe("https://ria.pacificlife.com/home/rates.html");

    // Both rates preserved in the manifest so /rates renders both rows.
    expect(out.mygaRates).toHaveLength(2);
    const carrierSet = new Set(out.mygaRates.map((r) => r.carrier_slug));
    expect(carrierSet).toEqual(new Set(["new-york-life", "pacific-life"]));
  });

  // ─── Test 2: Cross-carrier all-stale preservation (invariant ii) ───────
  //
  // Both NYL AND Pacific Harbor stale. Expected: degraded +
  // not_live_cause=stale_myga_rate, and the MAX-of-stale winner is
  // picked ACROSS CARRIERS (Pacific Harbor 5.15% still beats NYL
  // 4.60% even though both are stale). This re-affirms invariant (ii)
  // holds cross-carrier: demoted, not dropped, and the max is taken
  // over the union — not pinned to any single carrier.

  it("demotes to degraded + stale_myga_rate when ALL cross-carrier rates are stale, preserving the cross-carrier max (invariant ii across carriers)", () => {
    setFrozenTime("2026-04-30T00:00:00.000Z"); // both rates stale (>7 days)
    const nylStaleLow = mkNylRate("secure-term-mva-ii", 0.046, "2026-04-12");
    const pacificStaleHigh = mkPacificHarborRate(0.0515, "2026-04-14");
    const out = normalize(
      makeNormalizeInputs([nylStaleLow, pacificStaleHigh]),
    );

    const top = out.benchmarkPanel.top_myga_5yr;
    expect(top.status).toBe("degraded");
    expect(top.not_live_cause).toBe("stale_myga_rate");
    // Cross-carrier max-of-stale wins: Pacific Harbor 5.15% > NYL 4.60%.
    expect(top.rate).toBeCloseTo(0.0515, 6);
    expect(top.source).toContain("Pacific Harbor");
    expect(top.source).not.toContain("MVA II");
    expect(top.source_url).toBe("https://ria.pacificlife.com/home/rates.html");

    // Both rates still present in the manifest; /rates renders both
    // rows with stale chips.
    expect(out.mygaRates).toHaveLength(2);
    const carrierSet = new Set(out.mygaRates.map((r) => r.carrier_slug));
    expect(carrierSet).toEqual(new Set(["new-york-life", "pacific-life"]));

    // Human-readable all-stale note references the freshness window
    // and the stale_myga_rate cause.
    const staleNote = out.notes.find(
      (n) => /freshness window/i.test(n) && /stale_myga_rate/.test(n),
    );
    expect(staleNote).toBeDefined();
  });

  // ─── Test 3: Cross-carrier stale-fresh crossover (invariant i) ─────────
  //
  // This is the strongest version of invariant (i): the STALE rate
  // belongs to one carrier and is HIGHER; the FRESH rate belongs to
  // a DIFFERENT carrier and is LOWER. If the selection algorithm
  // were carrier-pinned (e.g. "always prefer NYL when available"),
  // this test would fail. It must pick the fresh lower rate across
  // the carrier boundary, re-affirming that freshness beats rate AND
  // that cross-carrier transitions work both ways (up in test 1,
  // down in test 3).

  it("falls back to the lower FRESH rate ACROSS carriers when the higher rate is STALE (invariant i across carriers)", () => {
    setFrozenTime("2026-04-22T20:00:00.000Z");
    // NYL higher at 5.00%, observed 10 days ago → stale.
    const nylStaleHigh = mkNylRate("secure-term-mva-ii", 0.05, "2026-04-12");
    // Pacific Harbor lower at 4.80%, observed today → fresh.
    const pacificFreshLow = mkPacificHarborRate(0.048, "2026-04-22");
    const out = normalize(
      makeNormalizeInputs([nylStaleHigh, pacificFreshLow]),
    );

    const top = out.benchmarkPanel.top_myga_5yr;
    // Card is LIVE and picks the FRESH LOWER cross-carrier rate.
    expect(top.status).toBe("live");
    expect(top.not_live_cause).toBeNull();
    expect(top.rate).toBeCloseTo(0.048, 6);
    expect(top.source).toContain("Pacific Harbor");
    expect(top.source).not.toContain("MVA II");
    expect(top.source_url).toBe("https://ria.pacificlife.com/home/rates.html");

    // NYL stale row still in the manifest (/rates renders it with its
    // own stale chip; it just doesn't claim the benchmark headline).
    expect(out.mygaRates).toHaveLength(2);
    const carrierSet = new Set(out.mygaRates.map((r) => r.carrier_slug));
    expect(carrierSet).toEqual(new Set(["new-york-life", "pacific-life"]));
  });
});
