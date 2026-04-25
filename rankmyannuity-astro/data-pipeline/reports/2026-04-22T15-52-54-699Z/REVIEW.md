# Pipeline Review — 2026-04-22T15-52-54-699Z

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
| Notes | 2 | no |

> This run is **ready for review**. Inspect the diff and threshold breaches below, then approve by writing `APPROVED.txt` into the run directory.

## What was generated

- **Carriers (MDX):** 1
- **Products (MDX):** 1
- **MYGA rates:** 0
- **Benchmarks:** 4
- **Review sidecars emitted:** 2

## Benchmark panel

| Benchmark | Rate | Status | As of | Source | Adapter |
|-----------|-----:|:------:|:------|--------|---------|
| 5-yr MYGA (top rate) | — | `pilot_empty` | 2026-04-22 | [no curated MYGA rate available for pilot corpus](https://rankmyannuity.pro/methodology) | `curated-yaml` |
| 10-yr Treasury | 4.35% | `live` | 2026-04-17 | [FRED DGS10 (10-Year Treasury CMT)](https://fred.stlouisfed.org/series/DGS10) | `fred` |
| 5-yr CD national average | 1.85% | `live` | 2026-04-15 | [FDIC National Rates and Rate Caps (5-year CD, national average)](https://www.fdic.gov/resources/bankers/national-rates/) | `fdic-cd` |
| S&P 500 historical avg | 10.00% | `live` | 2026-01-01 | [NYU Stern — Historical Returns on Stocks, Bonds and Bills (1928–present)](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html) | `curated-yaml` |

## MYGA rates

_No MYGA rates in the current pilot corpus._

## Review sidecars

| Slug | Kind | Linked rate | Computed grade |
|------|------|:-----------:|:--------------:|
| `athene` | carrier | — | — |
| `athene-performance-elite` | product | — | — |

## Diff vs previous snapshot

Compared to `normalized-2026-04-22T03-14-22-677Z.json`.
- Added: 0
- Removed: 0
- Modified: 0

_No threshold breaches._

> No threshold breaches vs normalized-2026-04-22T03-14-22-677Z.json. Outputs structurally equivalent or within tolerance.

## Notes

- No 5-year MYGA rates in rates.myga.yml — top_myga_5yr benchmark is emitted at 0.00%. The /calculator 'Top MYGA' card and /rates page will render an empty state. Add an MYGA rate with a matching product review MDX to populate.
- FRED DGS10 and TreasuryDirect cross-check OK: 4.35% vs 4.34% (1.0bps apart, within 10bps tolerance).

## Adapter provenance

| Adapter | Records | HTTP | Cached | SHA-256 | Fetched at |
|---------|--------:|-----:|:------:|:--------|:-----------|
| `curated-yaml` | 0 | — | no | `da9978e1beda…` | 2026-04-22T15:52:54.700Z |
| `curated-yaml` | 1 | — | no | `493d4fc8f104…` | 2026-04-22T15:52:54.707Z |
| `mdx` | 2 | — | no | `886a74bbe26b…` | 2026-04-22T15:52:54.709Z |
| `fred` | 1 | — | yes | `5928a958f1d6…` | 2026-04-22T15:52:54.718Z |
| `fred` | 1 | — | yes | `1014f130b6ec…` | 2026-04-22T15:52:54.718Z |
| `treasury-direct` | 1 | — | yes | `2b8582f1dbea…` | 2026-04-22T15:52:54.719Z |
| `fdic-cd` | 1 | — | yes | `e4a809eb78c5…` | 2026-04-22T15:52:54.719Z |

## How to approve

Write `APPROVED.txt` in this directory with the reviewer's name, timestamp, and the SHA-256 of this REVIEW.md, then run `npm run publish-data`. The publish step refuses to run when the manifest is `blocked` or when `APPROVED.txt` is missing, stale, or does not match the current review.
