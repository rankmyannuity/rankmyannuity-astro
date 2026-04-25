# scripts/

Data pipeline scripts live here. **Empty in Phase 1 on purpose.**

Phase 4 will add:

- `fetch-rates.ts` — raw ingest from public filings / disclosures.
- `normalize-data.ts` — zod validation, orphan removal, rounding.
- `build-rankings.ts` — IRR estimation + grading + per-type top-N lists.
- `schemas.ts` — shared zod shapes for the raw and normalized rate rows.
- `verify-html.mjs` — post-build smoke test that every listed URL ships
  meaningful HTML (catches regression of the April 2026 shell-only
  finding).

Once those exist, `npm run build` becomes `data:build && astro build`.
