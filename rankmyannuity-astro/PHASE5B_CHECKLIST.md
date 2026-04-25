# Phase 5.0b — Review Gate Checklist

**Status:** Ready for review
**Pipeline version:** `0.5.0`
**Delivery:** `rankmyannuity-astro-phase5b.zip`
**Date:** 2026-04-22

This checklist accompanies the 5.0b zip for the review gate. Nothing
beyond 5.0b will start without explicit approval.

---

## Scope delivered (5.0b)

5.0b is the **wave-1 corpus + shared predicate extraction** layer. It
adds 10 carrier MDX scaffolds + 10 product MDX scaffolds (ranks 2–11
after Athene per LIMRA 4Q 2025, matching `PHASE5_KICKOFF.md` §2), and
extracts the qualifying-5yr-MYGA predicate into a shared module used
by both the normalize layer and CI Gate 4.

### 1. Task 19 — shared predicate extraction
- [x] Moved `hasQualifyingFiveYearMygaRate` / `isQualifyingFiveYearMygaRate` /
      `qualifyingFiveYearMygaRates` to **`data-pipeline/predicates/myga.ts`**
- [x] Preserved `data-pipeline/helpers/qualifyingFiveYearMygaRate.ts`
      as a thin re-export shim for back-compat (existing test
      imports continue to work without edits)
- [x] Updated imports at both call sites:
  - `data-pipeline/normalize/index.ts`
  - `scripts/ci/top-myga-public-requires-nonempty.ts`
- [x] Shared-contract docstring at module top explicitly states:
      "Any change to `isQualifyingFiveYearMygaRate` must update both
      call sites in the same PR." This formalizes the coordination
      note from `PHASE5A_CHECKLIST.md`.
- [x] **Signature unchanged.** Single argument in, boolean / filtered
      array out. No options bag, no normalization flags. Same spirit
      as the mdxSha256 helper ratification in `PHASE5_SPEC.md` §4.
- [x] **Scope unchanged.** Still the existing 5-year predicate only.
      Did NOT generalize to 3-yr / 7-yr / 10-yr — future term-band
      work is its own spec decision.

### 2. Task 19 unit tests
New file: **`data-pipeline/__tests__/predicates-myga.test.ts`** — 5
tests imported from the new canonical path, one per kickoff case:

- [x] Case 1: empty corpus → false
- [x] Case 2: only non-5-year terms (3/4/7/10) → false
- [x] Case 3: 5-year entry failing band condition (`rate === 0`) → false
- [x] Case 4: qualifying 5-year entry present → true
- [x] Bonus purity guard: predicate does not mutate input; repeatable

Older tests in `helpers.test.ts` still exist and continue to exercise
the back-compat re-export path, so the shim itself is test-covered.

### 3. Wave-1 carrier scaffolds (10 files)
Generated in **one batch** via `scripts/scaffold-wave1.ts`, in the
ratified LIMRA order:

| After Athene | Carrier slug | Display name |
|:-:|---|---|
| 1 | `new-york-life` | New York Life |
| 2 | `corebridge-financial` | Corebridge Financial |
| 3 | `equitable-financial` | Equitable Financial |
| 4 | `jackson-national` | Jackson National |
| 5 | `allianz-life` | Allianz Life |
| 6 | `nationwide` | Nationwide |
| 7 | `mass-mutual` | MassMutual |
| 8 | `lincoln-financial` | Lincoln Financial |
| 9 | `pacific-life` | Pacific Life |
| 10 | `prudential` | Prudential |

Every carrier MDX:
- [x] `status: "pilot"`
- [x] No `shipping_criteria` block (not required; pilot scope)
- [x] No `carriers.shipping.yml` entry added (pilot scope)
- [x] Carries the labeled **"Editorial draft pending"** block at the
      top of the body
- [x] No subjective rankings, grades, or recommendations in body text
- [x] No `verdict.grade` set; `watchouts: []`; sources listed
- [x] LIMRA [1] and [2] pinned URLs cited in frontmatter `sources` and
      in the body's Sources section
- [x] `relatedReviews` links to the carrier's one wave-1 product
- [x] `relatedArticles: []` (no dependency on existing learn content)

### 4. Wave-1 product scaffolds (10 files)
One product per carrier, with the same guarantees:
- [x] `status: "pilot"`
- [x] `carrierSlug` FK resolves to the paired carrier
- [x] `featuredCapRate` / `featuredParticipationRate` / `featuredSpread`
      **intentionally omitted** (not stubbed with placeholder values —
      "no silent backfills" per Phase 4 brief)
- [x] Editorial-draft-pending block at top of body
- [x] No subjective rankings; LIMRA [1]/[2] citations
- [x] `relatedReviews` links back to the paired carrier

Product type per carrier is an objective slotting decision based on
each carrier's most prominent LIMRA 4Q 2025 category (MYGA / FIA /
RILA). This is frontmatter metadata, not body commentary.

### 5. Pipeline validation against 22-MDX corpus

| Check | Result |
|---|---|
| `npm test` | **173 / 173 passed** (168 prior + 5 predicate tests; 2 corpus-dependent tests updated to structural invariants) |
| `npm run ci:check` | **4 / 4 PASS** |
| `npm run refresh-data` | `ready_for_review`; 11 carriers, 11 products, 22 sidecars |
| `npm run publish-data` | published; all 22 sidecars promoted with `status: "not_live"` + `not_live_cause: "pilot_carrier"` or `pilot_product` |
| `npm run build` | **32 pages** built (up from 12); includes all 22 review pages |
| Pilot review rendering (spot-checked `/reviews/new-york-life/`) | `meta name="robots" content="noindex,nofollow"` present; "Pilot Scaffold (not live)" chip present |
| `site.yml.top_myga_public` | still `false`; corpus still has 0 qualifying 5-year MYGA rates → Gate 4 continues to short-circuit to OK |

### 6. Corpus-dependent tests updated (not regressions, corpus shape change)

Two tests hardcoded the Athene-only pilot corpus (2 MDX files). With
wave-1 the corpus is 22 MDX files. Rather than hardcode the new list
(which would break again on every future wave), both tests were
rewritten to assert **structural invariants** that survive corpus
growth:

- **`data-pipeline/__tests__/adapters.test.ts`** — "loads carrier +
  product MDX" now asserts: loader succeeds, Athene still present,
  at least one wave-1 carrier (`new-york-life`) present, and every
  product's `carrierSlug` resolves in the corpus.
- **`data-pipeline/__tests__/idempotency.test.ts`** — "emits exactly
  one sidecar per MDX review" now asserts 1:1 mapping by file count +
  uniqueness, plus Athene pilot must still be present.

Both rewrites include inline comments explaining the intent so future
waves don't re-fall into the hardcoded-list pattern.

---

## Fixes folded in during 5.0b

Carried over from the 5.0a "fixes folded in" discipline:

- **Back-compat shim added** at `data-pipeline/helpers/qualifyingFiveYearMygaRate.ts`
  as a re-export of the new canonical predicate module. Prevents any
  downstream import paths from breaking during the extraction.
- **Two corpus-dependent tests converted** from exact-match assertions
  to structural invariants (see §6).

---

## Shared predicate — explicit contract note

`data-pipeline/predicates/myga.ts` is a SHARED CONTRACT between:

1. **Normalize layer** (`data-pipeline/normalize/index.ts`) — drives
   `top_myga_5yr` benchmark status (`pilot_empty` when no qualifying
   rate exists).
2. **CI Gate 4** (`scripts/ci/top-myga-public-requires-nonempty.ts`) —
   blocks PRs that flip `site.yml.top_myga_public: true` with an
   empty qualifying corpus.

The module docstring states verbatim:
> Any change to `isQualifyingFiveYearMygaRate` must update both call
> sites in the same PR. This file is the single source of truth;
> drift here silently changes pipeline benchmark status AND gate
> behavior simultaneously.

A code-review reading of either call site will encounter the import
from `predicates/myga.ts` and land on this notice.

---

## Constraints honored (carried from prior phases)

- **MDX = source of truth** — no duplicate YAML carrier source.
- **No silent backfills** — 20 new MDX files carry zero invented
  numeric rates; `featuredCapRate` etc. are omitted, not stubbed.
- **Phase 3 DO-NOT-FIX preserved** — grade indicator behavior unchanged.
- **`PHASE5_SPEC.md` unchanged** — amendments require the draft 1→2→3
  process.
- **Shipping promotion remains separate** — wave-1 ships nothing; each
  future promotion will be its own standalone sign-off.
- **Wave-1 reviews are pilot scaffolds**, not finished editorial.

---

## Held for future waves (do NOT proceed without explicit approval)

Everything beyond 5.0b is **held** pending your direction. Candidate
next steps discussed or implied but not ratified:

- Wave-2 carrier expansion (ranks 12+ in LIMRA 4Q 2025)
- Editorial passes promoting wave-1 carriers toward `shipping` status
  (each one its own approval event + `carriers.shipping.yml` entry)
- Populating `rates.myga.yml` with live MYGA rates that tie to wave-1
  MYGA products (e.g. `new-york-life-secure-term-myga`,
  `mass-mutual-stable-voyage`)
- Flipping `site.yml.top_myga_public` to `true` — only valid once
  the corpus contains a qualifying 5-year rate (CI Gate 4 enforces)
- Shared cross-field predicate for
  `status + shipping_criteria + retired_reason + rates_not_applicable`
  (the carrier/product frontmatter refine), so pipeline-side and
  Astro content-collection refines call the same function. The Task
  19 MYGA predicate extraction is an analogous pattern; this is the
  next logical application. **Deferred — not in 5.0b scope.**
- Term-band generalization of the MYGA predicate (3-yr / 7-yr /
  10-yr). **Deferred — explicitly out of 5.0b scope per kickoff.**

---

## Review questions for the user

1. Approve 5.0b as delivered?
2. Any changes to wave-1 carrier/product attribution (product type,
   product name) before editorial work begins?
3. Which candidate from "Held for future waves" should be next, if
   any?

Standing by at the review gate.
