// [Phase 6.0a] carrierReviewMdxPath — shared path-derivation helper for the
// two-layer shipping-sha256 enforcement contract.
//
// SHARED CONTRACT between scripts/ci/shipping-sha256-match.ts (Layer 1 — PR
// gate) and data-pipeline/cli/orchestrator.ts (Layer 2 — runtime-normalize
// downgrade lookup). Any change to this helper must update both call sites
// in the same PR. See SHIPPING_SHA256_CONTRACT.md for the full two-layer
// contract specification.
//
// Convention: the carrier review MDX for a given slug lives at
// src/content/reviews/<slug>.mdx. This helper is the sole source of truth
// for that convention across the pipeline — do not open-code the path
// elsewhere; call this helper instead so future relocations of the content
// directory remain a one-line change.

import { resolve } from "node:path";

/**
 * Resolve the absolute filesystem path to a carrier review MDX file.
 *
 * @param projectRoot absolute path to the Astro project root (the directory
 *                    containing src/, data-pipeline/, etc.)
 * @param slug        carrier slug, as it appears in
 *                    carriers.shipping.yml's approvals[].carrier_slug and
 *                    in MDX frontmatter's slug field.
 * @returns absolute path to src/content/reviews/<slug>.mdx (which may or
 *          may not exist on disk — callers that need existence checking
 *          should handle ENOENT from downstream readFileSync themselves).
 */
export function carrierReviewMdxPath(
  projectRoot: string,
  slug: string,
): string {
  return resolve(projectRoot, "src/content/reviews", `${slug}.mdx`);
}
