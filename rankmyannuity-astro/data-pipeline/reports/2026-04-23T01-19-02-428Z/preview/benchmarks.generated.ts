// ──────────────────────────────────────────────────────────────────
// PREVIEW — GENERATED FILE — DO NOT HAND-EDIT
// This is a preview emitted under reports/<run>/preview/. It is not
// read by any Astro page. The publish step promotes the production
// copy to src/data/benchmarks.generated.ts.
// ──────────────────────────────────────────────────────────────────
export type BenchmarkStatus = "live" | "pilot_empty" | "degraded";
export interface BenchmarkRate { label: string; rate: number; source: string; status: BenchmarkStatus; }
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
