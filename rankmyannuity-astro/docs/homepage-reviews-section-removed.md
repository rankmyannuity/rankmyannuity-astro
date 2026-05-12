# Homepage Product Reviews section — removed

When `/reviews` was pulled off production (2026-05-12), the entire **Product Reviews** section was removed from `src/pages/index.astro`. The section sat between the Rates section and the Learn section and contained:

- A heading "Product Reviews" with a subtitle and an "All reviews" link to `/reviews`
- A 3-column grid of 6 tiles — three Learn guides (`/learn/best-fixed-indexed-annuities`, `/learn/best-variable-annuities`, `/learn/fia-vs-rila`) and three carrier review tiles (`/reviews/athene`, `/reviews/jackson`, `/reviews/massmutual`)

## Restore instructions

Paste the contents of `docs/homepage-reviews-section-removed.snippet.astro` back into `src/pages/index.astro` immediately after the Rates section's closing `</section>` and before the `<!-- LEARN -->` comment block.

The exact insertion point is marked in the file with the comment:

```html
<!-- Reviews section removed 2026-05-12 — see docs/homepage-reviews-section-removed.md to restore -->
```

Delete that placeholder comment when you paste the block back in.
