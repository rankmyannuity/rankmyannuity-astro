# Migration map — RankMyAnnuity.pro → Astro

Phased plan showing where each current-site feature moves and when. Phase 1
is complete in this scaffold; every later phase is explicitly deferred.

---

## Phase 1 — Architecture & scaffolding  ✅ (this commit)

- Astro project, integrations (React, MDX, Tailwind, Sitemap).
- Folder structure and path aliases.
- Four layouts: `BaseLayout`, `ArticleLayout`, `ReviewLayout`, `ToolLayout`.
- Content-collection schemas (learn, reviews, editor, carriers, products).
- Placeholder routes: `/`, `/calculator`, `/rates`, `/learn`, `/learn/[slug]`,
  `/reviews`, `/reviews/[slug]`, `/about`, `/methodology`, `/404`.
- Skeleton `SiteHeader` and `SiteFooter` with full trust + legal link set so
  the link graph is already in the HTML of every page.

**Intentionally out of scope in Phase 1:** real content, images, calculator
logic, data pipeline, trust-page copy, host-level redirects, cutover.

---

## Phase 2 — Trust & YMYL layer  (deferred)

**Goal:** replace every placeholder trust/legal page with final, reviewed
copy and formalize author/reviewer metadata.

| Moves from current site                  | Moves to                                  |
|-------------------------------------------|-------------------------------------------|
| `/about` body copy                        | `src/pages/about.astro`                   |
| `/methodology` explainer                  | `src/pages/methodology.astro`             |
| `/privacy`, `/terms`, `/disclaimer`       | dedicated pages under `src/pages/`        |
| `/editorial-policy` (new)                 | `src/pages/editorial-policy.astro`        |
| `/contact`                                | `src/pages/contact.astro`                 |
| Author bios + credentials                 | `src/data/authors.json` + byline component|
| Disclaimer copy per context               | `src/components/Disclaimer.astro` variants|

Deliverables: `AuthorByline.astro`, `Disclaimer.astro`, `SourceList.astro`,
`RelatedLinks.astro`, and final MDX-free body copy for all trust pages.

---

## Phase 3 — Interactive islands (calculator & rates UI)  (deferred)

**Goal:** reproduce the two pieces of real interactivity that must remain
React islands.

| Moves from current site                          | Moves to                                      |
|--------------------------------------------------|-----------------------------------------------|
| Grade calculator (IRR solver + 13-level grading) | `src/lib/irr.ts` + `src/components/islands/GradeCalculator.tsx` |
| `/calculator` page body                          | `src/pages/calculator.astro` (with `ToolLayout`) |
| Rates table sort/filter UI                       | `src/components/islands/RatesTable.tsx`       |
| `/rates` server-rendered rows                    | `src/pages/rates.astro` (reads generated JSON)|

Acceptance: `/calculator` and `/rates` render a meaningful H1, intro,
no-JS fallback, and full table rows in the initial HTML. Islands enhance
— they do not gate — the content.

---

## Phase 4 — Data pipeline  (deferred)

**Goal:** replace hand-edited rate/ranking data with a scripted pipeline.

| Moves from current site           | Moves to                                    |
|-----------------------------------|---------------------------------------------|
| Hard-coded rates in components    | `src/data/rates.normalized.generated.json`  |
| Carrier / product metadata        | `src/content/carriers/*.json`, `src/content/products/*.json` |
| Ranking lists for roundups        | `src/data/rankings.generated.json`          |
| Manual "update" workflow          | `npm run data:build` via three scripts below|

Scripts to create under `scripts/`:

1. `fetch-rates.ts` — raw ingest (seed file first, real feeds later).
2. `normalize-data.ts` — validate with zod, drop orphans, round.
3. `build-rankings.ts` — estimate IRR via shared `src/lib/irr.ts`,
   assign grades, emit per-type top-N rankings.

`npm run build` in this phase becomes `data:build && astro build`.

---

## Phase 5 — Content migration (learn + reviews)  (deferred)

**Goal:** move all existing articles and reviews into content collections.
The scaffold already supports this with zero route changes.

| Source URL (current)                         | Target file                               |
|----------------------------------------------|-------------------------------------------|
| `/learn` (index)                             | list page already exists                  |
| `/learn/cap-rates` … `/learn/types-of-annuities` | `src/content/learn/<slug>.mdx`        |
| `/learn/best-fixed-indexed-annuities` etc.   | `src/content/learn/<slug>.mdx` with `rankingKey: 'fia-top'` |
| `/reviews/<carrier>` (20 carriers)           | `src/content/reviews/<slug>.mdx` with `kind: 'carrier'` |
| `/reviews/<product>` (~50 products)          | `src/content/reviews/<slug>.mdx` with `kind: 'product'` |
| `/editor/*` (renewal-cap-rates, etc.)        | `src/content/editor/<slug>.mdx`           |
| `/glossary` + `/glossary/[slug]`             | `src/data/glossary.json` + Phase 5 routes |

Editorial workflow after this phase: new article = new MDX file with valid
frontmatter. No component or route edits.

---

## Phase 6 — Host, redirects & SEO hardening  (deferred)

This is where the April 2026 SEO audit items get closed out.

| Audit finding                                | Fix location                                |
|----------------------------------------------|---------------------------------------------|
| SPA shell returned for every URL             | resolved by Astro static build (Phases 1–5) |
| Soft-404: unknown routes return 200          | `.htaccess` / host rewrite to real 404      |
| `www` and apex both 200                      | `.htaccess` 301: `www` → apex               |
| Wrong URL variant indexed (`/Deferred%20…/`) | GSC Removals tool request                   |
| Sitemap ≠ crawl graph                        | `@astrojs/sitemap` serialize/filter tuning  |
| Organization / WebSite JSON-LD missing       | emit in `SiteFooter.astro`                  |
| Article schema missing                       | emit in `ArticleLayout.astro`               |

Sitemap priorities and changefreq rules to mirror the prior sitemap:

- `/` — 1.0 / weekly
- `/calculator` — 0.9 / weekly
- `/rates` — 0.9 / daily
- `/reviews/*` — 0.8 / monthly
- `/learn/*` — 0.8 / monthly
- `/about`, `/methodology`, `/editorial-policy` — 0.7 / monthly
- `/privacy`, `/terms`, `/disclaimer` — 0.3 / yearly

---

## Phase 7 — Staging + cutover  (deferred)

1. Deploy to staging (subdomain or preview host). Run full `curl -A Googlebot`
   sweep against the prior sitemap — every URL must return ≥ 4 KB of HTML
   with a real `<h1>`.
2. Create redirect map for any URLs that genuinely change (target: zero).
3. Swap DNS or hosting. Keep prior build available for one-click rollback.
4. In Search Console: resubmit `sitemap.xml`, request indexing for the top
   ~15 URLs, file Removal for `/Deferred%20Annuity%20Calculator/`.
5. Weekly verification for 30 days — see the audit's checklist.

---

## URL preservation contract

Every URL currently present in `sitemap.xml` (home, calculator, rates,
how-it-works, about, contact, privacy, methodology, terms, glossary,
`/learn/*`, `/editor/*`, `/reviews/*`) maps 1:1 to an Astro route in the
scaffold. No URL changes are proposed. If any become necessary in a later
phase, they will be explicitly called out with a 301 plan before the change
ships.
