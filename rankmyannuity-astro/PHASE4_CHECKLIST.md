# Phase 4 Checklist — Athene Pilot Data Pipeline

RankMyAnnuity.pro · pipeline version `0.4.0` · generated 2026-04-21

This checklist is the reviewer's map of Phase 4. Every gate, file, command,
and approval step is enumerated below. Nothing in `src/` is hand-edited
except the MDX reviews, `src/pages/rates.astro`, and
`src/pages/reviews/[...slug].astro`; everything under `src/generated/` and
`src/data/benchmarks.generated.ts` is produced by the pipeline.

---

## 1. Scope (locked)

- **Carriers in scope:** Athene only.
- **Reviews in scope:**
  - `reviews/athene` (carrier review)
  - `reviews/athene-performance-elite` (product review, FIA)
- **Pipeline mode:** build-time only. No ISR, no on-demand regeneration.
- **MDX = source of truth** for carrier/product facts. YAML only carries
  data the MDX does not (rates, benchmark snapshots).
- **Out of scope for Phase 4:** additional carriers, additional reviews,
  full Learn content sync, runtime fetching, automatic approval.

---

## 2. Pipeline layers (data flow)

```
  sources                  adapters                normalize           publish
  ───────                  ────────                ─────────           ────────
  src/content/reviews/*.mdx  ─►  mdx                ─┐
  data-pipeline/sources/     ─►  curated-yaml       ─┤
    rates.myga.yml                                   │
    benchmarks.curated.yml                           ├─►  normalize/index.ts
  FRED DGS10, DGS1           ─►  fred                ┤      • assemble
    (offline: fixtures)                              │      • cross-field FK
  Treasury fiscaldata        ─►  treasury-direct     │      • FRED/TD 10bps
    (offline: fixtures)                              │        tolerance
  FDIC national 5yr CD       ─►  fdic-cd             │      • round4() FP
    (offline: snapshot)                              │        sanitize
                                                     │
                                                     ▼
                                        validate/diff.ts
                                          • canonicalize(key-sort)
                                          • threshold breach detect
                                        validate/reports.ts
                                          • REVIEW.md (always)
                                          • conflicts.md / missing.md
                                            (conditional)
                                                     │
                                                     ▼
                                        publish/emit-collections.ts
                                          → src/generated/reviews/*.json
                                          → src/generated/rates/myga.json
                                          → src/generated/benchmarks.json
                                        publish/emit-data.ts
                                          → src/data/benchmarks.generated.ts
```

Never: pipeline writes outside `src/generated/**` and
`src/data/benchmarks.generated.ts`.
Never: `src/` imports from `data-pipeline/`.

---

## 3. Adapters & provenance

| Adapter | Source | Offline behavior | Self-validates against |
| --- | --- | --- | --- |
| `mdx` | `src/content/reviews/*.mdx` | n/a (local) | MDX frontmatter shape |
| `curated-yaml` | `data-pipeline/sources/*.yml` | n/a (local) | `MygaRatesFileSchema`, `BenchmarksCuratedFileSchema` |
| `fred` | FRED API (DGS10, DGS1) | `PIPELINE_OFFLINE=1` → `fixtures/fred-*.json` | `BenchmarkSnapshotSchema` |
| `treasury-direct` | fiscaldata.treasury.gov | `PIPELINE_OFFLINE=1` → `fixtures/treasury-direct-10yr.json` | `BenchmarkSnapshotSchema` |
| `fdic-cd` | FDIC national rates | `PIPELINE_OFFLINE=1` or fetch failure → `snapshots/fdic-cd-*.json` (degraded status) | `BenchmarkSnapshotSchema` |

Cross-check: FRED DGS10 vs Treasury Direct 10-yr must agree within
`CROSS_CHECK_BPS_TOLERANCE = 10` basis points. Current run: 1 bp apart.

---

## 4. Guardrails & gates

- **Phase 3 DO-NOT-FIX preserved.** The green-blob grade-indicator bug
  is untouched. The Phase 3 parity fixtures (`F1`, `F3`, `F4`, `F6`) stay
  byte-identical; the test file pins the benchmark via `vi.mock` so
  runtime pipeline changes can't regress Phase 3 assertions.
- **`.strict()` on every zod schema.** Unexpected MDX frontmatter keys
  fail the build.
- **`pipeline_version: z.literal("0.4.0")`** on sidecar and manifest.
  Bumps catch old consumers automatically.
- **`ReviewSidecarSchema.computed_grade.source_fn` is**
  `z.literal("calculatorMath.gradeRate")`. If anyone swaps graders, the
  schema fails.
- **Thresholds:**
  - `BENCHMARK_BREACH_BPS = 25` — benchmark rate delta between runs
  - `RATE_BREACH_BPS = 50` — MYGA rate delta between runs
  - `CROSS_CHECK_BPS_TOLERANCE = 10` — FRED vs Treasury cross-check
- **APPROVED.txt gate.** `publish-data` only promotes a run whose
  `REVIEW.md` sha256 matches the approval file.
- **Missing-required-field rule:** if a *required* field can't be
  produced, the build fails. Empty pilot rate corpus is **not** a
  missing-required; it is recorded as a note. Flagged conflicts always
  halt publish.

---

## 5. Commands

```bash
# Install (includes tsx 4.19.0, zod, yaml, gray-matter)
npm install

# Refresh: run full pipeline into data-pipeline/reports/<run_id>/ — never touches src/
npm run refresh-data

# Review: print the latest REVIEW.md to stdout
npm run review-data

# Publish: requires APPROVED.txt in the approved run dir, re-runs the pipeline
# fresh and promotes artifacts to src/generated/** and src/data/benchmarks.generated.ts
npm run publish-data

# Tests (Phase 3 + Phase 4 → 82 total)
npm test

# Full Astro production build (reads the generated artifacts)
npm run build
```

---

## 6. APPROVED.txt format

File path: `data-pipeline/reports/<run_id>/APPROVED.txt`

```
reviewer: <full name>
timestamp: <ISO 8601 UTC>
sha256: <sha256 of REVIEW.md in the same run directory>
```

The sha256 is computed against the bytes of `REVIEW.md`. If `REVIEW.md`
is regenerated (e.g. benchmarks shift), the hash no longer matches and
the approval becomes stale. `publish-data` refuses stale approvals.

Override for CI: `PIPELINE_APPROVE_RUN=<run_id>` points the publisher
at an explicit run directory.

---

## 7. Environment variables

| Variable | Effect |
| --- | --- |
| `PIPELINE_OFFLINE=1` | All HTTP adapters read fixtures. Set in npm scripts by default. |
| `PIPELINE_FROZEN_TIME=2026-04-21T20:00:00.000Z` | Pins `now()` for deterministic tests. |
| `PIPELINE_APPROVE_RUN=<run_id>` | Explicit approved-run pointer (CI-friendly). |
| `FRED_API_KEY` | Triggers live fetch when `PIPELINE_OFFLINE` is unset. |

---

## 8. Current published artifacts

After `npm run publish-data` on 2026-04-21:

- `src/data/benchmarks.generated.ts` — 4 rows, DO-NOT-EDIT banner.
- `src/generated/reviews/athene.json` — kind=carrier; `linked_rate=null`,
  `computed_grade=null` (expected: carrier reviews aren't grade-computed).
- `src/generated/reviews/athene-performance-elite.json` — kind=product;
  `linked_rate=null`, `computed_grade=null` (expected: FIA product, no
  MYGA rate curated).
- `src/generated/rates/myga.json` — empty rates array (pilot scope).
- `src/generated/benchmarks.json` — panel + legacy_array.

Benchmark panel values (pilot):

| Key | Value | Source |
| --- | --- | --- |
| `top_myga_5yr` | 0.00% | curated-yaml (empty pilot corpus) |
| `treasury_10yr` | 4.35% (as of 2026-04-17) | FRED DGS10 |
| `cd_5yr_national_avg` | 1.85% (as of 2026-04-15) | FDIC |
| `sp500_historical` | 10.00% | NYU Stern historical |

Run IDs on record:

- First approved/published run: `2026-04-22T03-14-22-677Z`
  - Approved by: Charlie Brothersen at `2026-04-21T20:15:00Z`
  - Snapshot: `data-pipeline/snapshots/normalized-2026-04-22T03-14-22-677Z.json`

---

## 9. Test suite (82/82)

| Suite | File | Tests |
| --- | --- | --- |
| Phase 3 parity | `src/lib/calculator/calculatorMath.test.ts` | 31 |
| Phase 3 derive | `src/lib/calculator/deriveSummary.test.ts` | 9 |
| Phase 4 schemas | `data-pipeline/__tests__/schemas.test.ts` | 21 |
| Phase 4 adapters | `data-pipeline/__tests__/adapters.test.ts` | 9 |
| Phase 4 diff | `data-pipeline/__tests__/diff.test.ts` | 9 |
| Phase 4 idempotency | `data-pipeline/__tests__/idempotency.test.ts` | 3 |

The idempotency suite runs the full pipeline twice and asserts
byte-identical preview tree hashes (via `canonicalize()` + strip
`generated_at`).

---

## 10. Page wiring (Astro)

- `src/pages/rates.astro` — imports `src/generated/rates/myga.json` and
  `src/generated/benchmarks.json`. Renders a 4-card benchmark panel plus
  the MYGA rate table, with an explicit empty-state that names the
  curated YAML file so the gap is obvious.
- `src/pages/reviews/[...slug].astro` — `import.meta.glob`s all
  sidecars eagerly, key by slug, and renders a "Pipeline-computed data"
  section: linked rate (rate + term + band + effective + source), benchmark
  delta (formatted + raw), and computed grade (letter + label + rate_used
  + `source_fn`). Each sub-block renders a "no data" state when the
  sidecar field is `null` — sections never silently hide.
- `src/data/benchmarks.ts` — thin re-export from
  `benchmarks.generated.ts`. Runtime shape is identical; all existing
  consumers (calculator, IncomeCalculator, etc.) work unchanged.

---

## 11. Phase 3 regression pin

Phase 3 parity tests were captured at `top_myga_5yr = 5.90%`. Phase 4's
pilot value is `0.00%` (empty MYGA corpus). The test file mocks the
benchmarks module to pin the capture-time value so Phase 3 remains
byte-identical. Production code is unaffected — `calculatorMath.ts`
reads the live `benchmarkRates` from `src/data/benchmarks.ts`
(generated).

---

## 12. Out-of-scope (do NOT do without explicit approval)

- Additional carriers or reviews.
- Switching to on-demand/ISR regeneration.
- Changing grade thresholds or the grading function signature.
- Automatic approval or self-approval in CI.
- Rewriting the green-blob grade-indicator (Phase 3 DO-NOT-FIX).

---

## 13. Reviewer's quick gate

Run these three commands; all must succeed with zero diffs in `src/`:

```bash
npm test                 # expect: 82 passed
npm run build            # expect: 12 pages built, no errors
npm run publish-data     # expect: APPROVED.txt sha256 match, idempotent promotion
```

If any of these fails, **do not ship**. Inspect
`data-pipeline/reports/<run_id>/REVIEW.md` plus any `conflicts.md` /
`missing.md` in the same directory, and resolve before approving.
