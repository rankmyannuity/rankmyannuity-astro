# Phase 5.0a — Review Gate Checklist

**Status:** Ready for review
**Pipeline version:** `0.5.0`
**Delivery:** `rankmyannuity-astro-phase5a.zip`
**Date:** 2026-04-22

This checklist accompanies the 5.0a zip for the review gate. Phase 5.0b
(wave-1 carrier MDX + rates corpus) is held pending explicit approval of
this phase.

---

## Scope delivered (5.0a)

5.0a is the **schemas / helpers / gates** layer. It adds the machinery
that will make wave-1 carrier reviews safe to ship in 5.0b, without
adding any carrier content itself. The Athene pilot corpus is the only
carrier/product MDX touched, and it was migrated to the new
`status: "pilot"` shape.

### 1. Pipeline version + drift fixes
- [x] `PIPELINE_VERSION` bumped to `"0.5.0"` (pipeline source of truth)
- [x] `review.ts` inline version drift corrected; `diff.test.ts` fixture updated
- [x] Generated files carry 0.5.0: `src/data/benchmarks.generated.ts`,
      `src/generated/benchmarks.json`, review sidecars

### 2. Schema extensions
- [x] `CarrierFrontmatterSchema` + `ProductFrontmatterSchema` — added
      `status` (pilot | shipping | retired), `shipping_criteria`,
      `retired_reason`, `rates_not_applicable`, with a cross-field
      `.superRefine` enforcing mutual exclusivity + status
      prerequisites
- [x] Mirrored in `src/content/config.ts` so Astro's content-collection
      validator enforces the same invariants at build time
- [x] `BenchmarkSnapshotSchema` — added `status: "live" | "pilot_empty" | "degraded"`
      with exclusivity `.superRefine` (e.g. `pilot_empty` requires `rate === null`)
- [x] `ReviewSidecarSchema` — added `status` + `not_live_cause` enum;
      Athene sidecars migrated to the new shape

**Structural decision (ratified, preserved):** Outer-`.superRefine` on
the discriminated union stays as-is, per the user's prior direction:
> "Outer-.superRefine on the discriminated union is the correct
> workaround... Accepted as an ergonomics fix, not a semantic change."
An explanatory comment is present in-file.

### 3. Helpers + sources
- [x] `data-pipeline/helpers/mdxSha256.ts` — exact-bytes sha256 of MDX files
- [x] `data-pipeline/helpers/qualifyingFiveYearMygaRate.ts` — predicate,
      filter, and any-variant (`term_years === 5 AND rate > 0`)
- [x] `data-pipeline/helpers/reviewersYaml.ts` — reader with
      `active_at(date)` temporal query
- [x] `data-pipeline/sources/site.yml` — `top_myga_public: false`
- [x] `data-pipeline/sources/reviewers.yml` — empty allow-list (valid)
- [x] `data-pipeline/sources/carriers.shipping.yml` — empty approvals
      list (valid, pilot state)

### 4. Normalize layer
- [x] Status derivation per carrier / product / benchmark
- [x] sha256 downgrade: if approval exists but on-disk MDX sha has
      changed, status downgrades `shipping → pilot` at normalize time
- [x] Benchmark status mapping (`pilot_empty` when no underlying rate,
      `degraded` when past-freshness, `live` otherwise)
- [x] Qualifying-rate empty check for `top_myga_5yr`

### 5. Frozen-time guards
- [x] `publish-data` refuses when `PIPELINE_FROZEN_TIME` is set
- [x] `PIPELINE_ALLOW_FROZEN_PUBLISH=1` escape hatch for the
      idempotency test harness
- [x] Manifest records `frozen_time` when present
- [x] `REVIEW.md` renders a frozen-time warning block when applicable
- [x] `first_published_run` header flag carves out the first run from
      the wall-clock regression gate
- [x] Wall-clock regression gate compares against prior manifest

Gate helpers extracted to `data-pipeline/cli/publishGates.ts` so
vitest can import them without triggering `publish.ts`'s top-level
`process.exit` side effects.

### 6. REVIEW.md enhancements
- [x] Degraded benchmarks section (conditional — hidden when empty)
- [x] `First published run: yes | no` header flag
- [x] Frozen-time warning block when `PIPELINE_FROZEN_TIME` is set

### 7. UI liveness module
- [x] `src/lib/ui/liveness.ts` — single source of truth for liveness
      predicates + chip constants + `data-testid` invariants
- [x] `src/components/NotLiveChip.astro` — Astro chip component
- [x] Structural `data-testid="benchmark-value"` on every benchmark
      value render site (rates.astro + IncomeCalculator.tsx)

### 8. Athene MDX migration
- [x] `src/content/reviews/athene.mdx` — frontmatter `status: "pilot"`
- [x] `src/content/reviews/athene-performance-elite.mdx` — same

### 9. Page wiring
- [x] `reviews/[...slug].astro` — reads sidecar status, applies
      not-live treatment when status !== "live"
- [x] `rates.astro` — em-dash + `<NotLiveChip>` when benchmark not live
- [x] `IncomeCalculator.tsx` (React island) — matching inline amber
      chip (chip component is Astro-only, so React uses the shared
      constants from `liveness.ts` for testid + label)

### 10. Vitest additions (30 new, 138 prior → 168 total)
All in `data-pipeline/__tests__/phase5.test.ts`:
- [x] `applyShippingSha256Downgrade` (6 tests)
- [x] `frozenTimeGate` (3 tests — default refuse, allow-override, unset OK)
- [x] `wallClockRegressionGate` (6 tests — regression, tie, forward,
      first-run carve-out, override behavior, missing-prior)
- [x] Liveness UI invariants (14 tests — per route × status matrix,
      chip label, testid contract)
- [x] `benchmarks.generated.ts` shape regression (1 test)

Plus existing coverage for: benchmark status exclusivity, qualifying
rate predicate, reviewers `active_at`, normalize-side derivation.

### 11. CI gates (4 gates + aggregator + npm script)
All four ratified gates implemented as `scripts/ci/*.ts`, runnable
standalone or via `npm run ci:check`:

- [x] **shipping-requires-approval.ts** — MDX with `status: "shipping"`
      must have matching entry in `carriers.shipping.yml`
- [x] **forbid-frozen-time-default.ts** — persistent configs
      (package.json, Makefile, Dockerfile, workflows, .env) may not
      default `PIPELINE_FROZEN_TIME` or `PIPELINE_ALLOW_FROZEN_PUBLISH`
- [x] **shipping-sha256-match.ts** — every shipping approval's
      `mdx_sha256` must match on-disk MDX bytes
- [x] **top-myga-public-requires-nonempty.ts** — `site.yml.top_myga_public: true`
      requires at least one qualifying 5-year MYGA rate in the corpus
- [x] **ci-check.ts** aggregator + `"ci:check"` in `package.json`

Per user directive (Phase 5 kickoff, option A): implemented as scripts
+ `npm run ci:check` rather than rolling out a CI platform. Gates run
locally, in any CI provider, and as pre-commit hooks without coupling
Phase 5 to a specific platform.

---

## End-to-end validation (Task 15)

All checks green at delivery time:

| Check | Result |
|---|---|
| `npm test` | **168 / 168 passed** (8 files) |
| `npm run ci:check` | **4 / 4 PASS** |
| `npm run refresh-data` | `ready_for_review`, REVIEW.md rendered |
| `npm run publish-data` | published, manifest written, sidecars promoted |
| Frozen-time refusal (`PIPELINE_FROZEN_TIME` set, override unset) | correctly refused |
| `npm run build` | green — 12 pages generated |
| `/rates` render | em-dash + "Not live" chip for `top_myga_5yr`; live `%` for 10-yr Treasury, 5-yr CD, S&P 500 |

### Sample published REVIEW.md header
```
Pipeline version:   0.5.0
Run mode:           refresh
Status:             ready_for_review
First published run: no

Benchmark panel:
  5-yr MYGA (top rate):   —      pilot_empty
  10-yr Treasury:         4.35%  live
  5-yr CD national avg:   1.85%  live
  S&P 500 historical avg: 10.00% live
```

---

## Fixes folded in during 5.0a

Minor defects caught and corrected during 5.0a execution, folded into
this delivery (not deferred to 5.0b):

- **`scripts/ci/forbid-frozen-time-default.ts`** — replaced an ESM-
  incompatible `require("node:fs")` call with a top-level `statSync`
  import from `node:fs`. The `require` reference caused the gate to
  throw `ReferenceError: require is not defined in ES module scope` on
  first invocation via `npm run ci:check`. Fix: imported `statSync`
  from `node:fs` alongside the existing imports, and swapped the call
  site. Verified green on re-run.

---

## Shared predicate — coordination note for 5.0b

`hasQualifyingFiveYearMygaRate` (in
`data-pipeline/helpers/qualifyingFiveYearMygaRate.ts`) is now called
from **two independent sites**:

1. **Normalize layer** — `data-pipeline/normalize/index.ts` uses it to
   derive `top_myga_5yr` benchmark status (`pilot_empty` when no
   qualifying rate exists).
2. **CI Gate 4** — `scripts/ci/top-myga-public-requires-nonempty.ts`
   uses the same predicate to block PRs that flip
   `site.yml.top_myga_public: true` with an empty qualifying corpus.

**Coordination requirement for 5.0b and beyond:** if the "qualifying"
definition ever changes (e.g. minimum deposit thresholds, excluded
carriers, broader term-year eligibility), **both call sites must be
updated together**. The predicate is already centralized in one
helper, so the mechanical fix is a single-file edit — but be aware
the semantic impact lands in both pipeline normalization and CI
gating simultaneously. Task 19 (5.0b) tracks a related concern for
the frontmatter cross-field refine; the MYGA-qualifying predicate
does **not** have that drift risk because it's already the single
source.

---

## Constraints honored (carried from prior phases)

- **MDX = source of truth** for carrier/product facts. No duplicated
  "carrier YAML source of truth."
- **No silent backfills.** Missing required fields fail the build;
  conflicts halt for review.
- **Phase 3 DO-NOT-FIX preserved.** The green-blob grade indicator
  behavior is unchanged.
- **`PHASE5_SPEC.md` unchanged.** Any future change requires a draft
  1→2→3 mini-proposal.
- **Shipping promotion** remains a separate, explicit, per-carrier
  approval event — never an MDX-only flip.
- **Wave-1 carrier reviews** will be pilot scaffolds in 5.0b, not
  finished editorial.

---

## Held for 5.0b (do NOT proceed without explicit approval)

17. Generate 10 wave-1 carrier MDX + 10 product MDX scaffolds with
    `editorial-draft-pending` status and LIMRA 4Q2025 citations
    (ranks 2–11: New York Life, Corebridge, Equitable, Jackson
    National, Allianz Life, Nationwide, Mass Mutual, Lincoln
    Financial, Pacific Life, Prudential).
18. Full pipeline run against the expanded corpus; deliver 5.0b zip +
    checklist.
19. Extract a **shared cross-field predicate** for
    `status + shipping_criteria + retired_reason + rates_not_applicable`
    so the pipeline-side refine and the Astro content-collection
    refine call the same function. Prevents silent drift.

---

## Review questions for the user

At the review gate, please confirm:

1. Approve 5.0a as delivered and authorize 5.0b to proceed?
2. Any changes to wave-1 carrier ordering or scope before scaffolds
   are generated?
3. Any adjustment to the Task 19 predicate-extraction approach?

Pending your response, no 5.0b work will start.
