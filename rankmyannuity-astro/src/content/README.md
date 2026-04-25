# Content collections

Schemas live in `config.ts`. Three collections ship in Phase 2.

| Collection | Type      | Purpose                                                | URL pattern          |
|------------|-----------|--------------------------------------------------------|----------------------|
| `learn`    | `content` | MDX articles and roundups                              | `/learn/[slug]`      |
| `reviews`  | `content` | Carrier and product reviews (discriminated on `kind`)  | `/reviews/[slug]`    |
| `pages`    | `content` | Trust / informational pages (about, methodology, etc.) | `/[slug]` (root)     |

## Authoring rules

- Every entry has a validated schema. Build fails on missing required fields
  (title, description, publishedAt, updatedAt, author).
- `draft: true` hides an entry from production builds (`npm run build`) but
  still renders it under `astro dev` for preview.
- Cross-links go in `relatedArticles` / `relatedReviews` — Astro `reference()`
  validates that the target entry exists at build time.
- Reviews use a discriminated union on `kind`:
  - `kind: "carrier"` — include a `carrier` object (legalName, domicile, ratings, …).
  - `kind: "product"` — include a `product` object (productType, surrenderYears,
    featuredCapRate, …). `carrierSlug` points at a carrier review.
- All references to live rates, caps, and grades in Phase 2 content are
  illustrative examples, not live quotes.

## Where the URL comes from

1. Default: the MDX filename (e.g. `cap-rates-explained.mdx` → `cap-rates-explained`).
2. Override: set `slug:` in frontmatter — this supersedes the filename for both
   routing and canonical URL.

## Phase 2 scope reminder

No rates/rankings data collections yet — those land in Phase 4 with the
data pipeline. The `rankingKey` field on `learn` entries is reserved but not
consumed by any route in Phase 2.
