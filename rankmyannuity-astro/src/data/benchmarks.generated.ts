// ──────────────────────────────────────────────────────────────────
// GENERATED FILE — DO NOT HAND-EDIT
//
// Produced by data-pipeline/publish/emit-data.ts
// Pipeline version: 0.5.0
// To regenerate: npm run refresh-data && npm run publish-data
//
// Provenance:
//   - 5-yr MYGA (top rate): 5.15% as of 2026-04-16 (adapter: curated-yaml)
//   - 10-yr Treasury: 4.35% as of 2026-04-17 (adapter: fred)
//   - 5-yr CD national average: 1.85% as of 2026-04-15 (adapter: fdic-cd)
//   - S&P 500 historical avg: 10.00% as of 2026-01-01 (adapter: curated-yaml)
// ──────────────────────────────────────────────────────────────────
export type BenchmarkStatus = "live" | "pilot_empty" | "degraded";

export interface BenchmarkRate {
  label: string;
  rate: number;
  source: string;
  status: BenchmarkStatus;
}

export const benchmarkRates: readonly BenchmarkRate[] = [
  {
    "label": "5-yr MYGA (top rate)",
    "rate": 0.0515,
    "source": "Pacific Life Pacific Harbor 5-year $200k+ rate — ria.pacificlife.com (Pacific Life Advisory), effective 2026-04-16 (2026-04-16)",
    "status": "live"
  },
  {
    "label": "10-yr Treasury",
    "rate": 0.0435,
    "source": "FRED DGS10 (10-Year Treasury CMT) (2026-04-17)",
    "status": "live"
  },
  {
    "label": "5-yr CD national average",
    "rate": 0.0185,
    "source": "FDIC National Rates and Rate Caps (5-year CD, national average) (2026-04-15)",
    "status": "live"
  },
  {
    "label": "S&P 500 historical avg",
    "rate": 0.1,
    "source": "NYU Stern — Historical Returns on Stocks, Bonds and Bills (1928–present) (2026-01-01)",
    "status": "live"
  }
] as const;
