// Adapter tests — verify every adapter works offline against its bundled
// fixtures, and that it reports the right provenance record. These tests
// NEVER hit the network (PIPELINE_OFFLINE=1 forced at top of file).

import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { loadMygaRates, loadCuratedBenchmarks } from "../adapters/curated-yaml.js";
import { loadMdxReviews } from "../adapters/mdx.js";
import { fetchFredSeries, DGS10_CONFIG, DGS1_CONFIG } from "../adapters/fred.js";
import { fetchTreasuryDirect10Yr } from "../adapters/treasury-direct.js";
import { fetchFdicCd5Yr } from "../adapters/fdic-cd.js";

const projectRoot = resolve(__dirname, "..", "..");
const pipelineRoot = resolve(__dirname, "..");

beforeAll(() => {
  process.env.PIPELINE_OFFLINE = "1";
  process.env.PIPELINE_FROZEN_TIME = "2026-04-21T20:00:00.000Z";
  delete process.env.FRED_API_KEY; // force offline path
});

describe("curated-yaml adapter", () => {
  it("loads rates.myga.yml (5.0d: single NYL Secure Term MVA II seed)", () => {
    // [Phase 5.0d] The pilot corpus is no longer empty — the NYL
    // "Secure Term MVA II" 5-yr $100k+ rate was seeded as the first
    // real MYGA entry. Invariants that survive future seeds:
    //   - loader succeeds
    //   - rates array is non-empty
    //   - every rate carries the 5.0d fields (product_variant /
    //     product_variant_slug / observed_at) so normalize's freshness
    //     predicate can run against it.
    const r = loadMygaRates(pipelineRoot);
    expect(r.status).toBe("ok");
    const rates = r.data?.rates ?? [];
    expect(rates.length).toBeGreaterThan(0);
    for (const rate of rates) {
      expect(rate.product_variant.length).toBeGreaterThan(0);
      expect(rate.product_variant_slug).toMatch(/^[a-z0-9-]+$/);
      expect(rate.observed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(r.provenance.adapter_id).toBe("curated-yaml");
    expect(r.provenance.http_status).toBeNull();
    expect(r.provenance.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("loads benchmarks.curated.yml", () => {
    const r = loadCuratedBenchmarks(pipelineRoot);
    expect(r.status).toBe("ok");
    expect(r.data?.sp500_historical.rate).toBe(0.1);
    expect(r.provenance.record_count).toBe(1);
  });
});

describe("mdx adapter", () => {
  it("loads carrier + product MDX and validates their frontmatter", () => {
    // [Phase 5.0b] Corpus grew from Athene-only (pilot) to Athene + 10
    // wave-1 carriers. This test asserts INVARIANTS that survive further
    // wave expansions rather than an exact-match slug list:
    //   - loader succeeds with no errors
    //   - Athene (the original pilot) remains present
    //   - every product's carrierSlug resolves to a carrier in the corpus
    //     (FK-shaped invariant; runtime FK check is in normalize)
    //   - at least one wave-1 carrier is present (smoke-tests the scaffold batch)
    const r = loadMdxReviews(projectRoot);
    expect(r.status).toBe("ok");
    expect(r.errors).toEqual([]);

    const carrierSlugs = r.data?.carriers.map((c) => c.slug) ?? [];
    const productSlugs = r.data?.products.map((p) => p.slug) ?? [];
    expect(carrierSlugs).toContain("athene");
    expect(productSlugs).toContain("athene-performance-elite");
    // Wave-1 smoke check: New York Life is LIMRA rank #2 after Athene and
    // is the first wave-1 carrier per PHASE5_KICKOFF.md §2.
    expect(carrierSlugs).toContain("new-york-life");

    // FK-shape: every product.carrierSlug resolves.
    const carrierSet = new Set(carrierSlugs);
    for (const p of r.data?.products ?? []) {
      expect(carrierSet.has(p.frontmatter.product.carrierSlug)).toBe(true);
    }
  });
  it("outputs deterministic ordering (sorted by slug)", () => {
    const a = loadMdxReviews(projectRoot);
    const b = loadMdxReviews(projectRoot);
    expect(a.data?.carriers.map((c) => c.slug)).toEqual(b.data?.carriers.map((c) => c.slug));
    expect(a.data?.products.map((p) => p.slug)).toEqual(b.data?.products.map((p) => p.slug));
  });
});

describe("fred adapter (offline)", () => {
  it("returns DGS10 from fixture", async () => {
    const r = await fetchFredSeries(DGS10_CONFIG, { pipelineRoot });
    expect(r.status).toBe("ok");
    expect(r.data?.rate).toBeCloseTo(0.0435, 4);
    expect(r.data?.adapter_id).toBe("fred");
    expect(r.provenance.cached).toBe(true);
  });
  it("returns DGS1 from fixture", async () => {
    const r = await fetchFredSeries(DGS1_CONFIG, { pipelineRoot });
    expect(r.status).toBe("ok");
    expect(r.data?.rate).toBeCloseTo(0.0478, 4);
  });
  it("records a schema failure if fixture data somehow exceeds the hard cap", async () => {
    // Use a forged in-memory fetch that returns an over-cap value. Even in
    // offline mode, we can test the schema-validation path by calling with
    // { offline: false } and a custom fetchFn.
    const r = await fetchFredSeries(DGS10_CONFIG, {
      pipelineRoot,
      offline: false,
      apiKey: "test",
      fetchFn: (async () =>
        new Response(
          JSON.stringify({ observations: [{ date: "2026-04-17", value: "999.9" }] }),
          { status: 200 },
        )) as unknown as typeof fetch,
    });
    expect(r.status).toBe("failed");
    expect(r.errors.join(" ")).toMatch(/schema/i);
  });
});

describe("treasury-direct adapter (offline)", () => {
  it("returns the 10-yr cross-check rate from fixture", async () => {
    const r = await fetchTreasuryDirect10Yr({ pipelineRoot });
    expect(r.status).toBe("ok");
    expect(r.data?.rate).toBeCloseTo(0.0434, 4);
    expect(r.data?.adapter_id).toBe("treasury-direct");
  });
});

describe("fdic-cd adapter (offline)", () => {
  it("returns 5-yr CD from fixture", async () => {
    const r = await fetchFdicCd5Yr({ pipelineRoot });
    expect(r.status).toBe("ok");
    // Round the float-artifact away at 4 decimals; adapter itself reports
    // raw /100, normalize layer is what rounds. Tolerance captures that.
    expect(r.data?.rate).toBeCloseTo(0.0185, 4);
    expect(r.data?.adapter_id).toBe("fdic-cd");
  });
});
