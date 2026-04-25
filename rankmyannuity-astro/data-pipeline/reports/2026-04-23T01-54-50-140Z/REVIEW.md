# Pipeline Review — 2026-04-23T01-54-50-140Z

**Pipeline version:** `0.5.0`  
**Run mode:** `refresh`  
**Status:** `ready_for_review`  
**First published run:** `no`

## Gate summary

| Gate | Count | Blocks publish? |
|------|------:|:---------------:|
| Schema failures | 0 | yes |
| Source conflicts | 0 | yes |
| Missing required fields | 0 | yes |
| Threshold breaches | 0 | no (review only) |
| Notes | 1 | no |

> This run is **ready for review**. Inspect the diff and threshold breaches below, then approve by writing `APPROVED.txt` into the run directory.

## What was generated

- **Carriers (MDX):** 11
- **Products (MDX):** 12
- **MYGA rates:** 3
- **Benchmarks:** 4
- **Review sidecars emitted:** 23

## Benchmark panel

| Benchmark | Rate | Status | As of | Source | Adapter |
|-----------|-----:|:------:|:------|--------|---------|
| 5-yr MYGA (top rate) | 5.15% | `live` | 2026-04-16 | [Pacific Life Pacific Harbor 5-year $200k+ rate — ria.pacificlife.com (Pacific Life Advisory), effective 2026-04-16](https://ria.pacificlife.com/home/rates.html) | `curated-yaml` |
| 10-yr Treasury | 4.35% | `live` | 2026-04-17 | [FRED DGS10 (10-Year Treasury CMT)](https://fred.stlouisfed.org/series/DGS10) | `fred` |
| 5-yr CD national average | 1.85% | `live` | 2026-04-15 | [FDIC National Rates and Rate Caps (5-year CD, national average)](https://www.fdic.gov/resources/bankers/national-rates/) | `fdic-cd` |
| S&P 500 historical avg | 10.00% | `live` | 2026-01-01 | [NYU Stern — Historical Returns on Stocks, Bonds and Bills (1928–present)](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html) | `curated-yaml` |

## MYGA rates

| Carrier | Product | Term | Rate | Effective | Source |
|---------|---------|-----:|-----:|:----------|--------|
| new-york-life | new-york-life-secure-term-myga | 5yr | 4.60% | 2026-04-27 | [New York Life Secure Term MVA II 5-year $100k+ rate — nylannuities.com, effective 2026-04-27](https://www.nylannuities.com/resources/rates) |
| new-york-life | new-york-life-secure-term-myga | 5yr | 4.50% | 2026-04-27 | [New York Life Secure Term Choice II 5-year $100k+ rate — nylannuities.com, effective 2026-04-27](https://www.nylannuities.com/resources/rates) |
| pacific-life | pacific-life-pacific-harbor | 5yr | 5.15% | 2026-04-16 | [Pacific Life Pacific Harbor 5-year $200k+ rate — ria.pacificlife.com (Pacific Life Advisory), effective 2026-04-16](https://ria.pacificlife.com/home/rates.html) |

## Review sidecars

| Slug | Kind | Linked rate | Computed grade |
|------|------|:-----------:|:--------------:|
| `allianz-benefit-control` | product | — | — |
| `allianz-life` | carrier | — | — |
| `athene` | carrier | — | — |
| `athene-performance-elite` | product | — | — |
| `corebridge-american-pathway` | product | — | — |
| `corebridge-financial` | carrier | — | — |
| `equitable-financial` | carrier | — | — |
| `equitable-structured-capital-strategies` | product | — | — |
| `jackson-market-link-pro` | product | — | — |
| `jackson-national` | carrier | — | — |
| `lincoln-financial` | carrier | — | — |
| `lincoln-optiblend` | product | — | — |
| `massmutual` | carrier | — | — |
| `massmutual-stable-voyage` | product | — | — |
| `nationwide` | carrier | — | — |
| `nationwide-peak-10` | product | — | — |
| `new-york-life` | carrier | — | — |
| `new-york-life-secure-term-myga` | product | 4.60% (5yr) | B |
| `pacific-life` | carrier | — | — |
| `pacific-life-pacific-harbor` | product | 5.15% (5yr) | B |
| `pacific-life-pacific-index-foundation` | product | — | — |
| `prudential` | carrier | — | — |
| `prudential-flexguard` | product | — | — |

## Diff vs previous snapshot

Compared to `normalized-2026-04-23T01-20-48-826Z.json`.
- Added: 0
- Removed: 0
- Modified: 0

_No threshold breaches._

> No threshold breaches vs normalized-2026-04-23T01-20-48-826Z.json. Outputs structurally equivalent or within tolerance.

## Notes

- FRED DGS10 and TreasuryDirect cross-check OK: 4.35% vs 4.34% (1.0bps apart, within 10bps tolerance).

## Adapter provenance

| Adapter | Records | HTTP | Cached | SHA-256 | Fetched at |
|---------|--------:|-----:|:------:|:--------|:-----------|
| `curated-yaml` | 3 | — | no | `5371ab9abc08…` | 2026-04-23T01:54:50.140Z |
| `curated-yaml` | 1 | — | no | `493d4fc8f104…` | 2026-04-23T01:54:50.154Z |
| `mdx` | 23 | — | no | `ac176c5ef7b9…` | 2026-04-23T01:54:50.155Z |
| `fred` | 1 | — | yes | `5928a958f1d6…` | 2026-04-23T01:54:50.222Z |
| `fred` | 1 | — | yes | `1014f130b6ec…` | 2026-04-23T01:54:50.222Z |
| `treasury-direct` | 1 | — | yes | `2b8582f1dbea…` | 2026-04-23T01:54:50.222Z |
| `fdic-cd` | 1 | — | yes | `e4a809eb78c5…` | 2026-04-23T01:54:50.222Z |

## How to approve

Write `APPROVED.txt` in this directory with the reviewer's name, timestamp, and the SHA-256 of this REVIEW.md, then run `npm run publish-data`. The publish step refuses to run when the manifest is `blocked` or when `APPROVED.txt` is missing, stale, or does not match the current review.
