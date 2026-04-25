#!/usr/bin/env tsx
// [Phase 5] CI gate: every entry in carriers.shipping.yml must have an
// mdx_sha256 that matches the current, on-disk MDX bytes for the
// corresponding carrier review.
//
// Rationale: the sha256 on a shipping approval pins the exact MDX bytes
// that were editorially reviewed (PHASE5_SPEC.md §2). A PR that changes
// an MDX's bytes after approval MUST either (a) re-run the approval and
// update the sha, or (b) accept the automatic sha256 downgrade the
// normalize layer applies (which turns the emitted sidecar status back
// to "pilot"). CI blocks option (c) — silently leaving the stale
// approval in place while editing the MDX.
//
// This is distinct from shipping-requires-approval.ts:
//   - shipping-requires-approval.ts  — PR flips MDX to status="shipping"
//                                       without adding an approval entry
//   - shipping-sha256-match.ts       — approval exists but sha is stale
//
// Exit 0 on success, 1 on violation.

import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { mdxSha256 } from "../../data-pipeline/helpers/mdxSha256.ts";
import { carrierReviewMdxPath } from "../../data-pipeline/helpers/carrierReviewMdxPath.ts";
import { readShippingYaml } from "../../data-pipeline/helpers/shippingYaml.ts";

const projectRoot = process.cwd();
const reviewsDir = resolve(projectRoot, "src/content/reviews");
const shippingPath = resolve(
  projectRoot,
  "data-pipeline/sources/carriers.shipping.yml",
);

function main(): number {
  const shipping = readShippingYaml(shippingPath);
  if (shipping.approvals.length === 0) {
    console.log(
      `[ci:shipping-sha256-match] OK — carriers.shipping.yml has no approvals (pilot state).`,
    );
    return 0;
  }

  if (!existsSync(reviewsDir)) {
    console.error(
      `[ci:shipping-sha256-match] FAIL: reviews directory missing at ${reviewsDir}`,
    );
    return 1;
  }

  // Build a slug → absolute MDX path map. Approvals are keyed by carrier
  // slug; we locate the carrier's MDX by matching the filename.
  // Convention: src/content/reviews/<carrier-slug>.mdx is the carrier
  // review. Product MDX paths are named <carrier>-<product>.mdx and are
  // NOT the sha target — shipping approval pins the carrier review's
  // bytes, since that's the editorial deliverable.
  const candidateFiles = readdirSync(reviewsDir).filter((f) =>
    f.endsWith(".mdx"),
  );

  const errors: string[] = [];
  for (const approval of shipping.approvals) {
    const expected = `${approval.carrier_slug}.mdx`;
    if (!candidateFiles.includes(expected)) {
      errors.push(
        `${approval.carrier_slug}: shipping approval exists but no MDX at src/content/reviews/${expected}. ` +
          `Either create the review or remove the approval entry.`,
      );
      continue;
    }

    // Path derivation delegated to the shared helper — single source of
    // truth with data-pipeline/cli/orchestrator.ts (Layer 2). See
    // data-pipeline/helpers/carrierReviewMdxPath.ts.
    const mdxPath = carrierReviewMdxPath(projectRoot, approval.carrier_slug);
    let currentSha: string;
    try {
      currentSha = mdxSha256(mdxPath);
    } catch (err) {
      errors.push(
        `${approval.carrier_slug}: could not compute sha256 for ${expected}: ${(err as Error).message}`,
      );
      continue;
    }

    if (currentSha !== approval.mdx_sha256) {
      errors.push(
        `${approval.carrier_slug}: carriers.shipping.yml sha256 is stale.\n` +
          `      approval:  ${approval.mdx_sha256}\n` +
          `      on-disk:   ${currentSha}\n` +
          `      Either re-review and update the approval's mdx_sha256, or revert the MDX edit.`,
      );
    }
  }

  if (errors.length === 0) {
    console.log(
      `[ci:shipping-sha256-match] OK — all ${shipping.approvals.length} shipping approval(s) match their MDX bytes.`,
    );
    return 0;
  }

  console.error(
    `[ci:shipping-sha256-match] FAIL: ${errors.length} stale approval(s):`,
  );
  for (const e of errors) console.error(`  - ${e}`);
  return 1;
}

process.exit(main());
