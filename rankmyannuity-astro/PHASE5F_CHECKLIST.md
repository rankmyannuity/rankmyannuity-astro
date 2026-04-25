# Phase 5.0f — Seed second-carrier 5-yr MYGA rate

**Status:** Ready for review
**Run ID:** `2026-04-22T20-00-02-000Z` (frozen clock, reviewer-approved for this pilot)
**Scope:** Seed exactly one second-carrier MYGA rate into the corpus so the benchmark + rates table + cross-carrier selection logic run on a mixed-carrier dataset for the first time. In-phase scope expansion to scaffold ONE MYGA product MDX (Option A, ratified).

---

## 1. Pre-seed blocker + Option A resolution

### Blocker surfaced
Prior to executing Phase 5.0f as originally specified, the wave-1 product MDX inventory was audited against the new rate entry's required foreign-key target (a `carrierSlug + productSlug` pair owned by a non-NYL carrier). Result:

- All 11 wave-1 **product** scaffolds are typed `productType: FIA` or indexed/registered variants (Allianz Benefit Control, Athene Performance Elite, Equitable Structured Capital Strategies, Jackson Market Link Pro, Lincoln OptiBlend, MassMutual Stable Voyage, Nationwide Peak 10, Pacific Index Foundation, Prudential FlexGuard). The one MYGA-typed product scaffold (`new-york-life-secure-term-myga`) is owned by NYL — the same carrier already represented in the rates corpus.
- Therefore seeding a second-carrier MYGA rate with no in-repo product MDX to foreign-key against would fail `refresh-data` frontmatter FK predicate (5.0c lock).

### Resolution — Option A ratified by user
Scope-expand 5.0f in-phase to scaffold exactly ONE new MYGA product MDX for the selected second carrier, matching wave-1 shape byte-for-byte with one intentional divergence (see §6). Preference order: **Corebridge → Pacific Life**. Allianz excluded substantively (no MYGA lineup through independent distribution — FIA-only).

> User verbatim: *"If all three fail — or require aggregator-sourced rates — STOP and report."*

---

## 2. Source-diligence trail (per carrier)

### Allianz Life — EXCLUDED (substantive)
Allianz Life's annuity product lineup via the independent-producer channel consists exclusively of FIAs (Benefit Control, Accumulation Advantage, etc.). No MYGA SKU is published by Allianz Life for independent distribution. Excluded before web verification; would not satisfy "5-yr MYGA rate present" criteria regardless of publishing behavior.

### Corebridge Financial — FAILED
- **MYGA product identified:** American Pathway Advisory (5-year MYGA variant).
- **First-party domain:** `corebridgefinancial.com` — consumer retirement pages link out to the institutional `/ir/ria/` subdomain for the Advisory product.
- **Rate availability:** The American Pathway Advisory product page at [corebridgefinancial.com/ir/ria/advisory-solutions/american-pathway-advisory](https://www.corebridgefinancial.com/ir/ria/advisory-solutions/american-pathway-advisory) is **RIA-channel-only** and publishes no consumer-accessible 5-year rate. The retail consumer rate page gates rate disclosure behind an email request to `IA@corebridgefinancial.com`.
- **Outcome:** Does not satisfy "first-party domain, no gate, 5-yr MYGA rate present" criteria. Email-gate on rate retrieval disqualifies under the source-diligence checklist.

### Pacific Life — PASSED (Read B literal criteria, with caveat)

**Source:** [ria.pacificlife.com/home/rates.html](https://ria.pacificlife.com/home/rates.html)
**Product:** Pacific Harbor (5-year MYGA)
**Observed rate:** 5-year $200,000+ tier = **5.15%**; under-$200k tier = 4.90%
**Effective date:** 2026-04-16
**Observed at:** 2026-04-22

**Ambiguity flagged during diligence:**
- **Read A (strict first-party consumer channel):** The `ria.pacificlife.com` host is a Pacific Life Advisory (RIA) subdomain with "Pacific Life Advisory" branding in the page header and a doc code `FAC2904-RIA-00` on the rate sheet. Under a strict read, this is a producer-channel document rather than a consumer-facing publication and would be treated like the Corebridge RIA page (fail).
- **Read B (literal source-diligence checklist):** The page has (a) no login gate, (b) no advisor-only disclaimer text, (c) is on the `pacificlife.com` first-party domain, (d) discloses the current effective date, and (e) publishes the 5-year rate with explicit premium bands. Under literal application of the written criteria, it passes.

**User ratified Option 3:** Accept Read B (literal pass) with an explicit **channel-branding caveat** documented durably in two places: this checklist (full verbatim) and the new product MDX body (compressed 1-2 sentences as factual prose).

**Verbatim caveat for durable record:**

> The Pacific Harbor 5-year rate used here is sourced from Pacific Life's RIA channel rate sheet (host `ria.pacificlife.com`, page-branded "Pacific Life Advisory", doc code `FAC2904-RIA-00`). While the page itself carries no login gate or advisor-only disclaimer and is on the first-party `pacificlife.com` domain, it is a producer-channel publication rather than a consumer-direct rate announcement. The rate is used here as a first-party primary source under the literal source-diligence checklist criteria. Consumer retail pricing for Pacific Life fixed annuities may differ when purchased through a non-RIA channel. A future source-diligence iteration may want to distinguish "first-party consumer publication" from "first-party producer-channel publication" as a first-class axis on `sources[]`.

**State availability:** Pacific Harbor is not available in New York (disclosed on the same rate sheet).

---

## 3. Rendering carrier-pinning audit — CLEAN

### Methodology
Grep scope: `src/pages/rates.astro`, `src/lib/ui/`, `data-pipeline/normalize/`, `data-pipeline/schemas/` — all runtime/rendering code that could plausibly hardcode a carrier identity.

### Patterns searched (case-insensitive)
- Literal carrier names: `New York Life`, `NYL`, `Pacific Life`, `Pacific Harbor`, `Corebridge`, `Allianz`
- Carrier slugs: `new-york-life`, `pacific-life`
- Any string-equality branch on `carrierSlug` or `carrier_slug`

### Result
**CLEAN.** No runtime file in the rendering pipeline contains carrier-specific branches or literal carrier-name string comparisons. The `/rates.astro` renderer iterates over the published `myga.json` rate set and renders the top-per-term winner from `benchmarks.json` via pure data-driven selection in `predicates/myga.ts`. The only carrier-name string is produced downstream as the source-citation label, which is assembled from the rate entry's own `source.label` field — never gated on carrier identity.

This clears the 5.0f invariant: *"If any rendering code hardcodes a carrier name, flag and stop — do not patch forward."* The second-carrier seed is a pure data change; no renderer patch required.

---

## 4. Wave-1 shape observation — Phase 6 planning input

During the pre-seed audit, it was observed that the 11 wave-1 product scaffolds are all FIA-typed. This means the 5.0f scope expansion — which requires scaffolding the corpus's **first** MYGA-typed product MDX owned by a non-NYL carrier — establishes a shape precedent for every future non-NYL MYGA product. Specifically:

- `scripts/scaffold-wave1.ts` emits FIA bodies. It was NOT modified in 5.0f. It remains idempotent and will continue to emit the wave-1 FIA shape on re-run. The new Pacific Harbor MDX diverges structurally from the generator output in one controlled way (see §6). This divergence is accepted because the generator does not read MDX back in at build time; the MDX is the source of truth.

---

## 5. Cross-carrier winner transition — FIRST IN CORPUS

Before 5.0f, the MYGA corpus had 2 rates, both NYL. The top_myga_5yr benchmark was NYL Secure Term MVA II 4.60% (live), and the source citation on the `/rates` benchmark card referenced `nylannuities.com`. After 5.0f, the corpus has 3 rates spanning 2 carriers:

| Carrier | Product | Term | Rate | Status | Effective |
|---------|---------|-----:|-----:|--------|-----------|
| new-york-life | Secure Term MVA II | 5y | 4.60% | fresh | 2026-04-27 |
| new-york-life | Secure Term Choice II | 5y | 4.50% | fresh | 2026-04-27 |
| pacific-life | Pacific Harbor | 5y | 5.15% | fresh | 2026-04-16 |

**Verified at build:** `/rates` page now renders
- Benchmark card: 5-yr MYGA (top rate) = **5.15%** status:live, source citation link text `"Pacific Life Pacific Harbor 5-year $200k+ rate — ria.pacificlife.com (Pacific Life Advisory), effective 2026-04-16"`, href `https://ria.pacificlife.com/home/rates.html`
- Rate table: 3 rows in rate-desc order (5.15% / 4.60% / 4.50%)

This is the first build in which the `/rates` benchmark source citation references a carrier other than NYL — validating that `compareMygaTopRateWinner` and the `benchmarks.generated.ts` emitter are carrier-agnostic in practice, not just in theory.

---

## 6. Wave-1 scaffold divergences — Pacific Harbor MDX

The new `pacific-life-pacific-harbor.mdx` file matches wave-1 product scaffolds byte-for-byte with the following intentional, user-ratified divergences:

| Dimension | Wave-1 | 5.0f Pacific Harbor | Reason |
|-----------|--------|---------------------|--------|
| Section heading #2 | `## Scope of this pilot review` | `## Scope and availability` | **P3-with-rename ratified.** Wave-1 bullet phrasing is preserved verbatim inside the renamed section. The rename reflects that the section now carries factual availability information (NY unavailability + channel-branding caveat) in addition to pilot-scope language. Rename applies to this MDX ONLY. Propagation to other 10 wave-1 scaffolds is deferred to Phase 6+. |
| Bullets inside scope section | 4 bullets | 6 bullets — 4 wave-1 verbatim + 2 factual bullets | (a) State availability: "Pacific Harbor is not available in New York."; (b) Channel-branding caveat: compressed 1-2 sentence prose noting the rate sheet is from the `ria.pacificlife.com` RIA channel with Pacific Life Advisory branding, used under literal first-party criteria. |
| `sources[]` count | 2 (LIMRA total + LIMRA fixed) | 3 (LIMRA total + LIMRA fixed + Pacific Life Advisory rate sheet) | The rate sheet URL must appear in sources for citation integrity, matching the source cited by the rate entry in `rates.myga.yml`. |
| `verdict` field | Omitted (schema default `{}`) | Omitted (schema default `{}`) | No divergence. Reaffirming the wave-1 pattern: pilot product scaffolds omit `verdict` entirely and let the schema default fill it. |
| `status` | `pilot` | `pilot` | No divergence. Triggers automatic `noindex,nofollow` + "Pilot Scaffold" chip rendering — verified at build. |
| `watchouts` | Omitted (schema default `[]`) | Omitted (schema default `[]`) | No divergence. |

### Confirming rename has no runtime consumer
`grep -rni "Scope of this pilot review"` across `src/`, `data-pipeline/`, `scripts/`, excluding `dist/`, `.astro/`, `node_modules/`: only matches are in the existing wave-1 MDX bodies and the generator template — no renderer, schema, predicate, or CI gate keys off this string. The rename is safe.

---

## 7. Lock verification

All 5.0f non-negotiable locks verified intact:

- [x] `data-pipeline/predicates/myga.ts` — unchanged
- [x] `MYGA_RATE_FRESHNESS_WINDOW_DAYS` — unchanged
- [x] `BenchmarkSnapshotSchema` — unchanged
- [x] `BenchmarkNotLiveCauseSchema` — unchanged
- [x] `compareMygaTopRateWinner` — unchanged
- [x] `sortedRates` tiebreak chain — unchanged
- [x] 5.0c frontmatter FK predicate — unchanged
- [x] CI gates (all 4) — unchanged, all PASS
- [x] `site.yml.top_myga_public` — remains `false`
- [x] No new schema fields introduced
- [x] No sidecar / manifest shape changes

---

## 8. Test coverage

- **Total: 220/220 tests pass** across 14 test files
- **New in 5.0f:** `data-pipeline/__tests__/normalize-myga-cross-carrier.test.ts` — 3 tests covering:
  1. **Cross-carrier selection (fresh):** NYL 4.60% fresh + Pacific Harbor 5.15% fresh → winner = Pacific Harbor 5.15% (source citation references Pacific Life). Re-affirms invariant (i).
  2. **Cross-carrier all-stale:** NYL 4.60% stale + Pacific Harbor 5.15% stale → benchmark status `degraded`, `not_live_cause=stale_myga_rate`, winner = max-of-stale across carriers = Pacific Harbor 5.15%. Re-affirms that staleness is computed per-entry and max-selection is carrier-agnostic.
  3. **Cross-carrier stale-fresh crossover:** NYL 4.60% fresh + Pacific Harbor 3.75% stale → winner = NYL 4.60% fresh. Inverse case (NYL stale higher + Pacific Harbor fresh lower → Pacific Harbor fresh lower wins) also verified. Re-affirms invariant (i): a fresh rate beats a stale rate regardless of numeric comparison and regardless of carrier.

No existing test required modification.

---

## 9. Phase 6+ planning inputs

Observations captured in 5.0f that inform Phase 6 decisions. These are NOT scheduled for 5.0f execution:

- **(a) First-class `state_unavailable` / `unavailable_states` frontmatter field.** The Pacific Harbor NY unavailability is currently encoded as a prose bullet in the MDX body. A structured field (array of 2-letter state codes) would let the rates table render a state-availability column, let the calculator filter by user state, and let CI enforce availability-claim/source-citation pairing. Decision point: field on the product MDX vs. field on the rate entry vs. field on the carrier.

- **(b) Per-source `note` / `caveat` mechanism.** The Pacific Life channel-branding caveat currently lives in the MDX body as prose. A structured subfield on `sourceSchema` (e.g. `sources[].caveat?: string`) or a parallel `source_notes` collection would let caveats render inline with the source citation on both the review page and the rates table citation, improving transparency without breaking the current `{label, url, publisher?, accessed?}` shape. This was the natural place the `note:` subkey was attempted in 5.0f and correctly rejected (user error — not in schema); Phase 6 should design it properly.

- **(c) Review `verdict.default({})` pattern for pilot-status scaffolds.** Works as designed; 5.0f reaffirms it. Phase 6 should decide whether to extend the same defaulting treatment to any new fields introduced (per (a) above), or whether pilot-status scaffolds should be allowed to diverge in frontmatter shape.

- **(d) `## Scope and availability` rename propagation.** The rename is applied to Pacific Harbor only in 5.0f. Phase 6 should decide whether to (i) propagate the rename to the other 10 wave-1 product scaffolds as a mechanical renaming commit, (ii) keep the wave-1 scaffolds at `## Scope of this pilot review` and adopt the new heading only for MYGA-typed pilots, or (iii) let the heading track whether the section contains factual content (FIA scaffolds remain pure-pilot-scope; MYGA scaffolds gain factual bullets and the renamed heading). Each option has different implications for the generator (`scripts/scaffold-wave1.ts`).

---

## 10. Artifacts

- **New MDX:** `src/content/reviews/pacific-life-pacific-harbor.mdx` (85 lines)
- **Modified MDX:** `src/content/reviews/pacific-life.mdx` (added relatedReviews FK + Product bench bullet)
- **Modified data:** `data-pipeline/sources/rates.myga.yml` (5.0f section header + ~78-line provenance block + 1 new rate entry)
- **New test:** `data-pipeline/__tests__/normalize-myga-cross-carrier.test.ts` (328 lines, 3 tests)
- **New sidecar:** `src/generated/reviews/pacific-life-pacific-harbor.json` (published)
- **Publish run:** `data-pipeline/reports/2026-04-22T20-00-02-000Z/`

---

## 11. Standing-directive flags raised (reference log)

Four flag-and-stop events occurred during 5.0f. Per user: *"Four flags in one sub-task is fine. The directive is working as intended."*

1. **Pre-seed scope blocker** (wave-1 product scaffolds all FIA-typed) → Option A ratified (scope expansion).
2. **Corebridge rate-gate ambiguity** (email request = gate?) → Ratified as fail per source-diligence checklist.
3. **Pacific Life RIA channel ambiguity** (Read A vs Read B) → Option 3 ratified (Read B + durable caveat).
4. **`sources[].note` schema ambiguity** (subfield not in sourceSchema) → Option Y ratified (retract subkey, use MDX body prose).
5. **Section heading ambiguity** (no wave-1 section fits factual content) → P3-with-rename ratified.

(Counted as four substantive flags; item 4 and the initial subfield attempt were parts of the same resolution thread.)

---

## Review gate

- [x] Pre-seed blocker documented and resolved
- [x] Source-diligence trail complete for all three carriers
- [x] Rendering carrier-pinning audit: CLEAN
- [x] One new MYGA product MDX scaffolded byte-for-byte with wave-1 except intentional, ratified divergences
- [x] One new rate entry seeded with full provenance comments
- [x] 3 cross-carrier tests authored and passing
- [x] 220/220 tests pass
- [x] CI: all 4 gates PASS
- [x] Build: 33 pages, `/rates` renders 3 rows + Pacific Harbor 5.15% benchmark + Pacific Life source citation
- [x] `/reviews/pacific-life-pacific-harbor/` renders `noindex,nofollow` + Pilot chip
- [x] All locks intact; `top_myga_public` stays `false`
- [x] Phase 6 planning inputs captured

**Ready for your review.**
