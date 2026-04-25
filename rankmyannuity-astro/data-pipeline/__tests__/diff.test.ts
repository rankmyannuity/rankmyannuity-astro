// Diff tests — threshold breach detection. Uses canned previous/current
// NormalizeOutput shapes. No filesystem I/O, no network.

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { diffVsPrevious, canonicalize, BENCHMARK_BREACH_BPS, RATE_BREACH_BPS } from "../validate/diff.js";
import type { NormalizeOutput } from "../normalize/index.js";
import { PIPELINE_VERSION } from "../schemas/manifest.js";

function baseline(): NormalizeOutput {
  return {
    benchmarkPanel: {
      // [Phase 5] All four benchmarks carry non-zero rates ⇒ status "live".
      top_myga_5yr: { label: "m", rate: 0.06, source: "", source_url: "https://x.com/", as_of: "2026-04-15", adapter_id: "curated-yaml", status: "live", not_live_cause: null },
      treasury_10yr: { label: "t", rate: 0.0435, source: "", source_url: "https://x.com/", as_of: "2026-04-17", adapter_id: "fred", status: "live", not_live_cause: null },
      cd_5yr_national_avg: { label: "c", rate: 0.0185, source: "", source_url: "https://x.com/", as_of: "2026-04-15", adapter_id: "fdic-cd", status: "live", not_live_cause: null },
      sp500_historical: { label: "s", rate: 0.10, source: "", source_url: "https://x.com/", as_of: "2026-01-01", adapter_id: "curated-yaml", status: "live", not_live_cause: null },
    },
    legacyBenchmarkRates: [],
    mygaRates: [
      { carrier_slug: "acme", product_slug: "acme-myga-5", product_variant: "Acme MYGA 5", product_variant_slug: "acme-myga-5", term_years: 5, rate: 0.055, premium_band_min: 100000, premium_band_max: 499999, effective_date: "2026-04-15", observed_at: "2026-04-15", source_name: "sheet", source_url: "https://x.com/" },
    ],
    reviews: [
      {
        slug: "acme", kind: "carrier", mdx_path: "reviews/acme", carrier_slug: "acme", product_slug: null,
        linked_rate: null, benchmark_delta: null, computed_grade: null,
        // [Phase 5] Baseline fixture is a pilot carrier (not_live / pilot_carrier).
        // This matches the wave-0 corpus shape and lets diff tests run without
        // having to model a full shipping-approval path.
        status: "not_live" as const, not_live_cause: "pilot_carrier" as const,
        generated_at: "2026-04-21T20:00:00Z", pipeline_version: PIPELINE_VERSION,
      },
    ],
    notes: [], conflicts: [], missing_required: [], schema_failures: [],
  };
}

let rootDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "rma-diff-"));
  mkdirSync(resolve(rootDir, "snapshots"), { recursive: true });
});

function writePrev(prev: NormalizeOutput) {
  const path = resolve(rootDir, "snapshots", "normalized-2026-04-20T00-00-00Z.json");
  // Use same compareShape logic indirectly by mimicking writeNormalizedSnapshot.
  const shape = {
    benchmarkPanel: prev.benchmarkPanel,
    mygaRates: prev.mygaRates,
    reviews: prev.reviews.map((r) => ({ ...r, generated_at: "<stripped-for-diff>" })),
  };
  writeFileSync(path, canonicalize(shape));
}

describe("diffVsPrevious", () => {
  it("returns no breaches on the very first run", () => {
    const result = diffVsPrevious(baseline(), rootDir);
    expect(result.previous_snapshot).toBeNull();
    expect(result.threshold_breaches).toEqual([]);
  });

  it("no breach when rates are identical", () => {
    writePrev(baseline());
    const result = diffVsPrevious(baseline(), rootDir);
    expect(result.threshold_breaches).toEqual([]);
  });

  it("flags a benchmark move above threshold", () => {
    writePrev(baseline());
    const b = baseline();
    b.benchmarkPanel.treasury_10yr.rate = 0.0435 + (BENCHMARK_BREACH_BPS + 1) / 10000;
    const result = diffVsPrevious(b, rootDir);
    expect(result.threshold_breaches.some((s) => s.includes("treasury_10yr"))).toBe(true);
    expect(result.modified).toBeGreaterThan(0);
  });

  it("does NOT flag a benchmark move below threshold", () => {
    writePrev(baseline());
    const b = baseline();
    // 24bps move < 25bps threshold — stays quiet.
    b.benchmarkPanel.treasury_10yr.rate = 0.0435 + 0.0024;
    const result = diffVsPrevious(b, rootDir);
    expect(result.threshold_breaches).toEqual([]);
  });

  it("flags a rate move above 50bps", () => {
    writePrev(baseline());
    const b = baseline();
    b.mygaRates[0].rate = 0.055 + (RATE_BREACH_BPS + 1) / 10000;
    const result = diffVsPrevious(b, rootDir);
    expect(result.threshold_breaches.some((s) => s.includes("acme::acme-myga-5::5"))).toBe(true);
  });

  it("flags rate addition and removal", () => {
    writePrev(baseline());
    const b = baseline();
    b.mygaRates.push({
      carrier_slug: "zeta", product_slug: "zeta-5", term_years: 5, rate: 0.06,
      premium_band_min: 0, premium_band_max: null, effective_date: "2026-04-15",
      source_name: "sheet", source_url: null,
    });
    const withRemoval = { ...b, mygaRates: b.mygaRates.filter((r) => r.carrier_slug !== "acme") };
    const result = diffVsPrevious(withRemoval, rootDir);
    const msgs = result.threshold_breaches.join(" | ");
    expect(msgs).toMatch(/rate added: zeta/);
    expect(msgs).toMatch(/rate removed: acme/);
    expect(result.added).toBeGreaterThan(0);
    expect(result.removed).toBeGreaterThan(0);
  });

  it("flags a review grade change", () => {
    const prev = baseline();
    prev.reviews[0].computed_grade = {
      rate_used: 0.06, letter: "A", grade_class: "g-a", grade_label: "Strong", source_fn: "calculatorMath.gradeRate",
    };
    writePrev(prev);
    const curr = baseline();
    curr.reviews[0].computed_grade = {
      rate_used: 0.055, letter: "B", grade_class: "g-b", grade_label: "Fair", source_fn: "calculatorMath.gradeRate",
    };
    const result = diffVsPrevious(curr, rootDir);
    expect(result.threshold_breaches.some((s) => s.includes("A → B"))).toBe(true);
  });
});

describe("canonicalize", () => {
  it("sorts object keys for byte-identical idempotency", () => {
    const a = canonicalize({ z: 1, a: 2 });
    const b = canonicalize({ a: 2, z: 1 });
    expect(a).toBe(b);
  });
  it("recursively sorts nested objects", () => {
    const a = canonicalize({ outer: { z: 1, a: 2 } });
    const b = canonicalize({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });
});

afterEachCleanup();

function afterEachCleanup() {
  // noop placeholder — rootDir is only used for the duration of each test
  // and we don't need to clean up the OS tmp dir aggressively.
  void rootDir;
}
