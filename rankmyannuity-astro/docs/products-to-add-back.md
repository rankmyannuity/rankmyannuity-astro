# Action Items After AdSense Readiness Pass (PR #7)

This document tracks content that was hidden or de-linked in PR #7 to clear
immediate AdSense rejection risks. Restore each item only when the
underlying content is editorially complete.

## Drafted (hidden) review pages

All 22 reviews with `status: pilot` were marked `draft: true` so they
stop rendering in production. The content collection filters them out
in PROD via `e.data.draft !== true` in `src/pages/reviews/[...slug].astro`.
The MDX files remain in the repo as scaffolding.

**Carrier reviews drafted (10):** allianz-life, athene, corebridge-financial,
equitable-financial, jackson-national, lincoln-financial, massmutual,
nationwide, pacific-life, prudential.

**Product reviews drafted (12):** allianz-benefit-control,
athene-performance-elite, corebridge-american-pathway,
equitable-structured-capital-strategies, jackson-market-link-pro,
lincoln-optiblend, massmutual-stable-voyage, nationwide-peak-10,
new-york-life-secure-term-myga, pacific-life-pacific-harbor,
pacific-life-pacific-index-foundation, prudential-flexguard.

**Shipping (still visible, 1):** new-york-life — the only review with
`status: shipping`. Its frontmatter was also cleaned in PR #7 (removed
`pilot`/`phase-5` tags, replaced `author.title: "Pilot scaffold"` with
`author.url: "/about"`).

### Side effect on /reviews listing

`src/pages/reviews.astro` previously linked carrier names and product
rows to the now-drafted reviews via `slug:` fields. Those slug references
were stripped so the listing no longer renders 404 links. As a result,
17 carrier-name links and 7 product-row links became plain text. The
grade roster, surrender terms, and carrier notes are unchanged.

The "Coming soon" chip was also removed from the row template
(`renderCarrierCard` in `src/pages/reviews.astro`). Unlinked rows now
render identically to linked rows in trailing-column treatment; the link
cue is only the row hover state. This avoids broadcasting "85% of
products have no review" to AdSense quality raters and human readers.

## How to promote a review back from draft

1. Replace the pilot scaffold body with finished editorial content. For
   YMYL financial content, aim for ≥600 words of substantive analysis.
2. Remove the `> **Editorial draft pending.** ...` blockquote at the top.
3. Remove the "Scope of this pilot review" and "Category Pitfalls
   (Pattern Template)" meta-language sections.
4. Update frontmatter:
   - `status: "shipping"` (remove `draft: true`)
   - `author.name: "Editorial Team"` (or a named author)
   - Add `author.url: "/about"` so the byline links to the bio
   - Remove `author.title: "Pilot scaffold"`
   - Drop `pilot` and `phase-5` from the `tags` array; keep
     carrier/product/category tags
5. Re-add the slug reference in `src/pages/reviews.astro`:
   - For a carrier review: add `slug: "<carrier-slug>",` to the carrier
     block so its name links to the review.
   - For a product review: add `, slug: "<product-slug>"` to the product
     row so the row becomes a clickable link.
6. Update the `shipping_criteria` block in the MDX frontmatter with the
   editorial approval timestamp.

## Backlog: products without review pages

The `/reviews` listing still shows the full grade roster across 20
carriers and 53 products. Of those, only 1 (New York Life Secure Term
MYGA via the carrier review) currently links to a review page. The
remaining 52 product rows are unlinked. As editorial content is added,
re-add `slug:` fields per step 5 above.

Carriers that have **no review MDX at all** (in addition to the drafted
ones above): North American (Sammons), American Equity, F&G (Fidelity &
Guaranty), Global Atlantic, Security Benefit, Delaware Life, MassMutual
(`massmutual` is drafted), Transamerica, TIAA, Brighthouse Financial.
