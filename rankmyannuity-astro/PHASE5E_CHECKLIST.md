# PHASE5E_CHECKLIST — RankMyAnnuity.pro

**Phase:** 5.0e — Seed NYL Secure Term Choice II 5-yr MYGA rate  
**Pipeline version:** `0.5.0`  
**Status on delivery:** ready for review gate

---

## Summary

Phase 5.0e lands a second real MYGA rate in the curated corpus —
NYL **Secure Term Choice II**, 5-year, $100k+ band, 4.50% — and
completes the "multi-variant one-sheet" exercise that the 5.0d
variant-vs-slug resolution pattern was designed for.

Because two qualifying rates now coexist, 5.0e also **ratifies the
benchmark selection semantic** that 5.0d's single-rate corpus never
exercised. The new contract is
**"max-over-fresh, fall back to max-over-qualifying, else pilot_empty"**
— a load-bearing change from 5.0d's "max-over-qualifying with
freshness-as-decorator" behavior. Under the new semantic, the
benchmark headline card never shows stale data when fresh data
exists, and stale data is still preserved in the manifest (demoted,
not dropped).

On delivery the pipeline produces:

- **217 / 217 tests pass** (up from 205 in 5.0d; +12 new selection
  tests including the load-bearing stale-fresh crossover).
- **4 / 4 CI gates pass**.
- Pipeline refresh → APPROVED → publish round-trip succeeds at
  `run_id 2026-04-22T20:00:01.000Z` (one second after the 5.0d
  snapshot, per the publish gate's wall-clock-regression check).
- `npm run build` renders 32 pages.
- `/rates` renders:
  - benchmark card **4.60%** sourced to MVA II (both rates fresh;
    MVA II wins by primary comparator axis)
  - rate table row 1: Secure Term MVA II, 4.60%
  - rate table row 2: Secure Term Choice II, 4.50%
  - both variant names link to the shared `/reviews/new-york-life-
    secure-term-myga` MDX (variant-vs-slug pattern preserved)
- `site.yml.top_myga_public` stays **false**.

---

## The two flags that surfaced during the pre-seed audit

Per the standing directive ("do not silently reconcile; flag and
stop for review" + "if the benchmark max-selection logic turns out
to be implicit, pinned, or first-seen rather than an explicit max-
over-qualifying-fresh, STOP and ask"), two spec-level questions
were surfaced to the user before any code was touched.

### Flag 1 — benchmark selection semantics (load-bearing)

**5.0d code** (single-rate corpus, never multi-rate-tested):
```
max over SHAPE-qualifying rates
→ then check winner's freshness
→ if stale, emit same winner with degraded + stale_myga_rate
```

**5.0e test spec** (from user brief, verbatim): "two qualifying
rates where the higher one is STALE and the lower one is FRESH:
assert top_myga_5yr picks the fresh one, not the stale one."

**These are not equivalent.** Two coherent resolutions were
offered: (A) refactor to max-over-fresh-with-fallback, or (B)
rewrite the 5.0e test wording to match the 5.0d code.

**User ratified Option A.** This is the implementation below.

### Flag 2 — rate sort order (minor)

The 5.0d `sortedRates` key was `(carrier_slug, product_slug,
term_years)`. Both NYL rates share all three keys, so the two-row
order on `/rates` was dependent on YAML insertion order — not
explicitly stated in code. **User ratified Option α**: extend the
sort chain with explicit tiebreaks.

An **optional consistency enhancement** was offered: also insert
`observed_at desc` between `term_years` and `-rate`, to make the
table's within-group ordering mirror the selection comparator.

**Adopted the enhancement** (detailed under "Display-vs-selection
symmetry" below).

---

## Selection algorithm (5.0e-ratified)

Documented in the code directly above the `top_myga_5yr` IIFE in
`data-pipeline/normalize/index.ts` so future contributors land on
the contract before editing:

```
qualifying = qualifyingFiveYearMygaRates(rates)     // shape-only (term===5 ∧ rate>0)
fresh      = qualifying.filter(isFreshFiveYearMygaRate(_, now, window))

if fresh.length > 0:
    winner = max(fresh, by compareMygaTopRateWinner)
    → status "live", not_live_cause null, rate = winner.rate

else if qualifying.length > 0:
    winner = max(qualifying, by compareMygaTopRateWinner)
    → status "degraded", not_live_cause "stale_myga_rate",
      rate = winner.rate                             // demoted, not dropped

else:
    → status "pilot_empty", not_live_cause null, rate = 0
```

### The comparator

**Exported as a module-local function** from
`data-pipeline/normalize/index.ts`:
`compareMygaTopRateWinner(a, b): number`.

Both the fresh-path winner pick and the all-stale fallback winner
pick feed through it, so the two paths can never disagree on
tiebreak semantics. The standalone export also lets the unit test
pin the contract in isolation.

**Total order**:

| Axis | Key | Direction | Rationale |
| :--- | :--- | :--- | :--- |
| primary | `rate` | descending | higher yield wins |
| tiebreak 1 | `observed_at` | descending | fresher observation wins |
| tiebreak 2 | `product_variant_slug` | ascending | deterministic & documented |

No dependence on `now()`; freshness is filtered upstream of the
comparator, not inside it. Pure; idempotent; testable in isolation.

---

## Ratified invariants

Both invariants are covered by red-path test fixtures in
`data-pipeline/__tests__/normalize-myga-selection.test.ts`. If
either ever goes green-when-wrong, the selection algorithm has
silently regressed.

### Invariant (i) — Stale-fresh crossover

> Higher stale + lower fresh ⇒ card is LIVE with the lower fresh
> rate; the stale row still renders in `/rates` with its own stale
> chip.

Covered by the test named
`"falls back to the lower FRESH rate when the higher rate is STALE"`.
The test constructs MVA II at 4.60% observed 10 days ago (stale)
and Choice II at 4.50% observed today (fresh), asserts the card
emits `status: "live"` with `rate ≈ 0.045` and the source
string containing "Choice II", and asserts both rates are still
present in the manifest.

**Why this matters.** Under 5.0d the card would have shown the
stale 4.60% MVA II with a stale chip — a headline number that's
factually real but not actually current. 5.0e guarantees the
headline only shows fresh data when fresh data exists.

### Invariant (ii) — All-stale preservation

> Every rate stale ⇒ card is degraded with
> `not_live_cause: "stale_myga_rate"` and the max-of-stale rate
> value preserved; card does NOT fall back to `pilot_empty`.

Covered by the test named `"demotes to 'degraded' + not_live_cause
='stale_myga_rate' when ALL qualifying rates are stale, and
preserves the MAX-of-stale value"`. Frozen time at 2026-04-30;
both rates observed 10–15 days earlier; card emits `degraded` with
`rate ≈ 0.046` (MVA II wins the max-over-qualifying pick) and a
human-readable note mentioning the freshness window and
`stale_myga_rate`.

**Why this matters.** `pilot_empty` is reserved for "we have zero
real rates in the corpus." A stale rate is still a real rate; if we
demoted the whole card to `pilot_empty`, the rate value would
vanish from the manifest, reviewers would lose the signal, and
downstream consumers wouldn't know which rate triggered the
staleness.

---

## Display-vs-selection symmetry (optional enhancement ADOPTED)

The user's 5.0e brief called this out as optional — "your call"
— and asked for it to be documented whichever way it went. I
adopted it.

**What changed.** `sortedRates` in `data-pipeline/normalize/
index.ts` gained three tiebreak keys at the end of the chain:

```
BEFORE (5.0d):
  (carrier_slug asc, product_slug asc, term_years asc)

AFTER (5.0e):
  (carrier_slug asc, product_slug asc, term_years asc,
   observed_at desc, rate desc, product_variant_slug asc)
```

**Why the inversion vs the selection comparator.** The selection
comparator sorts by `rate desc` first, then `observed_at desc`.
The table sort does the reverse: `observed_at desc` first, then
`rate desc`. This is *deliberate* and differs from pure symmetry.

Rationale: DISPLAY ordering prefers freshness-then-yield so a
freshly observed lower rate still sorts near the top of its
(carrier, product, term) group, mirroring the selection
algorithm's fresh-first precedence. The primary selection axis
(rate) is second in the display chain because once freshness is
the first tiebreak, a higher but stale rate should visibly sort
below a fresh lower one — same reason stale-fresh crossover
demotes the higher stale rate in selection.

In plain English: the top of each (carrier, product, term) group
in the `/rates` table is the rate the benchmark card would pick
IF it were choosing only from that group — with one caveat: the
benchmark card applies freshness as a hard filter, while the
table merely re-orders.

**Concrete effect on the current two NYL rates.** Both observed
2026-04-22; the `observed_at` key ties, so the sort falls through
to `rate desc`. MVA II (4.60%) therefore renders ABOVE Choice II
(4.50%) in the table — the same row the benchmark card picks as
the headline.

**Alternative considered and rejected.** Pure symmetry (`rate desc`
first, then `observed_at desc`) was rejected because it would
make a freshly observed lower rate sort *below* a stale higher
rate in the table, which contradicts the 5.0e selection intent.

---

## Fixes folded in during 5.0e

No silent reconciliation. Every file change is tied to the 5.0e
scope.

1. **`data-pipeline/normalize/index.ts`** — The top_myga_5yr IIFE
   was rewritten end-to-end per the ratified algorithm. The 5.0d
   stale branch's "check winner's freshness" logic is gone; the
   `isFresh` variable and the pre-freshness `qualifying.reduce`
   are both gone. The new module-local
   `compareMygaTopRateWinner` (exported) and `pickMygaTopRate`
   (file-private) live just above `normalize()`.
2. **`data-pipeline/normalize/index.ts`** — The
   `hasQualifyingFiveYearMygaRate` import was removed; the new
   IIFE uses `qualifyingFiveYearMygaRates(...).length` as a
   single source of truth for "is there any qualifying rate?"
   The predicate is unchanged in `predicates/myga.ts` (other
   callers still use it).
3. **`data-pipeline/normalize/index.ts`** — `sortedRates` gained
   three tiebreak keys per the display-vs-selection-symmetry
   decision above.
4. **`data-pipeline/sources/rates.myga.yml`** — Choice II seeded
   as a second array entry. Full provenance block explains the
   source-diligence redo and the selection-interaction contract
   (why two rates live in the file without either being "the
   winner"). The 5.0d comment pointing forward to "a future phase"
   was also updated in place so it no longer mis-describes the
   present.

### Invariant-shaping (no name-pinned test updates required)

- **No test asserted "rates.length === 1" at the corpus level.**
  The pre-seed audit (grep for `toHaveLength(1)`, `length).toBe(1)`,
  `rates[0]`, `mygaRates[0]`) surfaced four false positives and
  zero true hits:
  - `schemas.test.ts:244` — structural round-trip on a single
    `[validRate]` input; local fixture, unrelated to pilot scope.
  - `helpers.test.ts` — `reviewers`/`approvals` length checks in
    unrelated domains (reviewers.yml, shipping approvals).
  - `phase5.test.ts:112` — shipping-downgrade local `notes` array,
    not the normalize-output notes array.
  - `diff.test.ts:92` — `mygaRates[0].rate = ...` on a fresh
    two-element fixture constructed in the same test; `[0]` is
    fine.
- **My own 5.0d integration tests** in
  `normalize-myga-freshness.test.ts` already construct single-rate
  inputs on purpose. Those `toHaveLength(1)` assertions are
  still correct because the fixtures stay single-rate — they're
  asserting "what goes in comes out, no rate is dropped", which
  is a property of the single-rate fixture, not of the pilot
  corpus. They remain untouched in 5.0e.
- **adapters.test.ts** was already rewritten in 5.0d from a
  name-pinned "empty pilot" assertion to invariant-shaped "rates
  non-empty, every rate carries the 5.0d fields." That survives
  a second seed with no changes: 2 is still `> 0`, and both
  rates carry the required fields.
- **`data-pipeline/__tests__/normalize-myga-selection.test.ts` (NEW)
  assertions** are all invariant-shaped: benchmark rate ≈ 0.045
  or ≈ 0.046 with 6-decimal tolerance, variant membership
  asserted with a `Set`, source string checked with `.toContain`.

---

## Benchmark-selection-logic notes (surfaced during execution)

One note for the record that doesn't block delivery but is worth
preserving for the next phase:

- **Comparator purity is now pinned by test.** `compareMygaTopRate
  Winner` is covered by three isolation tests (primary, tiebreak 1,
  tiebreak 2), a full-equality test, and two property-style tests
  (purity under repeated calls; antisymmetry across all three
  axes; deterministic sort across a five-element fixture that
  exercises every axis). Future refactors that "optimize" the
  comparator will hit these tests before shipping.
- **Freshness filter lives outside the comparator.** `compareMygaTop
  RateWinner` does NOT call `isFreshFiveYearMygaRate`. Freshness
  is applied at the call site as a filter, not inside the
  comparator. This is deliberate: the comparator needs to work
  for the all-stale fallback where every element of the input
  set is stale by construction. If freshness were hard-coded into
  the comparator, the all-stale fallback would have to bypass
  it, and you'd end up with two comparators-of-truth instead of
  one.
- **`pickMygaTopRate` throws on empty input.** Both call sites
  pre-check `qualifying.length > 0` or `fresh.length > 0`, so
  the throw is defensive. Noted here because it's the one place
  in the 5.0e refactor where a non-total function snuck in;
  every caller is audited. If a future refactor adds a third
  call site, it MUST pre-check length.

---

## Invariants verified on delivery

- ✅ `MYGA_RATE_FRESHNESS_WINDOW_DAYS === 7` (still, from 5.0d).
- ✅ `isQualifyingFiveYearMygaRate` and `isFreshFiveYearMygaRate`
  are signature-unchanged from 5.0d.
- ✅ `BenchmarkSnapshotSchema` and `BenchmarkNotLiveCauseSchema`
  are schema-unchanged.
- ✅ 5.0c frontmatter cross-field predicate is unchanged.
- ✅ CI Gate 4 (`top-myga-public-requires-nonempty`) is
  unchanged and still passes because `top_myga_public` is false.
- ✅ Benchmark card emits `4.60%` with `status: "live"` and
  citation linking to the NYL Annuities MVA II source string
  (invariant (i) / (ii) NOT triggered at current time + current
  observed_at values).
- ✅ Both rates appear in the manifest; rate table renders two
  rows; MVA II sorts above Choice II via the new tiebreak chain.
- ✅ `site.yml.top_myga_public` stays `false`.
- ✅ `npm run build` emits 32 pages.
- ✅ Idempotency test still passes — the frozen-time snapshot story
  survives both the new rate and the selector refactor.

---

## Out-of-scope for 5.0e (parked, per the user's original brief)

- Seeding rates for other wave-1 carriers (Allianz, Corebridge,
  etc.). Candidate for 5.0f.
- Editorial work on the NYL review body. Its own phase.
- Flipping `site.yml.top_myga_public: true`. Its own sign-off event.
- Wave-2 carrier expansion.
- Term-band generalization (3-yr / 7-yr / 10-yr Choice II rates on
  the same NYL sheet).
- Future `not_live_cause` enum additions (e.g. `fdic_fallback`,
  `adapter_error`). Each is its own phase with its own /rates
  chip audit.

### Cross-group ranking caveat (retroactive backfill, post-5.0e approval)

> The observed_at-before-rate inversion in `sortedRates` is locally
> correct for within-group table ordering, where outer keys
> (`carrier_slug`, `product_slug`, `term_years`) still come first. If
> a future phase adds a cross-group ranking (e.g., "top N MYGA rates
> regardless of carrier"), that ranking must use its own sort — not
> `sortedRates` — because the freshness-before-rate inversion is not
> the right default outside a (carrier, product, term) group.

---

## Review gate

The pipeline is at the review gate. Points to inspect:

1. The two ratified flags and their resolutions (above).
2. The **comparator** (`data-pipeline/normalize/index.ts`, just
   above the `normalize()` entry) — especially the prose comment
   block and the three-axis total order.
3. The **new top_myga_5yr IIFE** — three-branch algorithm with the
   all-stale fallback as an explicit else-if rather than a post-
   hoc decorator.
4. The **`sortedRates` tiebreak chain** and the display-vs-selection
   symmetry decision documented in place.
5. The **seeded Choice II entry** in `data-pipeline/sources/rates.
   myga.yml` — full provenance comments, selection-interaction
   contract, source-diligence redo on 2026-04-22.
6. The **new test file**
   `data-pipeline/__tests__/normalize-myga-selection.test.ts` —
   comparator tests + the four integration tests covering
   invariants (i) and (ii) and both tiebreak axes.

Once approved, the next phase can move to 5.0f (additional
wave-1 carrier rates, e.g. Allianz / Corebridge) without
touching the selector again.
