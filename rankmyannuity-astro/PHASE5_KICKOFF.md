# Phase 5 Kickoff

RankMyAnnuity.pro · 2026-04-22

Ratifies the three kickoff items from `PHASE5_SPEC.md`. No other items.

## 1. CI gates — ratified

The following four CI gates are ratified and must fail PR/CI when triggered:

- PR changes any MDX `status` to `"shipping"` without a matching, fresh entry in `carriers.shipping.yml` — **YES**.
- PR adds `PIPELINE_FROZEN_TIME` as a default in any npm script or CI workflow — **YES**.
- PR touches any MDX file whose shipping approval `mdx_sha256` no longer matches the current file bytes — **YES**.
- PR sets `top_myga_public: true` while the MYGA corpus is empty under the strict 5-year-band definition in `PHASE5_SPEC.md` — **YES**.
- Unified liveness enforcement remains covered by the existing Vitest suite; no separate new CI gate is added for that item.[1]

## 2. Rollout after Athene

The first wave after Athene is the **top 10 carriers after Athene** using 2025 year-end U.S. individual annuity market rankings as the primary ordering signal, while favoring carriers with broad, public product/rate visibility where implementation data is realistically obtainable from the existing market footprint.[1][2]

### Next carrier

- **Next carrier:** New York Life.[1]

### First-wave size

- **First-wave size:** 10 carriers after Athene.[1]

### First-wave carrier list

Using LIMRA 2025 year-end total annuity sales rankings, Athene is #1 at $34.19 billion, so the next ten carriers by market position are ranks 2 through 11 below.[1]

| Rank after Athene | Carrier | 2025 total annuity sales |
|---|---|---|
| 1 | New York Life | $30.61 billion [1] |
| 2 | Corebridge Financial | $27.43 billion [1] |
| 3 | Equitable Financial | $23.16 billion [1] |
| 4 | Jackson National Life | $22.72 billion [1] |
| 5 | Allianz Life of North America | $22.48 billion [1] |
| 6 | Nationwide | $21.92 billion [1] |
| 7 | Massachusetts Mutual Life | $19.68 billion [1] |
| 8 | Lincoln Financial Group | $17.18 billion [1] |
| 9 | Pacific Life | $16.28 billion [1] |
| 10 | Prudential | $15.32 billion [1] |

### Rationale

This wave captures the largest carriers immediately behind Athene in LIMRA's 2025 year-end total annuity sales table, which is the cleanest objective market-share ordering available in the current source set.[1] Several of these carriers also appear prominently across the fixed annuity breakout rankings, which supports the practical assumption that product/rate data will be more obtainable than for smaller carriers with thinner public footprints.[2]

## 3. First-wave exceptions

- None.

## 4. First-wave scope per carrier

Added 2026-04-22 after kickoff commit. Resolves the implicit scope
question left open by §2: what state each wave-1 carrier must reach
before Phase 5 is considered done.

For this first Phase 5 wave, each carrier's initial target state is
**pilot**, not shipping:

- Carrier MDX + at least one in-scope product MDX validate strict
  against the schemas defined in `PHASE5_SPEC.md`.
- Sidecars emit `status: "pilot"` per `PHASE5_SPEC.md` §4.
- No `shipping_criteria` booleans are required to be all true.
- No `carriers.shipping.yml` approvals are required for the wave-1
  carriers as part of this phase.
- Pilot carriers carry the unified not-live treatment from
  `PHASE5_SPEC.md` §5: `noindex` meta tag plus the
  "Pilot — not publicly shipping" chip on every review surface.

Shipping promotion for any carrier remains a separate, explicit
approval event, using the criteria and gates defined in
`PHASE5_SPEC.md` §4. Nothing in this wave pre-authorizes a shipping
promotion; every promotion is a standalone sign-off.

## References

Added 2026-04-22 after kickoff commit. Resolves the `[1]` / `[2]`
footnote markers above.

| Marker | Source | URL | Verified |
|---|---|---|---|
| `[1]` | LIMRA, *Fourth Quarter 2025 Top 20 Annuity Sales Rankings* (year-end 2025, U.S. Individual Annuities Sales Survey). Athene #1 at $34,193,873K; New York Life #2 at $30,610,582K; top 11 as tabulated in §2 above. | https://www.limra.com/siteassets/newsroom/fact-tank/sales-data/2025/4q/4q-2025-top-20-annuity-sales-rankings.pdf | 2026-04-22 |
| `[2]` | LIMRA, *Fourth Quarter 2025 Top Fixed Annuity Sales Rankings* (year-end 2025, U.S. Individual Annuities Sales Survey). Breakout by Fixed-Rate Deferred, Indexed, and Payout Annuities. Distinct from `[1]`'s total-annuity ranking. | https://www.limra.com/siteassets/newsroom/fact-tank/sales-data/2025/4q/4q-2025-top-fixed-annuity-sales-rankings.pdf | 2026-04-22 |

Both URLs were fetched and their contents cross-checked against every
numeric and categorical claim this kickoff document makes about them.
If either URL changes upstream or is superseded by a later LIMRA
release, that is an amendment event, not a silent update — log the
change via a mini-proposal.

***

Phase 5 implementation is cleared to begin upon commit of this file in the repo root and notification to Computer that it has landed.
