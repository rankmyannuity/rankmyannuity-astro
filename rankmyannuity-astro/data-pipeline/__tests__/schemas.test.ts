// Schema round-trip tests — every schema must accept a canonical valid
// record and reject common mistakes. If this file turns red, a schema
// change has broken an implicit contract upstream (usually MDX or YAML).

import { describe, it, expect } from "vitest";
import { CarrierFrontmatterSchema } from "../schemas/carrier.js";
import { ProductFrontmatterSchema } from "../schemas/product.js";
import {
  MygaRateSchema,
  MygaRatesFileSchema,
  BenchmarkSnapshotSchema,
  CuratedBenchmarksFileSchema,
} from "../schemas/rate.js";
import { ReviewSidecarSchema } from "../schemas/review.js";
import { ManifestSchema, PIPELINE_VERSION } from "../schemas/manifest.js";

// ─── Carrier ────────────────────────────────────────────────────────────
const validCarrier = {
  kind: "carrier",
  title: "T",
  description: "D",
  publishedAt: "2026-01-01",
  updatedAt: "2026-01-01",
  author: { name: "X" },
  tags: [],
  carrier: {
    slug: "athene",
    legalName: "Athene",
    displayName: "Athene",
    domicile: "IA",
    ratings: {},
  },
  sources: [],
  relatedReviews: [],
  relatedArticles: [],
  // [Phase 5] pilot is the default status for existing and newly-authored
  // carriers; shipping requires an approval row in carriers.shipping.yml.
  status: "pilot" as const,
};

describe("CarrierFrontmatterSchema", () => {
  it("accepts a canonical carrier record", () => {
    expect(CarrierFrontmatterSchema.parse(validCarrier).kind).toBe("carrier");
  });
  it("rejects kind='product'", () => {
    expect(() => CarrierFrontmatterSchema.parse({ ...validCarrier, kind: "product" })).toThrow();
  });
  it("rejects unexpected top-level keys (strict mode)", () => {
    expect(() => CarrierFrontmatterSchema.parse({ ...validCarrier, bogusField: 1 })).toThrow();
  });
  it("rejects an invalid slug format", () => {
    expect(() =>
      CarrierFrontmatterSchema.parse({ ...validCarrier, carrier: { ...validCarrier.carrier, slug: "Has Space" } }),
    ).toThrow();
  });

  // [Phase 5] Required status field
  it("rejects a carrier missing status", () => {
    const { status, ...withoutStatus } = validCarrier;
    expect(() => CarrierFrontmatterSchema.parse(withoutStatus)).toThrow();
  });
  it("rejects a carrier with an unknown status value", () => {
    expect(() => CarrierFrontmatterSchema.parse({ ...validCarrier, status: "draft" })).toThrow();
  });

  // [Phase 5] .superRefine — status='shipping' requires shipping_criteria
  it("rejects status='shipping' without shipping_criteria", () => {
    expect(() =>
      CarrierFrontmatterSchema.parse({ ...validCarrier, status: "shipping" }),
    ).toThrow(/shipping_criteria is required/);
  });
  it("accepts status='shipping' with full shipping_criteria", () => {
    const shipping = {
      ...validCarrier,
      status: "shipping" as const,
      shipping_criteria: {
        rates_logged: true,
        rates_not_applicable: false,
        products_reviewed: true,
        legal_approved: true,
        compliance_approved: true,
        sme_reviewed: true,
      },
    };
    expect(CarrierFrontmatterSchema.parse(shipping).status).toBe("shipping");
  });

  // [Phase 5] .superRefine — rates_not_applicable requires reason
  it("rejects rates_not_applicable=true without a reason", () => {
    const bad = {
      ...validCarrier,
      status: "shipping" as const,
      shipping_criteria: {
        rates_logged: false,
        rates_not_applicable: true,
        products_reviewed: true,
        legal_approved: true,
        compliance_approved: true,
        sme_reviewed: true,
      },
    };
    expect(() => CarrierFrontmatterSchema.parse(bad)).toThrow(
      /rates_not_applicable_reason is required/,
    );
  });
  it("accepts rates_not_applicable=true with a non-empty reason", () => {
    const ok = {
      ...validCarrier,
      status: "shipping" as const,
      shipping_criteria: {
        rates_logged: false,
        rates_not_applicable: true,
        rates_not_applicable_reason: "FIA-only carrier \u2014 no MYGA product in scope",
        products_reviewed: true,
        legal_approved: true,
        compliance_approved: true,
        sme_reviewed: true,
      },
    };
    expect(CarrierFrontmatterSchema.parse(ok).shipping_criteria?.rates_not_applicable).toBe(true);
  });

  // [Phase 5] .superRefine — retired requires retired_reason
  it("rejects status='retired' without retired_reason", () => {
    expect(() =>
      CarrierFrontmatterSchema.parse({ ...validCarrier, status: "retired" }),
    ).toThrow(/retired_reason is required/);
  });
  it("accepts status='retired' with a non-empty retired_reason", () => {
    const retired = {
      ...validCarrier,
      status: "retired" as const,
      retired_reason: "Carrier exited the US fixed-annuity market 2026-03-14.",
    };
    expect(CarrierFrontmatterSchema.parse(retired).retired_reason).toMatch(/exited/);
  });
});

// ─── Product ────────────────────────────────────────────────────────────
const validProduct = {
  kind: "product",
  title: "T",
  description: "D",
  publishedAt: "2026-01-01",
  updatedAt: "2026-01-01",
  author: { name: "X" },
  tags: [],
  product: {
    slug: "athene-performance-elite",
    name: "Athene Performance Elite",
    carrierSlug: "athene",
    carrierName: "Athene",
    productType: "FIA",
    surrenderYears: 10,
    mvAllowed: true,
    featuredIndexes: [],
  },
  sources: [],
  relatedReviews: [],
  relatedArticles: [],
  // [Phase 5] product-level status mirrors the carrier enum.
  status: "pilot" as const,
};

describe("ProductFrontmatterSchema", () => {
  it("accepts a canonical FIA product", () => {
    expect(ProductFrontmatterSchema.parse(validProduct).product.productType).toBe("FIA");
  });
  it("rejects an unknown productType", () => {
    expect(() =>
      ProductFrontmatterSchema.parse({ ...validProduct, product: { ...validProduct.product, productType: "FOO" } }),
    ).toThrow();
  });
  it("rejects featuredCapRate above 100%", () => {
    expect(() =>
      ProductFrontmatterSchema.parse({
        ...validProduct,
        product: { ...validProduct.product, featuredCapRate: 1.5 },
      }),
    ).toThrow();
  });

  // [Phase 5] Required status
  it("rejects a product missing status", () => {
    const { status, ...withoutStatus } = validProduct;
    expect(() => ProductFrontmatterSchema.parse(withoutStatus)).toThrow();
  });
  // [Phase 5] .superRefine — retired requires retired_reason
  it("rejects product status='retired' without retired_reason", () => {
    expect(() =>
      ProductFrontmatterSchema.parse({ ...validProduct, status: "retired" }),
    ).toThrow(/retired_reason is required/);
  });
  it("accepts product status='retired' with a non-empty retired_reason", () => {
    const retired = {
      ...validProduct,
      status: "retired" as const,
      retired_reason: "Share class discontinued 2026-02-01.",
    };
    expect(ProductFrontmatterSchema.parse(retired).retired_reason).toMatch(/discontinued/);
  });
});

// ─── Rate ────────────────────────────────────────────────────────────────
const validRate = {
  carrier_slug: "athene",
  product_slug: "athene-myga-5",
  // [Phase 5.0d] product_variant / product_variant_slug / observed_at
  // are required by MygaRateSchema. Add defaults here so existing
  // structural tests (canonical rate, band nullability, file shape)
  // keep working without touching each inline spread.
  product_variant: "Athene MYGA 5",
  product_variant_slug: "athene-myga-5",
  term_years: 5,
  rate: 0.0555,
  premium_band_min: 100000,
  premium_band_max: 499999,
  effective_date: "2026-04-15",
  observed_at: "2026-04-15",
  source_name: "test",
  source_url: "https://example.com/rates",
};

describe("MygaRateSchema", () => {
  it("accepts a canonical rate", () => {
    expect(MygaRateSchema.parse(validRate).rate).toBe(0.0555);
  });
  it("rejects a rate above the 25% cap", () => {
    expect(() => MygaRateSchema.parse({ ...validRate, rate: 0.5 })).toThrow();
  });
  it("rejects a bad effective_date format", () => {
    expect(() => MygaRateSchema.parse({ ...validRate, effective_date: "2026/04/15" })).toThrow();
  });
  it("allows null premium_band_max", () => {
    expect(MygaRateSchema.parse({ ...validRate, premium_band_max: null }).premium_band_max).toBeNull();
  });
});

describe("MygaRatesFileSchema", () => {
  it("accepts an empty rates array (pilot scope)", () => {
    expect(MygaRatesFileSchema.parse({ rates: [] }).rates).toEqual([]);
  });
  it("accepts a single rate", () => {
    expect(MygaRatesFileSchema.parse({ rates: [validRate] }).rates.length).toBe(1);
  });
});

// ─── Benchmark snapshot ──────────────────────────────────────────────────
const validBench = {
  label: "10-yr Treasury",
  rate: 0.0435,
  source: "FRED DGS10",
  source_url: "https://fred.stlouisfed.org/series/DGS10",
  as_of: "2026-04-17",
  adapter_id: "fred" as const,
  // [Phase 5] status required; a canonical non-zero rate is "live".
  status: "live" as const,
  // [Phase 5.0d] not_live_cause required; null for live benchmarks.
  not_live_cause: null,
};

describe("BenchmarkSnapshotSchema", () => {
  it("accepts canonical benchmark", () => {
    expect(BenchmarkSnapshotSchema.parse(validBench).adapter_id).toBe("fred");
  });
  it("rejects an unknown adapter_id", () => {
    expect(() => BenchmarkSnapshotSchema.parse({ ...validBench, adapter_id: "mystery" })).toThrow();
  });
  it("accepts a slightly-negative rate (deflation edge)", () => {
    expect(BenchmarkSnapshotSchema.parse({ ...validBench, rate: -0.001 }).rate).toBe(-0.001);
  });
  // [Phase 5] Status field — required, enum-constrained, and mutually
  // exclusive with rate via .superRefine (rate===0 ⇔ status==="pilot_empty").
  it("rejects a benchmark missing the status field", () => {
    const { status: _omit, ...noStatus } = validBench;
    void _omit;
    expect(() => BenchmarkSnapshotSchema.parse(noStatus)).toThrow();
  });
  it("rejects an unknown status value", () => {
    expect(() =>
      BenchmarkSnapshotSchema.parse({ ...validBench, status: "stale" }),
    ).toThrow();
  });
  it("accepts status=pilot_empty when rate === 0", () => {
    const empty = { ...validBench, rate: 0, status: "pilot_empty" as const };
    expect(BenchmarkSnapshotSchema.parse(empty).status).toBe("pilot_empty");
  });
  it("accepts status=degraded with a non-zero rate and a concrete not_live_cause", () => {
    // [Phase 5.0d] Decision 3 strictness: degraded requires a cause.
    const degraded = {
      ...validBench,
      status: "degraded" as const,
      not_live_cause: "stale_myga_rate" as const,
    };
    expect(BenchmarkSnapshotSchema.parse(degraded).status).toBe("degraded");
  });
  it("rejects status=pilot_empty when rate !== 0", () => {
    expect(() =>
      BenchmarkSnapshotSchema.parse({ ...validBench, status: "pilot_empty" }),
    ).toThrow(/pilot_empty.*rate/i);
  });
  it("rejects rate === 0 with a non-pilot_empty status", () => {
    expect(() =>
      BenchmarkSnapshotSchema.parse({ ...validBench, rate: 0, status: "live" }),
    ).toThrow(/rate.*0.*pilot_empty/i);
    expect(() =>
      BenchmarkSnapshotSchema.parse({
        ...validBench,
        rate: 0,
        status: "degraded",
        not_live_cause: "stale_myga_rate",
      }),
    ).toThrow(/rate.*0.*pilot_empty/i);
  });

  // ─── [Phase 5.0d] not_live_cause × status mutual-exclusivity refine ───
  //
  // Decision 3 — Option X + Y strictness: `status === "degraded"` ⇔
  // `not_live_cause !== null`. These tests pin the four interesting
  // points of the truth table so any future edit to the inline refine
  // that drifts from the invariant fails in CI rather than silently.
  it("rejects status=degraded with not_live_cause === null", () => {
    expect(() =>
      BenchmarkSnapshotSchema.parse({
        ...validBench,
        status: "degraded",
        not_live_cause: null,
      }),
    ).toThrow(/degraded.*not_live_cause/i);
  });
  it("rejects status=live with a concrete not_live_cause", () => {
    expect(() =>
      BenchmarkSnapshotSchema.parse({
        ...validBench,
        status: "live",
        not_live_cause: "stale_myga_rate",
      }),
    ).toThrow(/not_live_cause.*null.*live/i);
  });
  it("rejects status=pilot_empty with a concrete not_live_cause", () => {
    expect(() =>
      BenchmarkSnapshotSchema.parse({
        ...validBench,
        rate: 0,
        status: "pilot_empty",
        not_live_cause: "stale_myga_rate",
      }),
    ).toThrow(/not_live_cause.*null.*pilot_empty/i);
  });
  it("accepts status=live with not_live_cause === null (canonical)", () => {
    expect(
      BenchmarkSnapshotSchema.parse({ ...validBench }).not_live_cause,
    ).toBeNull();
  });
  it("accepts status=pilot_empty with not_live_cause === null", () => {
    const empty = {
      ...validBench,
      rate: 0,
      status: "pilot_empty" as const,
      not_live_cause: null,
    };
    expect(BenchmarkSnapshotSchema.parse(empty).not_live_cause).toBeNull();
  });
  it("rejects an unknown not_live_cause value", () => {
    expect(() =>
      BenchmarkSnapshotSchema.parse({
        ...validBench,
        status: "degraded",
        not_live_cause: "mystery_cause",
      }),
    ).toThrow();
  });
});

describe("CuratedBenchmarksFileSchema", () => {
  it("accepts canonical sp500_historical", () => {
    const v = {
      sp500_historical: {
        rate: 0.1,
        source: "NYU Stern",
        source_url: "https://example.com/",
        as_of: "2026-01-01",
      },
    };
    expect(CuratedBenchmarksFileSchema.parse(v).sp500_historical.rate).toBe(0.1);
  });
});

// ─── Review sidecar ──────────────────────────────────────────────────────
const validSidecar = {
  slug: "athene",
  kind: "carrier" as const,
  mdx_path: "reviews/athene",
  carrier_slug: "athene",
  product_slug: null,
  linked_rate: null,
  benchmark_delta: null,
  computed_grade: null,
  // [Phase 5] Pilot carriers (Athene is pilot in the wave-0 corpus) emit
  // a not_live sidecar with cause pilot_carrier. Keep this fixture aligned
  // with the Athene migration in src/content/reviews/athene*.mdx.
  status: "not_live" as const,
  not_live_cause: "pilot_carrier" as const,
  generated_at: "2026-04-21T20:00:00Z",
  pipeline_version: PIPELINE_VERSION,
};

describe("ReviewSidecarSchema", () => {
  it("accepts a carrier sidecar with null rate+grade", () => {
    expect(ReviewSidecarSchema.parse(validSidecar).slug).toBe("athene");
  });
  it("rejects a source_fn that is not calculatorMath.gradeRate (methodology drift guard)", () => {
    expect(() =>
      ReviewSidecarSchema.parse({
        ...validSidecar,
        computed_grade: {
          rate_used: 0.06,
          letter: "A",
          grade_class: "grade-a",
          grade_label: "Strong",
          source_fn: "someOtherFn",
        },
      }),
    ).toThrow();
  });
  it("rejects a pipeline_version that does not match the literal", () => {
    // Any prior-release string is an invalid consumer-facing version. This
    // test's whole purpose is to guard against stale sidecars being read as
    // current; picking the previous release as the negative fixture makes
    // the drift scenario literal.
    expect(() => ReviewSidecarSchema.parse({ ...validSidecar, pipeline_version: "0.4.0" })).toThrow();
  });
  // [Phase 5] status + not_live_cause pair invariant.
  it("accepts a live sidecar with not_live_cause === null", () => {
    const live = { ...validSidecar, status: "live" as const, not_live_cause: null };
    expect(ReviewSidecarSchema.parse(live).status).toBe("live");
  });
  it("rejects a sidecar missing the status field", () => {
    const { status: _omit, ...noStatus } = validSidecar;
    void _omit;
    expect(() => ReviewSidecarSchema.parse(noStatus)).toThrow();
  });
  it("rejects an unknown not_live_cause value", () => {
    expect(() =>
      ReviewSidecarSchema.parse({ ...validSidecar, not_live_cause: "mystery" }),
    ).toThrow();
  });
  it("rejects status=live with a non-null not_live_cause", () => {
    expect(() =>
      ReviewSidecarSchema.parse({
        ...validSidecar,
        status: "live",
        not_live_cause: "pilot_carrier",
      }),
    ).toThrow(/live.*not_live_cause/i);
  });
  it("rejects status=not_live with a null not_live_cause", () => {
    expect(() =>
      ReviewSidecarSchema.parse({
        ...validSidecar,
        status: "not_live",
        not_live_cause: null,
      }),
    ).toThrow(/not_live.*not_live_cause/i);
  });
  it("accepts each of the four closed not_live_cause values", () => {
    for (const cause of [
      "pilot_carrier",
      "degraded_benchmark",
      "empty_benchmark",
      "retired_carrier",
    ] as const) {
      const s = {
        ...validSidecar,
        status: "not_live" as const,
        not_live_cause: cause,
      };
      expect(ReviewSidecarSchema.parse(s).not_live_cause).toBe(cause);
    }
  });
});

// ─── Manifest ────────────────────────────────────────────────────────────
describe("ManifestSchema", () => {
  it("accepts a minimal empty manifest", () => {
    const m = {
      run_id: "2026-04-21T20:00:00Z",
      pipeline_version: PIPELINE_VERSION,
      run_mode: "test" as const,
      sources: [],
      counts: { carriers: 0, products: 0, rates: 0, benchmarks: 0, reviews: 0 },
      diff_vs_previous: {
        previous_snapshot: null,
        added: 0,
        removed: 0,
        modified: 0,
        threshold_breaches: [],
      },
      conflicts: [],
      missing_required: [],
      schema_failures: [],
      status: "ready_for_review" as const,
      // [Phase 5] New required fields.
      frozen_time: null,
      first_published_run: true,
    };
    expect(ManifestSchema.parse(m).status).toBe("ready_for_review");
  });

  // [Phase 5] Manifest requires frozen_time (nullable) and first_published_run
  // so downstream gates can read them without defensive checks. A missing
  // field must be rejected so older manifests (pre-0.5.0) fail loudly.
  it("rejects manifest without frozen_time", () => {
    const m: Record<string, unknown> = {
      run_id: "2026-04-21T20:00:00Z",
      pipeline_version: PIPELINE_VERSION,
      run_mode: "test" as const,
      sources: [],
      counts: { carriers: 0, products: 0, rates: 0, benchmarks: 0, reviews: 0 },
      diff_vs_previous: {
        previous_snapshot: null,
        added: 0,
        removed: 0,
        modified: 0,
        threshold_breaches: [],
      },
      conflicts: [],
      missing_required: [],
      schema_failures: [],
      status: "ready_for_review" as const,
      first_published_run: true,
      // frozen_time missing
    };
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it("rejects manifest without first_published_run", () => {
    const m: Record<string, unknown> = {
      run_id: "2026-04-21T20:00:00Z",
      pipeline_version: PIPELINE_VERSION,
      run_mode: "test" as const,
      sources: [],
      counts: { carriers: 0, products: 0, rates: 0, benchmarks: 0, reviews: 0 },
      diff_vs_previous: {
        previous_snapshot: null,
        added: 0,
        removed: 0,
        modified: 0,
        threshold_breaches: [],
      },
      conflicts: [],
      missing_required: [],
      schema_failures: [],
      status: "ready_for_review" as const,
      frozen_time: null,
      // first_published_run missing
    };
    expect(() => ManifestSchema.parse(m)).toThrow();
  });
});
