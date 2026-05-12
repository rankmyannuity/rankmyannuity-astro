# Disabled routes

This directory mirrors `src/pages/` for routes that have been **pulled off production** but kept intact for easy restoration. Astro only picks up `.astro` files inside `src/pages/`, so anything here is invisible at build time and produces no public URL.

## Currently disabled

### `/reviews` and `/reviews/[slug]`

Disabled on 2026-05-12 because the pilot review corpus isn't yet to a publishable editorial standard. The MDX content (`src/content/reviews/*.mdx`), the content schema (`src/content/config.ts`), the review layout (`src/layouts/ReviewLayout.astro`), the pipeline (`data-pipeline/`), the sidecars (`src/generated/reviews/*.json`), and the shipping approval list (`data-pipeline/sources/carriers.shipping.yml`) are all **untouched** — only the route files moved.

### How to restore

One-line move puts the routes back:

```bash
git mv src/_disabled/pages/reviews.astro src/pages/reviews.astro
mkdir -p src/pages/reviews
git mv 'src/_disabled/pages/reviews/[...slug].astro' 'src/pages/reviews/[...slug].astro'
```

Then re-enable the nav links (search for the commented-out `/reviews` lines):

- `src/components/Header.astro` — uncomment the `{ href: "/reviews", label: "Reviews" }` line in `navItems`
- `src/components/Footer.astro` — uncomment the same in the `Content` column
- `src/pages/404.astro` — re-add `<li><a href="/reviews">Reviews</a></li>` and switch the meta description back to mention reviews
- `src/pages/index.astro` — re-add the "Product Reviews" section that was removed (see `docs/homepage-reviews-section-removed.md` for the exact block)
- `src/components/Footer.astro` brand blurb — change "Independent annuity grading and rate data built for…" back to "Independent annuity grading, rate data, and product reviews built for…"

The sitemap is auto-generated from the route files, so moving the templates back automatically re-adds `/reviews` and `/reviews/[slug]` URLs to `sitemap-index.xml`.

### Related: /methodology product-grade sections

Four sections of `src/pages/methodology.astro` were also removed when reviews came off production (they covered the family-grade rubric, six scoring factors, carrier strength vs product grade, and raw scores). The exact removed block is preserved in `docs/methodology-product-grading-removed.md` for paste-back restoration.

The calculator's IRR-based grade (`What the grade measures` / `What the grade means` sections) was left fully intact and remains live.
