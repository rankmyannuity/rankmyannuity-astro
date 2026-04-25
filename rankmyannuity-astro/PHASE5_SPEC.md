# Phase 5 Spec

RankMyAnnuity.pro · spec version `1.0` (derived from proposal draft-3)
· ratified 2026-04-22

**Status:** RATIFIED. This is the Phase 5 starting spec. Phase 4
remains approved and frozen. Phase 5 implementation does NOT begin
until the rollout-order and first-wave carrier decisions are made at
Phase 5 kickoff. Those decisions are separate from this policy
ratification and do not reopen any item below.

**Historical record — do not edit.** This document was ratified from
proposal draft-3 on 2026-04-22. The `[NEW in draft-2]` and
`[NEW in draft-3]` markers are preserved throughout so the evolution
from the Phase 4 approval message → draft-1 → draft-2 → draft-3 stays
auditable. Treat those markers as provenance, not TODOs.

**Amending this spec.** Any future change to anything in this
document follows the same draft-1 → draft-2 → draft-3 ratification
pattern used to produce it. Mini-proposals live in their own files;
this file is not amended in place.

**Scope of spec:** the four items from the Phase 4 approval plus
three cross-cutting additions:

1. Treatment of an empty MYGA corpus after the pilot closes.
2. Preventing `PIPELINE_FROZEN_TIME` from being active in production.
3. Visible "pilot / no data yet" state on `/rates` and the calculator
   card.
4. Exact criteria for promoting a carrier from pilot to shipping.
5. `[NEW in draft-2]` Unified "not-live" policy spanning pilot
   carriers, non-live benchmarks, and retired carriers.
6. `[NEW in draft-2]` Pipeline version bump to `0.5.0` once any of
   these land.
7. `[NEW in draft-2]` CI-runnable assertions for gates that must fail
   on PR, not only at publish.

---

## 1. Empty MYGA corpus after the pilot closes

### Today (Phase 4 pilot)

Empty `rates.myga.yml` is treated as a note, not a
`missing_required`. Pilot-by-design: Athene Performance Elite is FIA.
`/rates` renders an attributable empty-state
(`src/pages/rates.astro` lines 93–97). Acceptable for pilot,
unacceptable once top_myga_5yr is broadly surfaced.

### Policy

Add `site.top_myga_public: false` to a new
`data-pipeline/sources/site.yml`. `[NEW in draft-2]` Flag renamed from
`rates_page_public` to `top_myga_public` because the gate is about the
*benchmark*, not the page — it governs every surface that renders
`top_myga_5yr`.

`[NEW in draft-2]` "Empty" is defined strictly. The corpus is empty
for the purposes of this flag iff *either*:

- `rates.myga.yml` has zero entries, **or**
- No entry covers the 5-year term band that `top_myga_5yr` is
  derived from. Concretely: no rate with `term_years === 5` whose
  premium band overlaps the band used for `top_myga_5yr` selection.

**Behavior while `top_myga_public: false`:**

- Empty corpus remains a note, not `missing_required`.
- `top_myga_5yr` renders with the `pilot_empty` status from section 3
  wherever it appears — `/rates`, the calculator benchmark card, and
  any future surface that reads it. `[NEW in draft-2]` Enforcement is
  uniform: every surface, not only `/rates`.
- `[NEW in draft-2]` `/rates` emits
  `<meta name="robots" content="noindex">` while the corpus is empty,
  matching the treatment of pilot carriers under section 5.

**Behavior when `top_myga_public: true`:**

- Empty corpus (by the strict definition above) is promoted to
  `missing_required`. `refresh-data` prints the gap prominently;
  `publish-data` refuses to promote.
- `/rates` drops the `noindex` meta tag (subject to the unified
  not-live policy in section 5 — if some other condition is
  non-live, noindex may still apply).

**Error message at the build gate:**

```
top_myga_public=true, but rates.myga.yml has no 5-year MYGA rate
covering the top_myga_5yr band. Either add a qualifying rate to
data-pipeline/sources/rates.myga.yml, or set top_myga_public=false
in data-pipeline/sources/site.yml.
```

### Open questions

- Where `site.yml` lives. Proposed:
  `data-pipeline/sources/site.yml`, next to `rates.myga.yml` and
  `benchmarks.curated.yml`.
- Whether the exact definition of "band overlap" needs a helper in
  `normalize/` — I'd add one keyed on `premium_band_min` /
  `premium_band_max`, reusing existing range logic rather than
  inventing new.

### `[NEW in draft-3]` Qualifying-rate one-liner

The normalize helper that decides whether the MYGA corpus is empty
carries exactly this specification, as a single comment above the
predicate:

```
// A qualifying 5-year MYGA rate has term_years === 5 AND its
// premium band intersects the top_myga_5yr selection band.
// Reuse existing range logic; do not invent new band math.
```

The predicate itself calls the existing range helper; no new band
arithmetic is introduced.

---

## 2. Preventing `PIPELINE_FROZEN_TIME` from leaking into production

### Today

`PIPELINE_FROZEN_TIME` is consumed by `adapters/types.ts:54` (the
`now()` helper) and set by two test files. No npm script exports it.
Nothing prevents a human shell from exporting it before
`publish-data`.

### Policy

**`publish-data` refusal.** At the top of `cli/publish.ts`:

- If `process.env.PIPELINE_FROZEN_TIME` is set *and*
  `process.env.PIPELINE_ALLOW_FROZEN_PUBLISH !== "1"`, exit 2 with:

  ```
  Refusing to publish with PIPELINE_FROZEN_TIME set. This is a
  test-only variable. Unset it, or set
  PIPELINE_ALLOW_FROZEN_PUBLISH=1 if you are intentionally
  reproducing a historical run for audit.
  ```

**Manifest + audit trail.** The manifest gains a
`frozen_time: string | null` field, sourced from the env var at run
time. `publish-data` refuses a run whose manifest has a non-null
`frozen_time` unless the override env var is set.

`[NEW in draft-2]` **Override bypasses refusal, not audit.** Even
with `PIPELINE_ALLOW_FROZEN_PUBLISH=1`:

- Manifest still records `frozen_time`. Always.
- `REVIEW.md` gains a top-level warning block whenever `frozen_time`
  is non-null:

  ```
  ## ⚠ Frozen time in effect

  This run was produced with PIPELINE_FROZEN_TIME=<value>. All
  `generated_at`, effective-date comparisons, and "as of" UI strings
  reference this frozen timestamp and NOT the real wall clock. Do
  not approve unless you are intentionally reproducing a historical
  run for audit.
  ```

  The warning block renders before the diff, breach, and notes
  sections — it cannot be missed during review.

`[NEW in draft-2]` **`refresh-data` warning banner.** `refresh-data`
does not refuse, but when `PIPELINE_FROZEN_TIME` is set it prints a
visible banner to stderr on start and finish:

```
============================================================
⚠  PIPELINE_FROZEN_TIME=<value> is set. now() is frozen.
   This run is NOT suitable for publishing. Unset the env var
   to produce a real-time run.
============================================================
```

No silent freezing.

`[NEW in draft-2]` **Wall-clock regression check.** `publish-data`
reads the most recently published run's `generated_at` from the
snapshot directory (`data-pipeline/snapshots/normalized-<ts>.json`).
If the current `now()` is earlier than that `generated_at`,
`publish-data` exits 2 with:

```
Refusing to publish: this run's generated_at (<t1>) is earlier
than the most recently published run (<t2>). This usually means
the system clock is wrong or PIPELINE_FROZEN_TIME is set to a
historical value. Fix the clock, or use
PIPELINE_ALLOW_FROZEN_PUBLISH=1 if this is an intentional audit
reproduction.
```

This catches two distinct classes of footgun in one gate: a frozen
time that drifted into publish, and a real system-clock regression.

`[NEW in draft-3]` **First-run carve-out.** When no prior snapshot
exists (i.e. this is the first published run on a fresh snapshots
directory), `publish-data` skips the wall-clock regression check
entirely — there is nothing to compare against. The run proceeds
and `REVIEW.md` records, in its header block:

```
first_published_run: true
```

Subsequent runs always find a prior snapshot and the regression
check runs normally. The flag is recorded on exactly one run in the
history of the repo and is explicit in the audit trail.

### Open questions

- The override env var name. Proposed:
  `PIPELINE_ALLOW_FROZEN_PUBLISH=1`. Ugly on purpose so nobody has
  to patch source to unblock a genuine audit reproduction.
- Whether the wall-clock regression check also applies to
  `refresh-data`. My read: **no**. `refresh-data` is exploratory;
  the gate belongs at publish.

---

## 3. "Pilot / no data yet" label on `/rates` and the calculator card

### Today

`/rates` renders an attributable empty-state (good). The calculator
benchmark card shows `top_myga_5yr = 0.00%` with no qualifier — that
is the biggest credibility risk in the Phase 4 output.

### Policy

Extend `BenchmarkSnapshotSchema` with a strict status field:

```
status: "live" | "pilot_empty" | "degraded"
```

`[NEW in draft-2]` **Status is mutually exclusive and exhaustive, and
this is enforced by schema refinement.** Exactly one rule fires per
benchmark:

- `pilot_empty` iff the curated source for this benchmark is empty
  *and* the emitted `rate === 0`. (For `top_myga_5yr`, "curated source
  is empty" means the strict definition from section 1.)
- `degraded` iff the adapter fell back to a snapshot (e.g. FDIC
  snapshot-fallback path). Never coexists with `pilot_empty`.
- `live` otherwise.

The zod schema uses `.superRefine` to enforce the predicate. A
benchmark where the inferred status disagrees with the emitted value
fails validation at normalize time — no way for a consumer to see a
stale or mislabeled status.

**UI behavior.** Any benchmark surface reading a status ≠ `live`:

- Replaces the numeric display with an em-dash (`—`).
- Shows a chip. Copy is centralized in one module:
  - `pilot_empty` → "Pilot — no rate captured yet"
  - `degraded` → "Stale — using last known snapshot"
- Pages where any benchmark on the page is not `live` get the
  unified not-live treatment from section 5.

`[NEW in draft-2]` **Vitest assertion: non-live surfaces never render
`0.00%`.** A new test file `src/pages/__tests__/benchmark-ui.test.ts`
renders `/rates` and the calculator benchmark card with each of the
three statuses and asserts the following when `status !== "live"`:

```
expect(html).not.toContain("0.00%")
expect(html).toContain("—")          // em-dash is present
expect(html).toContain(expectedChipCopy)
```

`[NEW in draft-3]` **Strengthened numeric-slot assertion.** The test
additionally isolates the benchmark's numeric display slot (via a
dedicated test id on the slot element, e.g. `data-testid="benchmark-value"`)
and asserts that its text content contains no `%` character at all
when `status !== "live"`:

```
const slot = screen.getByTestId("benchmark-value");
expect(slot.textContent).not.toMatch(/%/);
```

This closes a loophole the `0.00%` check alone does not cover: a
future near-zero benchmark value (e.g. `0.01%`) rendering as a
real-looking number on a surface that is definitionally not live.
The em-dash replacement is authoritative; no `%` character on a
non-live benchmark slot, ever.

The test doubles as a regression guard — any UI change that
accidentally rewrites `—` back to a percentage string fails CI.

`[NEW in draft-2]` **REVIEW.md "Degraded benchmarks" section.**
Whenever any benchmark has `status === "degraded"` in a run,
`REVIEW.md` includes a dedicated section listing each degraded
benchmark, its last-known value, snapshot date, and adapter name.
Sits above the "Notes" section, below any frozen-time warning. When
no benchmarks are degraded, the section is omitted (not rendered as
empty).

### Open questions

- Whether `degraded` also links to a methodology page. My read:
  inline snapshot date is enough; methodology link is optional.
- Whether `degraded` should block publish. My read: **no** — snapshot
  fallback is the whole point of having a snapshot. But the REVIEW.md
  section makes it prominent during approval.

---

## 4. Promoting a carrier from pilot to shipping

### Today

Pilot vs shipping is implicit. `PHASE4_CHECKLIST.md` locks scope to
Athene; no schema field distinguishes the two.

### Policy

**MDX frontmatter additions (strict).**

```
status: "pilot" | "shipping" | "retired"    # required
shipping_criteria:                          # required when status === "shipping"
  rates_logged: boolean                     # ≥ 1 rate in rates.myga.yml linked to
                                            # this carrier, OR rates_not_applicable
  rates_not_applicable: boolean             # optional; default false
  rates_not_applicable_reason: string       # [NEW in draft-2] REQUIRED non-empty
                                            # string when rates_not_applicable === true
  products_reviewed: boolean                # every in-scope product has an MDX
  legal_approved: boolean
  compliance_approved: boolean
  sme_reviewed: boolean
retired_reason: string                      # [NEW in draft-2] REQUIRED non-empty
                                            # string when status === "retired"
```

`[NEW in draft-2]` The schema enforces the conditional-required fields
via `.superRefine`: `rates_not_applicable === true` without a
`rates_not_applicable_reason` fails validation; `status === "retired"`
without a `retired_reason` fails validation.

**Sign-off file.** A new `data-pipeline/sources/carriers.shipping.yml`
mirroring the `APPROVED.txt` pattern:

```yaml
shipping_approvals:
  - carrier: athene
    reviewer: <full name>
    approved_at: <ISO 8601 UTC>
    mdx_sha256: <sha256 of reviews/<carrier>.mdx at approval time>
```

`[NEW in draft-2]` **Reviewers allow-list.** A new
`data-pipeline/sources/reviewers.yml` defines the named set of
approved reviewers:

```yaml
reviewers:
  - name: <full name>
    role: <editorial | legal | compliance | sme>
    active_from: <ISO 8601 UTC>
    active_until: <ISO 8601 UTC or null>
```

Any entry in `carriers.shipping.yml` whose `reviewer` field doesn't
match a currently-active name in `reviewers.yml` fails the build.

`[NEW in draft-2]` **Sha256 freshness (formalized).** On every
normalize run, for each carrier with `status: "shipping"` in MDX:

1. Compute the current sha256 of the carrier's MDX file.
2. Look up the matching entry in `carriers.shipping.yml`.
3. If the file's sha256 does not match the approval entry's
   `mdx_sha256`, the pipeline **downgrades the emitted sidecar's
   status to `pilot` for that run** and emits a conflict in
   `conflicts.md`:

   ```
   Carrier 'athene' MDX changed since shipping approval
   (expected sha256 <x>, got <y>). Status downgraded to 'pilot'
   until carriers.shipping.yml is re-approved against the current
   MDX.
   ```

   The carrier stays pilot on every subsequent build until a new
   sign-off entry with a matching sha256 lands. No silent
   shipping-without-approval.

`[NEW in draft-2]` **Status tagging moves to the normalize layer.**
Draft-1 put the promotion gate in `publish-data`. That's the wrong
layer: any code that reads a sidecar (Astro pages, the calculator,
future consumers) should be able to trust the sidecar's `status`
field without re-running publish. So the normalize layer:

- Reads MDX `status`, `shipping_criteria`, and the sha256 freshness
  check.
- Applies the downgrade rule above.
- Writes the final `status` into the sidecar. Emitted sidecars carry
  the authoritative status.

`publish-data` still enforces the approval gate at promotion time
(refuses to promote a run whose REVIEW.md has unresolved conflicts,
etc.), but the pipeline — not the publisher — owns the
pilot/shipping/retired tag.

**Retired carriers.** `[NEW in draft-2]` Explicitly in scope:

- Retired carriers continue to emit sidecars.
- Pages render with `noindex` and a "retired" chip (unified with
  section 5).
- `retired_reason` is required and non-empty; it's surfaced on the
  review page so users landing on old links see the context.

**Athene-specific criteria to be promoted to shipping** (unchanged
from draft-1, restated with the draft-2 additions):

- `rates_logged: true`, OR `rates_not_applicable: true` with a
  written `rates_not_applicable_reason` (plausible: Performance
  Elite is FIA, not MYGA).
- `products_reviewed: true` — every in-scope Athene product MDX
  validates strict.
- `legal_approved`, `compliance_approved`, `sme_reviewed` all
  `true` in frontmatter.
- Fresh `carriers.shipping.yml` entry whose `mdx_sha256` matches
  `reviews/athene.mdx` and whose `reviewer` is active in
  `reviewers.yml`.

### Open questions

- Whether `reviewers.yml` lives in the pipeline `sources/` dir or
  somewhere more governance-y. Proposed: pipeline `sources/` for
  consistency with how `carriers.shipping.yml` lives.

### `[NEW in draft-3]` Reviewer-freshness semantics

An approval entry in `carriers.shipping.yml` is valid iff the
referenced reviewer was **active at that entry's `approved_at`
timestamp**, not merely active today. Concretely, for each
approval the pipeline checks:

```
reviewer.active_from <= approval.approved_at
  AND (reviewer.active_until === null OR
       approval.approved_at <  reviewer.active_until)
```

Retiring a reviewer (setting `active_until` to some future or past
date) does NOT retroactively invalidate past approvals whose
`approved_at` falls within the reviewer's active window. A retired
reviewer cannot approve *new* entries; their existing approvals
remain valid until some other gate (e.g. MDX sha256 drift) forces
re-approval. This keeps the audit trail stable across reviewer
turnover.

### `[NEW in draft-3]` MDX sha256 helper semantics

The sha256 helper for shipping approvals hashes the **exact file
bytes** of the MDX. No byte normalization, no line-ending
normalization, no frontmatter-only subset. A comment change, a
trailing-whitespace change, a CRLF → LF conversion, a single-byte
edit anywhere in the file — all invalidate the approval. This is
intentional: any repo change to the MDX is assumed to be
meaningful unless a reviewer re-asserts it is not by re-signing.

This is documented in the helper itself:

```
// sha256 of the exact bytes of the MDX file. No normalization.
// A line-ending change, a whitespace change, or any other byte-
// level repo change to the MDX invalidates the shipping approval
// by design. Re-approve via carriers.shipping.yml.
```

Consumers of this helper do not get to pass normalization options.
The API is single-argument: a file path.

---

## 5. `[NEW in draft-2]` Unified "not-live" policy

The sections above all reach for the same UI primitives: a chip that
says the current state is not live, and a `noindex` meta tag that
keeps search engines from indexing non-live surfaces. Rather than
each section owning its own copy, draft-2 consolidates them into a
single policy module.

### Definition

A **surface** (page, card, section) is **not live** iff any of:

- It displays at least one benchmark with `status !== "live"`.
- It's scoped to a carrier whose effective `status !== "shipping"`.
- It's the `/rates` page while `top_myga_public === false` and the
  corpus is empty (per section 1).

### UI primitives

One module, `src/lib/ui/liveness.ts`, exports:

- `getSurfaceLiveness(context): "live" | "not_live"` — reads the
  relevant statuses and returns one of two values. No other values
  permitted.
- `NotLiveChip` — Astro component. Copy depends on cause:
  pilot carrier → "Pilot — not publicly shipping"; degraded
  benchmark → "Stale — using last known snapshot"; empty-benchmark →
  "Pilot — no rate captured yet"; retired carrier → "Retired —
  historical reference".
- `notLiveMetaTags(cause)` — returns the exact meta tag set. Always
  includes `<meta name="robots" content="noindex">`.

`[NEW in draft-3]` **Module header invariant.** The file begins with
exactly this header block, and this invariant is enforced by code
review:

```
// liveness.ts — source of truth for "is this surface live?"
//
// INVARIANT: getSurfaceLiveness reads ONLY from:
//   1. sidecar JSON imported via import.meta.glob
//   2. site config (site.yml via its generated consumer module)
//
// It MUST NOT call into other site code (components, layouts,
// hooks, utilities) whose behavior can be overridden per-page,
// per-layout, or at runtime. Doing so would let a page quietly
// override liveness and bypass the noindex + chip policy.
//
// The Vitest liveness test relies on this invariant: it renders
// every route under fabricated sidecar + site-config inputs and
// asserts the UI state. If this module can be influenced by code
// the test doesn't fabricate, the test no longer proves anything.
```

### Gate

Pages that render a not-live surface **must** include both the chip
and the meta tags. A Vitest test at
`src/pages/__tests__/liveness.test.ts` renders every review route
and `/rates` under each combination of statuses and asserts:

- `getSurfaceLiveness(...) === "not_live"` implies presence of
  `<meta name="robots" content="noindex">` in the rendered HTML.
- `getSurfaceLiveness(...) === "not_live"` implies presence of the
  chip component in the rendered HTML.

This test is the single enforcement point for everything the
proposal describes as "show a chip" or "noindex." No page is allowed
to re-implement or inline-override the policy.

---

## 6. `[NEW in draft-2]` Pipeline version bump to `0.5.0`

All draft-2 additions break the existing sidecar shape in schema-
compatible but value-incompatible ways: new required fields
(`status`, `shipping_criteria` conditionals, `retired_reason`), new
benchmark field (`status`), new sign-off file structure. When the
first of these lands, `PIPELINE_VERSION` moves from `"0.4.0"` to
`"0.5.0"`.

The existing `z.literal("0.4.0")` check in
`ReviewSidecarSchema.pipeline_version` and
`ManifestSchema.pipeline_version` becomes `z.literal("0.5.0")`. Any
consumer still holding 0.4.0 sidecars fails loudly — exactly the
intended behavior for a schema drift.

One bump covers all the draft-2 additions. We do not increment
mid-phase.

---

## 7. `[NEW in draft-2]` CI-runnable assertions

Draft-1 treated all gates as publish-time gates. That's too late for
anything that should fail on a PR. Before Phase 5 kickoff we decide,
per gate, whether a CI assertion is also needed.

**Candidates to decide at Phase 5 kickoff.** `[NEW in draft-3]`
Votes recorded at draft-2 ratification are noted; final ratification
of the list still happens at kickoff, but we enter kickoff with
intent already declared, not a blank slate:

- PRs that change any MDX `status` to `"shipping"` without a
  matching, fresh entry in `carriers.shipping.yml`.
  **Vote: YES** (same-PR fix required).
- PRs that add a `PIPELINE_FROZEN_TIME` default to any npm script or
  CI workflow.
  **Vote: YES**.
- PRs that touch a MDX file whose `status: "shipping"` approval's
  `mdx_sha256` no longer matches.
  **Vote: YES** (same-PR fix required — re-approve via
  `carriers.shipping.yml` in the same PR that changes the MDX).
- PRs whose `site.yml` sets `top_myga_public: true` while the MYGA
  corpus is empty (per the strict section-1 definition).
  **Vote: YES**.
- PRs that break the unified liveness test.
  **Already covered** by the existing Vitest suite running in CI.
  No new check needed.

The final list is ratified at Phase 5 kickoff. This section exists so
we enter kickoff with a concrete list and declared intent rather than
re-deriving either.

---

## Summary of ratified defaults (draft-3)

| # | Item | Default answer |
|---|------|----------------|
| 1 | Empty MYGA corpus | Flag `site.top_myga_public` (renamed from `rates_page_public`). Empty defined strictly as "no 5-year entry covering the top_myga_5yr band." When false and empty: uniform `pilot_empty` status across every surface plus `noindex` on `/rates`. When true and empty: `missing_required`; publish refused. |
| 2 | `PIPELINE_FROZEN_TIME` | `publish-data` refuses when set; override `PIPELINE_ALLOW_FROZEN_PUBLISH=1`. Override bypasses refusal only — manifest always records `frozen_time` and REVIEW.md always renders a warning block. `refresh-data` prints a stderr banner. `publish-data` also refuses when wall clock regresses vs last published run. |
| 3 | Not-live benchmark UI | Schema field `status: live \| pilot_empty \| degraded`, mutually exclusive via `.superRefine`. UI replaces value with em-dash, shows chip. Vitest asserts non-live surfaces never output `0.00%`. REVIEW.md gains dedicated "Degraded benchmarks" section when any are degraded. |
| 4 | Pilot → shipping | `status` + `shipping_criteria` in MDX (strict, with `.superRefine` for conditional required fields). `rates_not_applicable_reason` required when rates N/A. `retired_reason` required when retired. `carriers.shipping.yml` sign-off + `reviewers.yml` allow-list. Sha256 of MDX formalized: any MDX change downgrades the carrier to pilot until re-approved. Status tagging owned by normalize layer; publish still enforces approval. |
| 5 | Unified not-live policy | One module (`src/lib/ui/liveness.ts`) owns chip + noindex. Applies to pilot carriers, non-live benchmarks, empty-benchmark pages, retired carriers. Single Vitest test enforces. |
| 6 | Version bump | `PIPELINE_VERSION` → `"0.5.0"` on first draft-2 change; update `z.literal` checks. |
| 7 | CI assertions | Per-gate decision at Phase 5 kickoff. Candidate list enumerated above. |

---

## Deliberately out of scope (unchanged from draft-1)

- Rollout order after Athene (which carrier is next, how many in the
  first wave) — Phase 5 kickoff decision, per your note.
- Editorial or brand-voice guidelines for new reviews.
- Monitoring / alerting when FRED or FDIC endpoints drift upstream
  between runs.
- Automation of the reviewer step.

---

## Ratification record

All seven items approved at draft-2 on 2026-04-22, with five
implementation clarifications pinned as text in draft-3 (items 1, 2,
3, 4, 5 above). Draft-3 was ratified on 2026-04-22 as the Phase 5
starting spec and committed as this file.

Phase 5 implementation does not start until the rollout-order and
first-wave carrier decisions are made at Phase 5 kickoff, separate
from this policy ratification.

### Kickoff agenda (locked)

Phase 5 kickoff has exactly three agenda items. Anything else that
comes up at kickoff is deferred to its own mini-proposal following
the draft-1 → draft-2 → draft-3 pattern. Do not let kickoff expand.

1. Ratify the seven candidate CI gates in §7 above, using the votes
   already declared in draft-3 as the default.
2. Ratify rollout order after Athene (next carrier, first-wave size).
3. Ratify any first-wave-specific exceptions (target: none).

### Implementation note (kickoff-time confirmation, not a spec change)

The Vitest benchmark-value slot assertion in §3 relies on the
`data-testid="benchmark-value"` attribute being present on every
non-live benchmark surface. This must be emitted **structurally** —
by the benchmark rendering helper or by the `NotLiveChip`‑adjacent
value component — not added per-page. If any page can forget the
attribute, the assertion passes trivially and the §3 guarantee is
void. Confirm this at kickoff; log the confirmation in the kickoff
notes. This is an implementation note; it does not reopen §3.
