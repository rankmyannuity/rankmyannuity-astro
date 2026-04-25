# rankmyannuity-astro — Phase 2

Astro migration target for **rankmyannuity.pro**. The live site is currently
a React + Vite SPA. Phase 1 established the scaffold and architecture; Phase 2
adds the content system that lets new articles, reviews, and trust pages ship
as MDX files and render as static HTML.

Calculators, rates data, full content migration, and the launch cutover are
still deferred — see `MIGRATION_MAP.md`.

## What Phase 2 adds

- **Three content collections** — `learn`, `reviews`, `pages` — with zod
  validation for title, description, dates, author, and collection-specific
  fields (carrier/product facts, verdict, disclaimer variant).
- **Static dynamic routing** via `getStaticPaths()`:
  - `/learn/[slug]` — articles
  - `/reviews/[slug]` — carrier and product reviews (discriminated on `kind`)
  - `/[slug]` — trust / informational pages at root (`/about`, `/methodology`, …),
    scoped narrowly to the `pages` collection to avoid the soft-404 catch-all
    problem flagged in the April 2026 audit.
- **Trust scaffold components** rendered server-side on every content page:
  `Breadcrumbs`, `AuthorBlock`, `DisclaimerSlot` (5 placeholder variants),
  `RelatedLinks`, `SourceList`.
- **Drafts excluded from production builds** via `import.meta.env.PROD` — an
  entry with `draft: true` renders under `astro dev` but is omitted from
  `npm run build`.
- **Six example MDX files** seeded for build verification.

## How to add a new article

1. Create a file under `src/content/learn/` — the filename is the default URL
   slug (e.g. `withdrawal-benefits.mdx` → `/learn/withdrawal-benefits`).
2. Add frontmatter matching the `learn` schema in `src/content/config.ts`:
   ```yaml
   ---
   title: "Headline — 10 to 90 characters"
   description: "Meta description, 70–170 characters."
   publishedAt: 2026-04-20
   updatedAt: 2026-04-20
   author:
     name: "Charlie Brothersen"
     title: "Series 65"
   tags: ["FIA", "withdrawal"]
   disclaimer: "general"   # general | yield | ranking | product
   draft: false            # true hides from prod build
   sources:
     - label: "NAIC Annuity Disclosure Model Regulation"
       url: "https://content.naic.org/…"
       publisher: "NAIC"
   relatedArticles:
     - cap-rates-explained
   relatedReviews:
     - athene
   ---
   ```
3. Write MDX below the frontmatter. `relatedArticles` / `relatedReviews`
   values are validated at build time — a typo against a non-existent slug
   fails the build.

## How to add a new review

Reviews live under `src/content/reviews/` and use a discriminated union on
`kind`. Pick one shape:

**Carrier review (`kind: "carrier"`):**
```yaml
---
kind: "carrier"
title: "Carrier Review: …"
description: "…"
publishedAt: 2026-04-01
updatedAt: 2026-04-20
author: { name: "Charlie Brothersen", title: "Series 65" }
carrier:
  slug: "carrier-a"
  legalName: "Carrier A Life and Annuity Company"
  displayName: "Carrier A"
  domicile: "IA"
  ratings: { amBest: "A+", sp: "A+", moodys: "A1", asOf: 2026-01-15 }
verdict:
  grade: "A-"
  bestFor: "…"
  watchouts: ["…"]
---
```

**Product review (`kind: "product"`):**
```yaml
---
kind: "product"
title: "Product Review: …"
description: "…"
publishedAt: 2026-04-01
updatedAt: 2026-04-20
author: { name: "Charlie Brothersen", title: "Series 65" }
product:
  slug: "product-a"
  name: "Product A"
  carrierSlug: "carrier-a"      # must match a carrier review slug
  carrierName: "Carrier A"
  productType: "FIA"             # FIA | MYGA | RILA | VA | SPIA | DIA
  surrenderYears: 10
  featuredCapRate: 0.0825        # decimal
  featuredParticipationRate: 0.45
verdict:
  grade: "B+"
  bestFor: "…"
  watchouts: ["…"]
---
```

The facts strip on `/reviews/[slug]` is derived from the inlined carrier/
product object — no separate data collection is required in Phase 2.

## How to add a trust page

1. Create `src/content/pages/<slug>.mdx` — filename becomes the root URL
   (e.g. `privacy.mdx` → `/privacy`).
2. Frontmatter:
   ```yaml
   ---
   title: "Privacy Policy"
   description: "…"
   publishedAt: 2026-04-20
   updatedAt: 2026-04-20
   author: { name: "Charlie Brothersen" }
   noindex: false           # set true for work-in-progress trust pages
   ---
   ```

## Commands

```bash
npm install
npm run dev        # dev server (drafts visible)
npm run build      # static build → ./dist (drafts excluded)
npm run preview    # serve ./dist
npm run check      # astro check + tsc --noEmit
```

## Folder map

```
.
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json              Path aliases: @components, @layouts, @lib, @data
├── public/                    Static assets (favicon, OG images)
├── scripts/                   Data pipeline (Phase 4) — empty in Phase 2
└── src/
    ├── components/            Trust + chrome components (Astro only — no React)
    │   ├── SiteHeader.astro
    │   ├── SiteFooter.astro
    │   ├── Breadcrumbs.astro
    │   ├── AuthorBlock.astro
    │   ├── DisclaimerSlot.astro
    │   ├── RelatedLinks.astro
    │   └── SourceList.astro
    ├── content/
    │   ├── config.ts          Zod schemas for all three collections
    │   ├── learn/             MDX articles (2 example files)
    │   ├── reviews/           MDX reviews (2 example files)
    │   └── pages/             MDX trust pages (2 example files)
    ├── layouts/
    │   ├── BaseLayout.astro   <head>, canonical, header, footer
    │   ├── ArticleLayout.astro
    │   ├── ReviewLayout.astro
    │   ├── PageLayout.astro   Simpler layout for the pages collection
    │   └── ToolLayout.astro   Reserved for /calculator, /rates (Phase 3)
    ├── pages/
    │   ├── index.astro
    │   ├── 404.astro
    │   ├── calculator.astro   Phase-3 placeholder
    │   ├── rates.astro        Phase-3 placeholder
    │   ├── [slug].astro       ←— pages collection (scoped, static)
    │   ├── learn/{index,[...slug]}.astro
    │   └── reviews/{index,[...slug]}.astro
    └── styles/global.css
```

## Architectural rules (still enforced)

1. **Astro owns rendering.** No React files exist in Phase 2.
2. **Every page extends `BaseLayout`.** One place controls `<head>`, canonical,
   header, and footer.
3. **Content lives in collections, not components.** New article or review =
   new MDX file. No route code changes needed.
4. **`/[slug]` is narrowly scoped to the pages collection.** `getStaticPaths`
   only emits known page slugs; unknown paths hit the real 404, not a soft-200.
5. **URLs are canonical.** `trailingSlash: 'never'`, `build.format: 'directory'`,
   apex as canonical host.

## What is still deferred

- Phase 3 — calculator + rates-table islands (React, inside `ToolLayout`).
- Phase 4 — rates / rankings data pipeline (`scripts/`).
- Phase 5 — bulk content migration (remaining articles + ~60 reviews).
- Phase 6 — host-level redirects (`www` → apex), final sitemap tuning, JSON-LD.
- Phase 7 — staging + cutover.

Final disclosure copy on `DisclaimerSlot`, `/about`, and `/methodology` lands
with the trust-page phase; Phase 2 ships placeholders marked as examples so
the trust scaffold is already present in crawled HTML.
