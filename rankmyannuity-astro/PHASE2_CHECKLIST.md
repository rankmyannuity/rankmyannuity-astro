# Phase 2 — Content collections & dynamic routing — Complete checklist

Status: **Complete, awaiting approval**
Build: `npm run build` succeeds; 12 pages generated; body content verified
in `dist/learn/cap-rates-explained/index.html`, `dist/reviews/athene/index.html`,
and `dist/about/index.html`.

## Scope guardrails (honored)

- [x] Did **not** migrate the calculator. `/calculator` is still a Phase-1 placeholder.
- [x] Did **not** build the rates / rankings data pipeline. `scripts/` is empty.
- [x] Did **not** do full site styling or launch work.
- [x] Did **not** rewrite the whole site.
- [x] No React files introduced (verified — `grep -r "\.tsx\|\.jsx" src/` returns nothing).
- [x] Astro still owns rendering end-to-end.

## Required deliverables

### 1. Content collections

- [x] `learn` collection — `src/content/learn/`
- [x] `reviews` collection — `src/content/reviews/` (discriminated union on `kind`)
- [x] `pages` collection — `src/content/pages/`
- [x] All schemas validated via zod in `src/content/config.ts`.
- [x] Required fields on every collection: `title`, `description`, `slug` (optional override),
      `publishedAt`, `updatedAt`, `author`, `tags`, `draft`.
- [x] Review-specific fields: `kind` discriminator, inlined `carrier` / `product`
      fact objects, `verdict` (grade / bestFor / watchouts), optional `reviewer`.
- [x] Cross-references validated at build time via `reference('learn')` /
      `reference('reviews')`.

### 2. Proper content config + folder structure

- [x] `src/content/config.ts` exports exactly three collections.
- [x] Old Phase-1 stub directories (`editor`, `carriers`, `products`) removed.
- [x] `src/content/README.md` updated to match Phase 2 shape.

### 3. Dynamic routes

- [x] `/learn/[...slug]` → `src/pages/learn/[...slug].astro`
- [x] `/reviews/[...slug]` → `src/pages/reviews/[...slug].astro`
- [x] `/[slug]` at root → `src/pages/[slug].astro` (pages collection)
- [x] Placeholder `src/pages/about.astro` and `src/pages/methodology.astro`
      deleted to resolve route conflicts with the pages collection.

### 4. Static generation via `getStaticPaths()`

- [x] All three dynamic routes export `getStaticPaths()`.
- [x] Output remains `static` in `astro.config.mjs` — no request-time rendering.
- [x] Drafts excluded from production builds via `import.meta.env.PROD`
      (visible under `astro dev`, omitted from `npm run build`).
- [x] Root `[slug].astro` scoped to known pages-collection slugs only — not a
      catch-all, so unknown paths still hit `404.astro` (fixes the soft-404
      issue from the April 2026 audit).

### 5. Article + review layouts

Every content page renders server-side HTML with:

- [x] SEO title + meta description (`BaseLayout`)
- [x] Canonical URL derived from slug, with optional `canonicalOverride`
- [x] H1 matching the frontmatter title
- [x] Published + updated dates in `<time datetime="…">` via `AuthorBlock`
- [x] Author block (author + optional editorial reviewer)
- [x] Related-links placeholder rendered from resolved references
- [x] Disclaimer placeholder via `DisclaimerSlot` (5 variants: general, yield,
      ranking, product, carrier)
- [x] Breadcrumbs
- [x] Review-only: key-facts strip + editorial verdict block

### 6. Example content (realistic, marked as example)

- [x] `src/content/learn/cap-rates-explained.mdx`
- [x] `src/content/learn/fia-vs-myga.mdx`
- [x] `src/content/reviews/athene.mdx` (kind: carrier)
- [x] `src/content/reviews/athene-performance-elite.mdx` (kind: product)
- [x] `src/content/pages/about.mdx`
- [x] `src/content/pages/methodology.mdx`

Every file carries a blockquote marking it as Phase-2 example content, and
all ratings/caps/grades are explicitly labeled illustrative.

### 7. Rendered body visible in static HTML source

Verified in `dist/`:

- [x] `dist/learn/cap-rates-explained/index.html` — body prose present
- [x] `dist/learn/fia-vs-myga/index.html` — generated
- [x] `dist/reviews/athene/index.html` — body + verdict + facts strip present
- [x] `dist/reviews/athene-performance-elite/index.html` — generated
- [x] `dist/about/index.html` — body present, canonical is `/about`
- [x] `dist/methodology/index.html` — generated
- [x] Canonicals verified correct on all content pages.

## Build summary

```
12 pages built:
  /, /404, /calculator, /rates,
  /learn, /learn/cap-rates-explained, /learn/fia-vs-myga,
  /reviews, /reviews/athene, /reviews/athene-performance-elite,
  /about, /methodology
```

## Outputs required by the phase brief

- [x] Final folder tree (in `README.md`)
- [x] Content config (`src/content/config.ts`)
- [x] Route files (`src/pages/{learn,reviews}/[...slug].astro`, `src/pages/[slug].astro`)
- [x] Layout files (`BaseLayout`, `ArticleLayout`, `ReviewLayout`, `PageLayout`)
- [x] Example content files (6 MDX entries)
- [x] "How to add new content" explanation (in `README.md`)
- [x] Phase 2 complete checklist (this file)

## Stop here

Next phases are explicitly deferred until approval:

- Phase 3 — calculator + rates-table islands
- Phase 4 — rates / rankings data pipeline
- Phase 5 — bulk content migration
- Phase 6 — host redirects, sitemap tuning, JSON-LD
- Phase 7 — staging + cutover
