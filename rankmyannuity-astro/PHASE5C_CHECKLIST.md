# Phase 5.0c — Review Checklist

**Scope:** Wave-1b MassMutual rename + shared cross-field frontmatter refine extraction.
**Status:** Held at review gate. No further work started.
**PHASE5_SPEC.md:** Unchanged.

---

## 1. MassMutual wave-1b rename — all 6 points

| # | Change | Before | After | Verified |
|---|--------|--------|-------|----------|
| 1 | Carrier slug | `mass-mutual` | `massmutual` | ✓ MDX, sidecar, URL |
| 2 | Carrier display name | `Mass Mutual` | `MassMutual` (one word) | ✓ frontmatter + rendered page title |
| 3 | Product slug | `mass-mutual-stable-voyage` | `massmutual-stable-voyage` | ✓ MDX, sidecar, URL |
| 4 | Product `carrierSlug` FK | `mass-mutual` | `massmutual` | ✓ product frontmatter |
| 5 | `relatedReviews` cross-refs | `mass-mutual` / `mass-mutual-stable-voyage` | `massmutual` / `massmutual-stable-voyage` | ✓ both MDX files (bidirectional) |
| 6 | Sidecar filenames | `mass-mutual.json`, `mass-mutual-stable-voyage.json` | `massmutual.json`, `massmutual-stable-voyage.json` | ✓ regen via refresh→publish round-trip |

### Post-rename verification gates

- [x] `npm test` → 184/184 (173 pre-existing + 11 new predicate tests). No regressions.
- [x] `npm run ci:check` → 4/4 PASS (shipping-requires-approval, forbid-frozen-time-default, shipping-sha256-match, top-myga-public-requires-nonempty).
- [x] Refresh → publish round-trip clean. 22 sidecars promoted. No `mass-mutual*.json` residue in `src/generated/reviews/`.
- [x] `npm run build` → 32 pages built.
- [x] `/reviews/massmutual/` renders with `name="robots" content="noindex,nofollow"` and the "Pilot Scaffold (not live)" chip.
- [x] `/reviews/mass-mutual/` and `/reviews/mass-mutual-stable-voyage/` routes do NOT exist in `dist/`.
- [x] `scripts/scaffold-wave1.ts` updated so regeneration stays consistent (MassMutual entry uses the new slug + display name, with a Phase 5.0c comment noting the rename).

---

## 2. Cross-field refine extraction — canonical predicate module

### New file
- `data-pipeline/predicates/frontmatterCrossField.ts` (canonical single source of truth).

### Design decisions honored
- **Single-purpose, single-argument, side-effect-free API.** Input is a plain `FrontmatterCrossFieldInput` record; output is a plain `FrontmatterCrossFieldIssue[]`. No options bag, no normalization flags, no zod dependency in the predicate itself.
- **Zod-free by design.** The predicate returns `{ path, message }` records. Each call site wraps them into `ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...issue.path], message: issue.message })` using its own `z`. This avoids coupling the Astro-side zod version to the pipeline-side zod version.
- **Shared-contract docstring at module top.** Names all three call sites and states that any change must update all three in the same PR. Pattern mirrors `data-pipeline/predicates/myga.ts`.
- **No generalization beyond current fields.** The three rules enforced are exactly the three that existed pre-extraction:
  - Rule 1 (carrier only): `status === "shipping"` ⇒ `shipping_criteria` present
  - Rule 2 (carrier only): `shipping_criteria.rates_not_applicable === true` ⇒ `rates_not_applicable_reason` non-empty
  - Rule 3 (carrier OR product): `status === "retired"` ⇒ `retired_reason` non-empty
- **Stable issue order.** Issues are emitted rule-1, then rule-2, then rule-3, so zod output is deterministic.

### Back-compat shim
Not required. The pre-extraction logic lived inline inside three `.superRefine` callbacks (no importable helper module). No external import paths existed, so no shim is needed. New code should import from `data-pipeline/predicates/frontmatterCrossField.ts` directly.

---

## 3. Three refine call sites wired — identical paths + messages preserved

| Call site | Kind input | Rules applied | Error path + message preserved |
|-----------|------------|---------------|-------------------------------|
| `data-pipeline/schemas/carrier.ts` (lines 111-129) | `"carrier"` | 1 + 2 + 3 | ✓ byte-for-byte |
| `data-pipeline/schemas/product.ts` (lines 70-87) | `"product"` | 3 only | ✓ byte-for-byte |
| `src/content/config.ts` (lines 175-202) | discriminated union; selects `"carrier"` or `"product"` per `val.kind` | Same as corresponding pipeline schema | ✓ byte-for-byte |

Error-path and message strings (verbatim, unchanged from pre-extraction):

- Rule 1 → `path: ["shipping_criteria"]`, message: `"shipping_criteria is required when status === 'shipping'"`
- Rule 2 → `path: ["shipping_criteria", "rates_not_applicable_reason"]`, message: `"rates_not_applicable_reason is required (non-empty) when shipping_criteria.rates_not_applicable === true"`
- Rule 3 → `path: ["retired_reason"]`, message: `"retired_reason is required (non-empty) when status === 'retired'"`

The refresh+publish diff vs the pre-extraction snapshot was **0 added, 0 removed, 0 modified** — confirming the extraction is behavior-preserving at the pipeline boundary.

---

## 4. Predicate unit tests — 11 cases

File: `data-pipeline/__tests__/predicates-frontmatter-cross-field.test.ts`

Carrier rule coverage (6 cases):
1. Carrier shipping without shipping_criteria → rule 1 fires.
2. Carrier rates_not_applicable === true without reason (missing + whitespace-only) → rule 2 fires.
3. Carrier retired without retired_reason (missing + whitespace-only) → rule 3 fires.
4. Carrier pilot, no optional fields → no issues.
5. Carrier shipping WITH shipping_criteria (no rates_not_applicable) → no issues.
6. All valid: shipping + rates_not_applicable=true + reason provided → no issues.

Product rule coverage (2 cases + 1 guard-rail):
7. Product retired without retired_reason → rule 3 fires.
8. Product pilot, no optional fields → no issues.
9. Guard-rail: rules 1 and 2 NEVER fire for `kind === "product"`, even if the input accidentally carries a `shipping_criteria` shape.

Purity / determinism (2 cases):
10. Predicate is pure and does not mutate its input (JSON snapshot before/after).
11. Issues emit in stable rule-order (rule 2 before rule 3 when both fire).

All 11 tests pass. Total suite: 184/184.

---

## 5. Standing-directive compliance

- [x] PHASE5_SPEC.md untouched.
- [x] No MDX duplication into secondary YAML.
- [x] No silent backfills or invented numbers.
- [x] No editorial work; no new scaffolds; no change to wave-1 corpus beyond the slug/display-name rename.
- [x] Phase 3 DO-NOT-FIX items untouched (green-blob grade indicator stays).
- [x] Shipping promotion stays a separate per-carrier approval event; cross-field rules only *validate* criteria when present, they do not *promote* anything.
- [x] Outer `.superRefine` on the Astro discriminated union preserved (shape already ratified in 5.0a as an ergonomics fix).
- [x] No mid-point check-ins. Todo list kept current throughout.

---

## 6. File diff summary

Added:
- `data-pipeline/predicates/frontmatterCrossField.ts` — canonical predicate.
- `data-pipeline/__tests__/predicates-frontmatter-cross-field.test.ts` — 11 unit tests.
- `PHASE5C_CHECKLIST.md` — this file.

Modified:
- `data-pipeline/schemas/carrier.ts` — `.superRefine` body replaced with delegation to shared predicate; new import.
- `data-pipeline/schemas/product.ts` — `.superRefine` body replaced with delegation to shared predicate; new import.
- `src/content/config.ts` — outer `.superRefine` body replaced with delegation to shared predicate; new import via relative path `../../data-pipeline/predicates/frontmatterCrossField`.

Rename-driven changes (from the 6-point rename directive):
- `src/content/reviews/mass-mutual.mdx` → `src/content/reviews/massmutual.mdx` (regenerated; display name collapsed to `MassMutual`).
- `src/content/reviews/mass-mutual-stable-voyage.mdx` → `src/content/reviews/massmutual-stable-voyage.mdx` (regenerated; `carrierSlug: massmutual`; `relatedReviews: [massmutual]`).
- `src/generated/reviews/mass-mutual.json` + `mass-mutual-stable-voyage.json` removed; `massmutual.json` + `massmutual-stable-voyage.json` promoted via refresh→publish.
- `scripts/scaffold-wave1.ts` — MassMutual entry updated with new slug + display name, commented as the Phase 5.0c rename anchor.

No changes to:
- `PHASE5_SPEC.md`
- `PHASE5_KICKOFF.md`
- `data-pipeline/normalize/*`
- `data-pipeline/publish/*`
- `scripts/ci/*`
- `data-pipeline/sources/carriers.shipping.yml` (still empty)
- `data-pipeline/sources/rates.myga.yml` (still empty)
- `src/data/site.yml` (`top_myga_public: false` retained)

---

## 7. Held for later waves (NOT touched in 5.0c)

- Populating `rates.myga.yml` with real MYGA rates (highest-value next step; gated behind 5.0c approval).
- Editorial promotion of any wave-1 carrier toward `shipping`.
- Wave-2 carrier expansion (LIMRA ranks 12+).
- Flipping `site.yml.top_myga_public` to `true` (gated by CI Gate 4).
- Term-band generalization of the MYGA predicate (3-yr / 7-yr / 10-yr).
- Future cross-field rule additions (each requires a PHASE5_SPEC.md amendment).

---

## 8. Resume path if approved

After approval, the next unit of work is rates seeding (populating `rates.myga.yml` against the 10 wave-1 MYGA products) — per the pre-existing "held for later" order. No work has been started beyond 5.0c.
