#!/usr/bin/env tsx
// [Phase 5.0b · Tasks 4+5] Wave-1 carrier/product scaffold generator.
//
// Generates the 10 carrier MDX + 10 product MDX scaffolds ratified in
// PHASE5_KICKOFF.md §2. All files are pilot status, carry the
// "editorial draft pending" block in body, cite LIMRA [1] and [2]
// verbatim, and invent zero numbers (no featuredCapRate /
// participationRate / rates). Carrier MDX references its one product
// via relatedReviews; product MDX references its carrier. No cross-
// carrier references. No carriers.shipping.yml entries are written
// (pilot scope per the kickoff).
//
// This script is idempotent — re-running overwrites previous output.
// It exists primarily to make the scaffold batch auditable in a single
// diff (logic in one file) rather than reviewing 20 separate MDX files
// for formatting drift. Run with: tsx scripts/scaffold-wave1.ts
//
// Design notes:
//   - Product-type per carrier follows each carrier's most prominent
//     category in LIMRA's 2025 fixed-annuity breakout, as an OBJECTIVE
//     slotting decision (not a subjective product recommendation).
//     Details do not appear in body text — only in frontmatter product
//     fields that the schema requires.
//   - Bodies contain NO subjective rankings, grades, or comparisons.
//   - No verdict.grade is set. verdict.watchouts is empty. bestFor
//     is the generic placeholder in the editorial-draft-pending block.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

// LIMRA pinned URLs (verified 2026-04-22, see PHASE5_KICKOFF.md).
const LIMRA_TOTAL_URL =
  "https://www.limra.com/siteassets/newsroom/fact-tank/sales-data/2025/4q/4q-2025-top-20-annuity-sales-rankings.pdf";
const LIMRA_FIXED_URL =
  "https://www.limra.com/siteassets/newsroom/fact-tank/sales-data/2025/4q/4q-2025-top-fixed-annuity-sales-rankings.pdf";

interface Wave1Entry {
  // carrier
  carrierSlug: string;
  legalName: string;
  displayName: string;
  domicile: string; // 2-letter state
  website: string;
  rank: number; // LIMRA 2025 rank after Athene (2..11)
  totalSalesLabel: string; // verbatim from PHASE5_KICKOFF.md
  // product
  productSlug: string;
  productName: string;
  productType: "FIA" | "MYGA" | "RILA" | "VA" | "SPIA" | "DIA";
}

// Ordering matches PHASE5_KICKOFF.md §2 verbatim.
const WAVE1: Wave1Entry[] = [
  {
    carrierSlug: "new-york-life",
    legalName: "New York Life Insurance and Annuity Corporation",
    displayName: "New York Life",
    domicile: "DE",
    website: "https://www.newyorklife.com",
    rank: 2,
    totalSalesLabel: "$30.61 billion",
    productSlug: "new-york-life-secure-term-myga",
    productName: "New York Life Secure Term MYGA",
    productType: "MYGA",
  },
  {
    carrierSlug: "corebridge-financial",
    legalName: "Corebridge Financial, Inc.",
    displayName: "Corebridge Financial",
    domicile: "TX",
    website: "https://www.corebridgefinancial.com",
    rank: 3,
    totalSalesLabel: "$27.43 billion",
    productSlug: "corebridge-american-pathway",
    productName: "Corebridge American Pathway",
    productType: "FIA",
  },
  {
    carrierSlug: "equitable-financial",
    legalName: "Equitable Financial Life Insurance Company",
    displayName: "Equitable Financial",
    domicile: "NY",
    website: "https://equitable.com",
    rank: 4,
    totalSalesLabel: "$23.16 billion",
    productSlug: "equitable-structured-capital-strategies",
    productName: "Equitable Structured Capital Strategies",
    productType: "RILA",
  },
  {
    carrierSlug: "jackson-national",
    legalName: "Jackson National Life Insurance Company",
    displayName: "Jackson National",
    domicile: "MI",
    website: "https://www.jackson.com",
    rank: 5,
    totalSalesLabel: "$22.72 billion",
    productSlug: "jackson-market-link-pro",
    productName: "Jackson Market Link Pro",
    productType: "RILA",
  },
  {
    carrierSlug: "allianz-life",
    legalName: "Allianz Life Insurance Company of North America",
    displayName: "Allianz Life",
    domicile: "MN",
    website: "https://www.allianzlife.com",
    rank: 6,
    totalSalesLabel: "$22.48 billion",
    productSlug: "allianz-benefit-control",
    productName: "Allianz Benefit Control",
    productType: "FIA",
  },
  {
    carrierSlug: "nationwide",
    legalName: "Nationwide Life Insurance Company",
    displayName: "Nationwide",
    domicile: "OH",
    website: "https://www.nationwide.com",
    rank: 7,
    totalSalesLabel: "$21.92 billion",
    productSlug: "nationwide-peak-10",
    productName: "Nationwide Peak 10",
    productType: "FIA",
  },
  {
    // [Wave-1b rename, 2026-04-22] carrier slug mass-mutual → massmutual
    // (display name "Mass Mutual" → "MassMutual", one word) to match
    // the carrier's own branding. Product slug also renamed from
    // mass-mutual-stable-voyage → massmutual-stable-voyage to preserve
    // the wave-1 <carrier-slug>-<product-name> convention used by the
    // other nine carriers.
    carrierSlug: "massmutual",
    legalName: "Massachusetts Mutual Life Insurance Company",
    displayName: "MassMutual",
    domicile: "MA",
    website: "https://www.massmutual.com",
    rank: 8,
    totalSalesLabel: "$19.68 billion",
    productSlug: "massmutual-stable-voyage",
    productName: "MassMutual Stable Voyage",
    productType: "MYGA",
  },
  {
    carrierSlug: "lincoln-financial",
    legalName: "Lincoln National Life Insurance Company",
    displayName: "Lincoln Financial",
    domicile: "IN",
    website: "https://www.lincolnfinancial.com",
    rank: 9,
    totalSalesLabel: "$17.18 billion",
    productSlug: "lincoln-optiblend",
    productName: "Lincoln OptiBlend",
    productType: "FIA",
  },
  {
    carrierSlug: "pacific-life",
    legalName: "Pacific Life Insurance Company",
    displayName: "Pacific Life",
    domicile: "NE",
    website: "https://www.pacificlife.com",
    rank: 10,
    totalSalesLabel: "$16.28 billion",
    productSlug: "pacific-life-pacific-index-foundation",
    productName: "Pacific Life Pacific Index Foundation",
    productType: "FIA",
  },
  {
    carrierSlug: "prudential",
    legalName: "The Prudential Insurance Company of America",
    displayName: "Prudential",
    domicile: "NJ",
    website: "https://www.prudential.com",
    rank: 11,
    totalSalesLabel: "$15.32 billion",
    productSlug: "prudential-flexguard",
    productName: "Prudential FlexGuard",
    productType: "RILA",
  },
];

const TODAY = "2026-04-22";

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------

// Editorial-draft-pending notice block — appears verbatim in both
// carrier and product bodies. Labeled clearly as a pilot scaffold; no
// subjective rankings or recommendations.
function editorialPendingBlock(): string {
  return [
    "> **Editorial draft pending.** This review is a pilot scaffold, not",
    "> finished editorial. It exists to validate Phase 5 schemas, pipeline",
    "> wiring, and the not-live surface treatment (noindex + pilot chip).",
    "> It does not contain subjective rankings, recommendations, or",
    "> carrier-specific rate data. Numeric product features (caps,",
    "> participation rates, renewal histories) are intentionally omitted",
    "> until an editor has reviewed primary sources and signed off.",
  ].join("\n");
}

function carrierBody(e: Wave1Entry): string {
  return [
    editorialPendingBlock(),
    "",
    "## About this carrier",
    "",
    `${e.displayName} is a U.S. individual-annuity issuer included in the`,
    "first Phase 5 rollout wave after Athene. Wave-1 carriers were",
    "selected using LIMRA 2025 year-end total individual-annuity sales",
    `rankings as the objective ordering signal; ${e.displayName}'s`,
    `rank and reported sales in that table are cited below. [1]`,
    "",
    "## Scope of this pilot review",
    "",
    "- **Status:** pilot (not shipping)",
    "- **Surfaces:** carrier review renders with `noindex` and the",
    '  "Pilot — not publicly shipping" chip per PHASE5_SPEC.md §5.',
    "- **Rates:** no MYGA rate is linked from this review in the Phase",
    "  5.0b corpus. If a rate later lands in `rates.myga.yml`, the",
    "  benchmark state changes mechanically — no body edit is implied.",
    "- **Shipping promotion:** requires a separate, explicit editorial",
    "  approval event and an entry in `carriers.shipping.yml` with a",
    "  matching MDX sha256 (PHASE5_SPEC.md §4).",
    "",
    "## Product bench captured in this wave",
    "",
    `- ${e.productName} (${e.productType}) — see the linked product review.`,
    "",
    "Additional products in the carrier's catalog are out of scope for",
    "wave-1 and will be added in later editorial passes.",
    "",
    "## Ratings",
    "",
    "A.M. Best / S&P / Moody's ratings are intentionally omitted from",
    "frontmatter until an editor confirms the current opinion from the",
    "rating agency's primary source. Do not assume parity with other",
    "carriers in this wave.",
    "",
    "## Sources",
    "",
    `1. LIMRA, *Fourth Quarter 2025 Top 20 Annuity Sales Rankings* —`,
    `   ${e.displayName} ranked #${e.rank} after Athene at`,
    `   ${e.totalSalesLabel} in total individual-annuity sales. [1]`,
    "2. LIMRA, *Fourth Quarter 2025 Top Fixed Annuity Sales Rankings* —",
    "   referenced for fixed-annuity category context. [2]",
    "",
    `[1]: ${LIMRA_TOTAL_URL}`,
    `[2]: ${LIMRA_FIXED_URL}`,
    "",
  ].join("\n");
}

function productBody(e: Wave1Entry): string {
  return [
    editorialPendingBlock(),
    "",
    "## What this review covers",
    "",
    `${e.productName} is a ${e.productType} product attributed to`,
    `${e.displayName} in this wave-1 pilot. Product structure, crediting`,
    "mechanics, surrender schedule, fee schedule, and rate history are",
    "intentionally undocumented in this scaffold — an editor will fill",
    "them in from the carrier's disclosure documents and rate sheets",
    "before this review is considered complete.",
    "",
    "## Scope of this pilot review",
    "",
    "- **Status:** pilot (inherits from carrier; see the carrier review)",
    "- **Featured rates:** none. `featuredCapRate`, `featuredParticipationRate`,",
    "  and `featuredSpread` are deliberately omitted from frontmatter",
    "  rather than stubbed with placeholder values (no silent backfills —",
    "  Phase 4 brief).",
    "- **Surrender / fees:** not documented in the pilot scaffold.",
    "",
    "## Linked carrier review",
    "",
    `- [${e.displayName}](/reviews/${e.carrierSlug}/) — carrier-level review`,
    "  with LIMRA 2025 rank context and pilot-scope notes.",
    "",
    "## Sources",
    "",
    "1. LIMRA, *Fourth Quarter 2025 Top 20 Annuity Sales Rankings* —",
    `   used to place the carrier in the wave-1 rollout order. [1]`,
    "2. LIMRA, *Fourth Quarter 2025 Top Fixed Annuity Sales Rankings* —",
    "   fixed-annuity category context. [2]",
    "",
    `[1]: ${LIMRA_TOTAL_URL}`,
    `[2]: ${LIMRA_FIXED_URL}`,
    "",
  ].join("\n");
}

function carrierFrontmatter(e: Wave1Entry): string {
  return [
    "---",
    'kind: "carrier"',
    `title: "${e.displayName} Annuity Review (Pilot Scaffold)"`,
    `description: "Pilot scaffold for ${e.displayName}, a wave-1 carrier in the Phase 5 rollout. Editorial draft pending; no subjective rankings."`,
    `publishedAt: ${TODAY}`,
    `updatedAt: ${TODAY}`,
    "author:",
    '  name: "RankMyAnnuity Editorial"',
    '  title: "Pilot scaffold"',
    'tags: ["carrier review", "pilot", "phase-5"]',
    "carrier:",
    `  slug: "${e.carrierSlug}"`,
    `  legalName: "${e.legalName}"`,
    `  displayName: "${e.displayName}"`,
    `  domicile: "${e.domicile}"`,
    `  website: "${e.website}"`,
    "sources:",
    '  - label: "LIMRA — 4Q 2025 Top 20 Annuity Sales Rankings"',
    `    url: "${LIMRA_TOTAL_URL}"`,
    '    publisher: "LIMRA"',
    `    accessed: "${TODAY}"`,
    '  - label: "LIMRA — 4Q 2025 Top Fixed Annuity Sales Rankings"',
    `    url: "${LIMRA_FIXED_URL}"`,
    '    publisher: "LIMRA"',
    `    accessed: "${TODAY}"`,
    "relatedReviews:",
    `  - ${e.productSlug}`,
    "relatedArticles: []",
    "# [Phase 5] Lifecycle status — pilot. Wave-1 scope per PHASE5_KICKOFF.md §4.",
    '# Shipping promotion requires a separate, explicit approval event.',
    'status: "pilot"',
    "---",
    "",
  ].join("\n");
}

function productFrontmatter(e: Wave1Entry): string {
  return [
    "---",
    'kind: "product"',
    `title: "${e.productName} Review (Pilot Scaffold)"`,
    `description: "Pilot scaffold for ${e.productName}, a ${e.productType} attributed to ${e.displayName}. Editorial draft pending; no rate data captured."`,
    `publishedAt: ${TODAY}`,
    `updatedAt: ${TODAY}`,
    "author:",
    '  name: "RankMyAnnuity Editorial"',
    '  title: "Pilot scaffold"',
    `tags: ["product review", "pilot", "phase-5", "${e.productType}"]`,
    "product:",
    `  slug: "${e.productSlug}"`,
    `  name: "${e.productName}"`,
    `  carrierSlug: "${e.carrierSlug}"`,
    `  carrierName: "${e.displayName}"`,
    `  productType: "${e.productType}"`,
    "sources:",
    '  - label: "LIMRA — 4Q 2025 Top 20 Annuity Sales Rankings"',
    `    url: "${LIMRA_TOTAL_URL}"`,
    '    publisher: "LIMRA"',
    `    accessed: "${TODAY}"`,
    '  - label: "LIMRA — 4Q 2025 Top Fixed Annuity Sales Rankings"',
    `    url: "${LIMRA_FIXED_URL}"`,
    '    publisher: "LIMRA"',
    `    accessed: "${TODAY}"`,
    "relatedReviews:",
    `  - ${e.carrierSlug}`,
    "relatedArticles: []",
    "# [Phase 5] Product-level lifecycle status. Pilot for wave-1.",
    'status: "pilot"',
    "---",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const projectRoot = process.cwd();
  const reviewsDir = resolve(projectRoot, "src/content/reviews");
  mkdirSync(reviewsDir, { recursive: true });

  let written = 0;
  for (const e of WAVE1) {
    const carrierPath = join(reviewsDir, `${e.carrierSlug}.mdx`);
    writeFileSync(carrierPath, carrierFrontmatter(e) + carrierBody(e));
    written++;
    console.log(`  wrote  src/content/reviews/${e.carrierSlug}.mdx`);

    const productPath = join(reviewsDir, `${e.productSlug}.mdx`);
    writeFileSync(productPath, productFrontmatter(e) + productBody(e));
    written++;
    console.log(`  wrote  src/content/reviews/${e.productSlug}.mdx`);
  }

  console.log(
    `\n[scaffold-wave1] wrote ${written} MDX files (${WAVE1.length} carriers × 2).`,
  );
}

main();
