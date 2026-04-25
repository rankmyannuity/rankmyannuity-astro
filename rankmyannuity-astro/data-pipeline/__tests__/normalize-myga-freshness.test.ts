// [Phase 5.0d · Decision 1 — Option B] Integration tests for the
// normalize-layer freshness decision on top_myga_5yr.
//
// Scope (user-ratified, verbatim): "one fresh qualifying rate ⇒
// normalize emits status=live, not_live_cause=null; one stale
// qualifying rate ⇒ normalize emits status=degraded,
// not_live_cause=stale_myga_rate AND the rate value is preserved in the
// manifest (demoted, not dropped)."
//
// These tests exercise the normalize branch in data-pipeline/normalize/
// index.ts where the freshness predicate splits live vs degraded for the
// top_myga_5yr benchmark. They are isolated from disk IO: we hand-build a
// minimal MdxCorpus with matching carrier + product slugs so that
// validateRateFKs does not reject the single seeded rate, and we control
// `now` via the PIPELINE_FROZEN_TIME environment variable (same mechanism
// the idempotency test uses).
//
// We intentionally do NOT construct real-shape MDX frontmatter — the
// benchmark panel is assembled BEFORE buildReviewSidecar runs, so any
// schema_failures from the sidecar stage are downstream of the assertions
// we care about. We still verify the assertions we care about (panel +
// notes) pass regardless of sidecar outcomes.

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

// ─── Fixture helpers ─────────────────────────────────────────────────────

// Minimal carrier record. Only `slug`, `kind`, and (for products)
// `frontmatter.product.carrierSlug` are read before the benchmark panel
// is assembled. The frontmatter cast mirrors phase5.test.ts.
function makeCarrierRecord(slug: string): MdxReviewRecord {
  return {
    slug,
    mdx_path: `reviews/${slug}`,
    kind: "carrier",
    // buildReviewSidecar reads `frontmatter.carrier.slug`. Keep the shape
    // minimal: only the fields normalize touches before
    // ReviewSidecarSchema.safeParse (which we expect to fail on this
    // stub — sidecar schema errors go into schema_failures and do NOT
    // block benchmarkPanel assembly, which is the unit under test).
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
    // validateMdxProductFKs reads `frontmatter.product.carrierSlug` and
    // buildReviewSidecar reads `frontmatter.product.slug`.
    frontmatter: {
      status: "pilot",
      product: { slug, carrierSlug },
    } as unknown as MdxReviewRecord["frontmatter"],
    body: "",
    file_sha256: "feedface".padEnd(64, "0"),
    file_path: `/tmp/${slug}.mdx`,
  };
}

function makeCorpus(
  carrierSlug: string,
  productSlug: string,
): MdxCorpus {
  return {
    carriers: [makeCarrierRecord(carrierSlug)],
    products: [makeProductRecord(productSlug, carrierSlug)],
  };
}

// Build a qualifying 5-year MygaRate with overridable observed_at.
function mkRate(overrides: Partial<MygaRate> = {}): MygaRate {
  return {
    carrier_slug: "new-york-life",
    product_slug: "new-york-life-secure-term-myga",
    product_variant: "Secure Term MVA II",
    product_variant_slug: "secure-term-mva-ii",
    term_years: 5,
    rate: 0.046,
    premium_band_min: 100000,
    premium_band_max: 1499999,
    effective_date: "2026-04-27",
    observed_at: "2026-04-22",
    source_name: "New York Life — nylannuities.com rate sheet",
    source_url: "https://www.nylannuities.com/resources/rates",
    ...overrides,
  };
}

// Stub TaggedAdapterSnapshot for the three non-MYGA benchmarks. Real
// values, all "live", adapter-ok so tagAdapterSnapshot tags them live.
function stubTaggedAdapter(
  adapter_id: AdapterBenchmarkSnapshot["adapter_id"],
  label: string,
  rate: number,
  source: string,
  source_url: string,
  as_of: string,
): TaggedAdapterSnapshot {
  return {
    snapshot: {
      label,
      rate,
      source,
      source_url,
      as_of,
      adapter_id,
    },
    adapter_status: "ok",
  };
}

function makeNormalizeInputs(
  rate: MygaRate,
  mdx: MdxCorpus,
): NormalizeInputs {
  const mygaRates: MygaRatesFile = { rates: [rate] };
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

// ─── Time control via PIPELINE_FROZEN_TIME ──────────────────────────────
//
// data-pipeline/adapters/types.ts::now() honors PIPELINE_FROZEN_TIME. By
// setting it in each test we get deterministic freshness calculations
// without mocking timers (which would be fragile against the rest of the
// pipeline).

const ORIGINAL_FROZEN_TIME = process.env.PIPELINE_FROZEN_TIME;

function setFrozenTime(iso: string): void {
  process.env.PIPELINE_FROZEN_TIME = iso;
}

beforeEach(() => {
  // Each test sets its own; ensure no leak from a sibling test module.
  delete process.env.PIPELINE_FROZEN_TIME;
});

afterEach(() => {
  if (ORIGINAL_FROZEN_TIME === undefined) {
    delete process.env.PIPELINE_FROZEN_TIME;
  } else {
    process.env.PIPELINE_FROZEN_TIME = ORIGINAL_FROZEN_TIME;
  }
});

// ─── Fresh path ─────────────────────────────────────────────────────────

describe("normalize — top_myga_5yr freshness (5.0d)", () => {
  it("emits status='live' and not_live_cause=null for a qualifying rate inside the 7-day freshness window", () => {
    // Observed 3 days before frozen-now: well inside the 7-day window.
    setFrozenTime("2026-04-22T20:00:00.000Z");
    const rate = mkRate({ observed_at: "2026-04-19" });
    const corpus = makeCorpus("new-york-life", "new-york-life-secure-term-myga");
    const inputs = makeNormalizeInputs(rate, corpus);

    const out = normalize(inputs);

    const top = out.benchmarkPanel.top_myga_5yr;
    expect(top.status).toBe("live");
    expect(top.not_live_cause).toBeNull();
    // Rate is preserved verbatim (round4 is a no-op on 0.046).
    expect(top.rate).toBeCloseTo(0.046, 6);
    expect(top.source).toContain("New York Life");

    // Rate remains present in the manifest's mygaRates list.
    expect(out.mygaRates).toHaveLength(1);
    expect(out.mygaRates[0].product_variant_slug).toBe("secure-term-mva-ii");

    // No stale-specific note should be emitted on the fresh path.
    const staleNote = out.notes.find((n) => /freshness window/i.test(n));
    expect(staleNote).toBeUndefined();
  });

  // ─── Stale path (demoted, not dropped) ────────────────────────────────

  it("emits status='degraded' + not_live_cause='stale_myga_rate' for a qualifying rate older than 7 days, and preserves the rate value", () => {
    // Observed 10 days before frozen-now: strictly past the window.
    setFrozenTime("2026-04-25T00:00:00.000Z");
    const rate = mkRate({ observed_at: "2026-04-15" }); // 10 days old
    const corpus = makeCorpus("new-york-life", "new-york-life-secure-term-myga");
    const inputs = makeNormalizeInputs(rate, corpus);

    const out = normalize(inputs);

    const top = out.benchmarkPanel.top_myga_5yr;
    expect(top.status).toBe("degraded");
    expect(top.not_live_cause).toBe("stale_myga_rate");
    // CRITICAL: the rate value is preserved (not zeroed). This is the
    // "demoted, not dropped" rule from the 5.0d kickoff.
    expect(top.rate).toBeCloseTo(0.046, 6);

    // The rate also remains in the sorted mygaRates manifest so the
    // /rates table still renders it with a stale chip.
    expect(out.mygaRates).toHaveLength(1);
    expect(out.mygaRates[0].product_variant_slug).toBe("secure-term-mva-ii");
    expect(out.mygaRates[0].observed_at).toBe("2026-04-15");

    // A human-readable stale note should be written to REVIEW.md.
    const staleNote = out.notes.find((n) => /freshness window/i.test(n));
    expect(staleNote).toBeDefined();
    expect(staleNote).toMatch(/stale_myga_rate/);
    expect(staleNote).toMatch(/new-york-life/);
  });

  // ─── Boundary: exactly 7 days old is still fresh (inclusive) ──────────

  it("treats exactly 7 days old as fresh (inclusive upper boundary on the freshness window)", () => {
    // observed midnight UTC + exactly 7 days → age = 7.0 days → fresh.
    setFrozenTime("2026-04-22T00:00:00.000Z");
    const rate = mkRate({ observed_at: "2026-04-15" });
    const corpus = makeCorpus("new-york-life", "new-york-life-secure-term-myga");
    const inputs = makeNormalizeInputs(rate, corpus);

    const out = normalize(inputs);

    expect(out.benchmarkPanel.top_myga_5yr.status).toBe("live");
    expect(out.benchmarkPanel.top_myga_5yr.not_live_cause).toBeNull();
  });
});
