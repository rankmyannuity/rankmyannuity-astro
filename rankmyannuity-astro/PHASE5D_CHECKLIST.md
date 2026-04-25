# PHASE5D_CHECKLIST — RankMyAnnuity.pro

**Phase:** 5.0d — Seed NYL Secure Term MVA II 5-yr MYGA rate  
**Pipeline version:** `0.5.0`  
**Status on delivery:** ready for review gate

---

## Summary

Phase 5.0d lands the first real MYGA rate in the curated corpus and the
freshness policy that governs when it stays "live" vs demotes to
"degraded". Exactly one rate was seeded — NYL **Secure Term MVA II**,
5-year, $100k+ band, 4.60% — per the user directive "Seed EXACTLY ONE
real MYGA rate entry." `site.yml.top_myga_public` stays **false**; no
editorial work or new carrier scaffolds landed in this phase.

On delivery the pipeline produces:

- 205/205 tests pass (up from 184/184 in 5.0c).
- 4/4 CI gates pass, including `top-myga-public-requires-nonempty`.
- Pipeline refresh → APPROVED → publish round-trip succeeds.
- `npm run build` renders 32 pages.
- `/rates` renders the 5-yr MYGA benchmark card at **4.60%** with the
  NYL Annuities citation; the rate table renders "Secure Term MVA II"
  (the `product_variant`) as the product-name column and links to the
  generic `new-york-life-secure-term-myga` MDX review.

---

## Variant-vs-slug resolution

This is the one design call that required user ratification during
5.0d. It is documented here in durable form so future rate seeds (for
any carrier that publishes multiple named products on a single rate
sheet) follow the same pattern.

**Problem.** NYL's public rate sheet at
https://www.nylannuities.com/resources/rates lists two different
5-year fixed-rate products on the same page:

- **Secure Term MVA II** — 4.60% at $100k+ (seeded)
- **Secure Term Choice II** — 4.50% at $100k+ (NOT seeded in 5.0d)

Both are NYLIAC-issued single-premium deferred annuities with a fixed
interest period. Our MDX review, however, is a single file
(`src/content/reviews/new-york-life-secure-term-myga.mdx`) with the
generic slug `new-york-life-secure-term-myga` — it predates the
distinction and was written at the product-family level.

Two viable options surfaced during 5.0d kickoff:

- **Option (a)** — Keep the MDX slug generic. Capture the specific
  product name on the *rate* row via new fields.
- **Option (b)** — Rename the MDX to the specific variant slug now,
  and scaffold a second MDX for Choice II.

**Decision — Option (a)** (user-ratified in the 5.0d kickoff reply:
"do not rename new-york-life-secure-term-myga").

### Schema shape

`MygaRateSchema` (data-pipeline/schemas/rate.ts) gained two required
fields alongside the existing `carrier_slug` / `product_slug` FKs:

```ts
product_variant:        z.string().min(1),             // "Secure Term MVA II"
product_variant_slug:   z.string().regex(/^[a-z0-9-]+$/), // "secure-term-mva-ii"
```

- `product_slug` continues to FK to MDX (one review per product
  family).
- `product_variant` is human-display copy that the `/rates` table and
  downstream linked-rate sidecars render.
- `product_variant_slug` is the normalized identifier for deterministic
  sorting, test assertions, and future variant-level pages.

### Rendering contract

`src/pages/rates.astro` renders `r.product_variant ?? r.product_slug` in
the Product column. This keeps the column readable for the new rate
shape AND stays graceful if a future rate entry arrives without a
variant (would render the family slug as fallback).

The anchor target remains the MDX product review (`/reviews/{product_slug}`),
so users clicking the variant name still land on the NYL Secure Term
MYGA review.

### Why this is the right default going forward

1. **MDX churn is expensive.** Renaming a review slug breaks URLs,
   `relatedReviews` backlinks, and sidecar file paths. The rate layer
   already has a clean place to carry variant identity without
   disrupting content.
2. **Carriers publish sheets, not products.** NYL / Allianz /
   MassMutual typically publish a single PDF listing multiple
   sibling products. Capturing that at the rate row keeps the
   curated YAML mirroring the source shape 1:1.
3. **Future variant-level pages are additive.** If we later need a
   dedicated review for Secure Term Choice II, we can scaffold a new
   product MDX at `new-york-life-secure-term-choice` and retarget the
   Choice II rate entry (when seeded) at that slug. Nothing in the
   current rate needs to move.

**Deferred.** The sibling 5-yr Secure Term Choice II rate (4.50% at
$100k+) is explicitly NOT seeded in 5.0d — the user constraint was
"EXACTLY ONE real MYGA rate entry." It is a clean candidate for the
next phase once editorial work on the NYL review catches up.

---

## Freshness policy (5.0d)

**Window:** 7 days, inclusive of the upper boundary (exactly 7 days
old = fresh; strictly greater = stale). User-ratified: "Freshness
window: 7 days."

**Encoding.** The window is named in one place:
`data-pipeline/predicates/myga.ts::MYGA_RATE_FRESHNESS_WINDOW_DAYS = 7`.
Both normalize and the unit tests import this constant — no magic
numbers, and a one-line change propagates everywhere.

**Predicate shape (Decision 1 — Option B, user-ratified).**

- `isQualifyingFiveYearMygaRate(rate): boolean` — shape-only, pure,
  single-argument. UNCHANGED from 5.0b. Still powers CI Gate 4 and
  shape-level inspections.
- `isFreshFiveYearMygaRate(rate, now, windowDays): boolean` — NEW
  sibling predicate. Pure composition of the shape check AND a
  freshness check against `rate.observed_at`. No I/O, no mutation;
  `now` and `windowDays` are both injected for testability.

**Normalize branches for top_myga_5yr.**

| Corpus state                     | status        | not_live_cause     | rate value |
| :------------------------------- | :------------ | :----------------- | :--------- |
| No qualifying 5-yr MYGA rate     | `pilot_empty` | `null`             | `0`        |
| Qualifying + fresh (≤ 7 days)    | `live`        | `null`             | rate       |
| Qualifying + stale (> 7 days)    | `degraded`    | `stale_myga_rate`  | rate (preserved) |

The "stale" branch is the "demoted, not dropped" contract the user
ratified: the rate value is still written into the benchmark manifest
so reviewers can see which rate triggered the staleness, and the
`/rates` chip tells them exactly how old the last observation was.

**CI Gate 4.** `top-myga-public-requires-nonempty` continues to call
the shape-only predicate. A stale rate is still a real rate from CI's
perspective, so it does NOT flip the gate open or shut on its own —
the gate only asks "does the corpus contain *any* real 5-yr MYGA rate?"

---

## `not_live_cause` + schema invariant (Decision 3 — Option X + Y)

Added `BenchmarkNotLiveCauseSchema = z.enum(["stale_myga_rate"]).nullable()`
and extended `BenchmarkSnapshotSchema` with a `not_live_cause` field
governed by an **inline superRefine**:

- `status === "degraded"`  ⇔  `not_live_cause !== null`
- `status !== "degraded"`  ⇒  `not_live_cause === null`

Per user ratification: the 5.0c predicate module
(`predicates/benchmarkSnapshotExclusivity.ts`) is NOT extended. The
mutual-exclusivity check lives inline alongside the existing
`rate===0 ⇔ pilot_empty` refine. Rationale: both invariants are
strictly data-local (no MDX, no cross-file context), so keeping them
in the schema file keeps the "single source of truth about benchmark
shape" discipline intact.

All four `BenchmarkSnapshotSchema.parse` call sites in normalize were
updated to pass `not_live_cause`:

1. `top_myga_5yr` pilot_empty branch → `null`
2. `top_myga_5yr` stale branch → `"stale_myga_rate"`
3. `top_myga_5yr` live branch → `null`
4. `tagAdapterSnapshot` (treasury / CD / sp500) → `null`
5. `sp500_historical` curated branch → `null`

---

## `/rates` UI contract

`src/pages/rates.astro` + `src/lib/ui/liveness.ts`:

- New `staleMygaRateChipLabel(ageDays)` returns `"Stale — last observed
  N days ago"` (singular "day" at N=1; negative ages clamp to 0 so a
  future-dated observation never renders "-3 days ago").
- Chip selection on the benchmark card:
  - `status === "degraded" && not_live_cause === "stale_myga_rate"` →
    `staleMygaRateChipLabel(ageDays from observed_at)`
  - `status === "degraded"` (other cause) → `BENCHMARK_CHIP_LABEL.degraded`
  - `status === "pilot_empty"` → `BENCHMARK_CHIP_LABEL.pilot_empty`
  - otherwise → no chip (live)
- MYGA rate table: Product column renders `r.product_variant ?? r.product_slug`.

---

## `observed_at` vs `effective_date` semantic decision

`MygaRate` now carries two dates:

- **`effective_date`** — what the carrier states on the rate sheet.
  May be future-dated (NYL's sheet observed on 2026-04-22 is marked
  "Rates effective as of 4/27/2026"). Preserved verbatim. This is what
  the `/rates` page displays in the "Effective" column and is what the
  benchmark card cites via `as_of`.
- **`observed_at`** — when the pipeline maintainer actually fetched
  the rate. Drives the 7-day freshness window. Distinct from
  `effective_date` so the carrier's stated date is never silently
  overwritten.

**Concrete effect on the seed.** NYL Secure Term MVA II: `effective_date:
2026-04-27`, `observed_at: 2026-04-22`. On a run with wall-clock ~
2026-04-22, `observed_at` is 0 days old → fresh → `live`. If the run
were 2026-05-01 (9 days later) with no fresh observation, the same
rate would demote to `degraded` + `stale_myga_rate`.

---

## nylannuities.com first-party verification

Confirmed before seeding (per the user "If a field has no reliable
source, do not invent or silently backfill" directive):

- `www.nylannuities.com` is a first-party New York Life property. The
  page footer / legal copy identifies NYLIAC (New York Life Insurance
  and Annuity Corporation) as the issuer; the contact section uses
  the NYL Annuities TPD service center number/address.
- The page is publicly accessible as of 2026-04-22: no login gate,
  no advisor-only disclaimer, no geo-restriction banner.
- The posted rate sheet is future-dated ("Rates effective as of
  4/27/2026"). We preserved that verbatim in `effective_date` and
  recorded `observed_at: 2026-04-22` as the pipeline-maintainer fetch
  date.
- The $1.5M upper bound on the $100k+ premium band is reported
  directly on the NYL page (premiums at or above $1.5M require NYL
  approval). We therefore encoded `premium_band_max: 1499999` rather
  than `null` ("no upper bound"), matching the NYL disclosure
  literally.

---

## Fixes folded in during 5.0d

No silent fixes or drive-bys. Changes that touched files outside the
immediately obvious 5.0d scope:

1. **`data-pipeline/__tests__/adapters.test.ts`** — the
   `loads rates.myga.yml (empty pilot)` test was retitled and
   re-asserted because the pilot corpus is no longer empty. New
   assertions are invariant-shaped (rates non-empty; every rate
   carries `product_variant` / `product_variant_slug` / `observed_at`)
   rather than name-pinning a specific carrier, so future rate seeds
   don't churn this test.
2. **`data-pipeline/__tests__/schemas.test.ts`** — the shared
   `validRate` fixture was extended with the three new MygaRate
   fields. Existing structural tests (canonical rate, band
   nullability, file shape) keep working through the spread.
3. **`data-pipeline/__tests__/helpers.test.ts`** /
   **`data-pipeline/__tests__/predicates-myga.test.ts`** /
   **`data-pipeline/__tests__/diff.test.ts`** — their local `mkRate`
   factories / inline fixtures were extended with the same three
   fields. These are mechanical fixture updates only — no behavior
   change.
4. **`data-pipeline/normalize/index.ts`** — all four
   `BenchmarkSnapshotSchema.parse` call sites now pass
   `not_live_cause`. Three pass `null` explicitly (live /
   pilot_empty / sp500 curated); one passes `"stale_myga_rate"` in
   the new stale branch. The schema's inline superRefine will catch
   any future drift.

No other files changed. No styling work, no new components.

---

## Invariants verified on delivery

- ✅ `MYGA_RATE_FRESHNESS_WINDOW_DAYS === 7` (asserted by the fixture-pin
  test in `predicates-myga-fresh.test.ts`).
- ✅ The shape-only predicate in `predicates/myga.ts` is signature-
  unchanged (single argument, pure, `(MygaRate) => boolean`).
- ✅ Normalize imports `MYGA_RATE_FRESHNESS_WINDOW_DAYS` from the
  predicate module — no magic number in the normalize layer.
- ✅ `BenchmarkSnapshotSchema` rejects all four invalid combinations
  of `status × not_live_cause` at parse time (asserted by the schema
  refine tests in `schemas.test.ts`).
- ✅ Integration tests confirm normalize's live / stale / boundary
  branches against a real `MygaRatesFile` + matching MdxCorpus.
- ✅ Idempotency test passes (snapshot output is byte-stable under
  `PIPELINE_FROZEN_TIME`).
- ✅ CI Gate 4 OK because `top_myga_public` is false; shape-only
  predicate keeps CI agnostic to freshness.
- ✅ `/rates` benchmark card renders `4.60%` on the live path with
  the NYL Annuities citation.
- ✅ `npm run build` succeeds and emits 32 pages.

---

## Out-of-scope for 5.0d (deferred)

- NYL Secure Term Choice II 5-yr rate (4.50% at $100k+). Explicitly
  excluded by the "EXACTLY ONE" constraint. Candidate for the next
  rate-seed phase.
- Any editorial or copy changes to the NYL product / carrier MDX.
- Enabling `site.yml.top_myga_public`. User directive: "DO NOT flip
  site.yml.top_myga_public to true in 5.0d."
- Extending `BenchmarkNotLiveCauseSchema` beyond `"stale_myga_rate"`.
  Adapter-sourced benchmarks (FRED / TreasuryDirect / FDIC) currently
  return `"ok"` in exercised paths; a future phase may plumb an
  adapter-level cause through `TaggedAdapterSnapshot`.

---

## Review gate

The pipeline is at the review gate. Please inspect:

1. The seeded rate in `data-pipeline/sources/rates.myga.yml` and the
   provenance comments.
2. The freshness predicate and constant in
   `data-pipeline/predicates/myga.ts`.
3. The normalize branches in `data-pipeline/normalize/index.ts`
   (lines ~457–536, the four parse sites).
4. The `/rates` rendering in `src/pages/rates.astro` (chip selection,
   variant column).
5. This checklist — specifically the **Variant-vs-slug resolution**
   section above, which captures the durable pattern for future rate
   seeds on carriers with multiple named products on one sheet.

Once approved, the next phase can either seed a second rate (Choice
II) or move on to editorial work on the NYL review.
