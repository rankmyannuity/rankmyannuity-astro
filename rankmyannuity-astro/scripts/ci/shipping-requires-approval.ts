#!/usr/bin/env tsx
// [Phase 5] CI gate: any MDX whose frontmatter declares `status: "shipping"`
// must have a corresponding entry in data-pipeline/sources/carriers.shipping.yml.
//
// Rationale: shipping is the editorial promotion event that makes a review
// "live" on the site. PHASE5_SPEC.md §2 requires shipping promotion to be
// an explicit, audited, per-carrier event — not an implicit consequence
// of an MDX edit. A PR that merely flips `status: "shipping"` without
// adding an approval entry must fail CI.
//
// This script is a linter — it does NOT fetch, diff, or mutate. It reads
// current repo state and exits 1 with a human-friendly error when the
// invariant is violated. Exit 0 on success.
//
// Safe on Windows: all paths go through node:path.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import matter from "gray-matter";
import { readShippingYaml, findShippingApproval } from "../../data-pipeline/helpers/shippingYaml.ts";

const projectRoot = process.cwd();
const reviewsDir = resolve(projectRoot, "src/content/reviews");
const shippingPath = resolve(
  projectRoot,
  "data-pipeline/sources/carriers.shipping.yml",
);

function main(): number {
  if (!existsSync(reviewsDir)) {
    console.error(`[ci:shipping-requires-approval] FAIL: reviews directory missing at ${reviewsDir}`);
    return 1;
  }

  const shipping = readShippingYaml(shippingPath);

  const errors: string[] = [];
  const files = readdirSync(reviewsDir).filter((f) => f.endsWith(".mdx"));
  for (const file of files) {
    const full = join(reviewsDir, file);
    const raw = readFileSync(full, "utf-8");
    const { data: fm } = matter(raw);
    const status = typeof fm.status === "string" ? fm.status : undefined;
    if (status !== "shipping") continue;

    // Carrier reviews have `carrier.slug`; product reviews have `product.slug`.
    // Shipping approvals are keyed by CARRIER slug — product reviews
    // inherit their carrier's shipping approval.
    const carrierSlug =
      (fm.carrier as { slug?: unknown } | undefined)?.slug ??
      (fm.product as { carrierSlug?: unknown } | undefined)?.carrierSlug;

    if (typeof carrierSlug !== "string" || carrierSlug.length === 0) {
      errors.push(
        `${file}: status="shipping" but could not locate carrier slug (expected carrier.slug or product.carrierSlug).`,
      );
      continue;
    }

    const approval = findShippingApproval(shipping, carrierSlug);
    if (!approval) {
      errors.push(
        `${file}: status="shipping" for carrier "${carrierSlug}" but no entry in data-pipeline/sources/carriers.shipping.yml. ` +
          `Add an approval entry (approved_by + approved_at + mdx_sha256) or revert the MDX status to "pilot".`,
      );
    }
  }

  if (errors.length === 0) {
    console.log(`[ci:shipping-requires-approval] OK — every shipping MDX has a matching approval.`);
    return 0;
  }

  console.error(`[ci:shipping-requires-approval] FAIL: ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error();
  console.error(
    `Shipping promotion is a separate, explicit, per-carrier approval event (PHASE5_SPEC.md §2).`,
  );
  return 1;
}

process.exit(main());
