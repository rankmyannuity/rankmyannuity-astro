// [Phase 5] reviewersYaml — reader for sources/reviewers.yml.
//
// Maintains the allow-list of humans authorized to sign off on shipping
// promotions (PHASE5_SPEC.md §2). Each reviewer has a window of activity
// bounded by iso dates; `active_at(reviewers, iso_date)` returns the set
// of reviewers whose window covers that date.
//
// The file starts empty in Phase 5.0a — no one is yet authorized to
// ship. A reviewer must be added by a separate PR before they can appear
// in carriers.shipping.yml.approved_by.
//
// Shape (in YAML):
//   reviewers:
//     - id: "alice"                        # stable, lowercase, matches approved_by
//       name: "Alice Example"              # human-readable for REVIEW.md
//       active_from: "2026-04-22"          # inclusive, YYYY-MM-DD
//       active_until: null                 # inclusive, null = still active
//       notes: "Head of Compliance"        # optional
//
// Absent file is a valid pilot state (returns {reviewers: []}); malformed
// YAML is a hard error.

import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

export const ReviewerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case"),
    name: z.string().min(1),
    active_from: isoDate,
    active_until: isoDate.nullable(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // active_until (if set) must be on or after active_from. Same-day
    // windows are allowed (a reviewer may be added and removed in one day
    // during corrections).
    if (val.active_until !== null && val.active_until < val.active_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["active_until"],
        message: `active_until (${val.active_until}) must be >= active_from (${val.active_from})`,
      });
    }
  });

export type Reviewer = z.infer<typeof ReviewerSchema>;

export const ReviewersFileSchema = z
  .object({
    reviewers: z.array(ReviewerSchema),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Reviewer ids must be globally unique. A collision would silently
    // conflate two humans' approval windows.
    const seen = new Set<string>();
    for (let i = 0; i < val.reviewers.length; i++) {
      const id = val.reviewers[i].id;
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reviewers", i, "id"],
          message: `duplicate reviewer id: ${id}`,
        });
      }
      seen.add(id);
    }
  });

export type ReviewersFile = z.infer<typeof ReviewersFileSchema>;

/**
 * Read and validate sources/reviewers.yml.
 *
 * @param filePath absolute path to reviewers.yml
 * @returns parsed, schema-validated ReviewersFile. Missing file returns
 *          an empty list; malformed YAML or schema violation throws.
 */
export function readReviewersYaml(filePath: string): ReviewersFile {
  if (!existsSync(filePath)) {
    return { reviewers: [] };
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  // Treat null/undefined (empty YAML document) as empty list.
  const normalized = parsed ?? { reviewers: [] };
  return ReviewersFileSchema.parse(normalized);
}

/**
 * Return the subset of reviewers active on a given ISO date.
 * "Active on D" means: active_from <= D AND (active_until === null OR active_until >= D).
 *
 * @param reviewers a validated reviewer list (or the file wrapper)
 * @param isoDate   YYYY-MM-DD
 * @throws if isoDate is not in YYYY-MM-DD format
 */
export function activeAt(
  reviewers: Reviewer[] | ReviewersFile,
  isoDateStr: string,
): Reviewer[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) {
    throw new Error(
      `activeAt: isoDate must be YYYY-MM-DD, got ${JSON.stringify(isoDateStr)}`,
    );
  }
  const list = Array.isArray(reviewers) ? reviewers : reviewers.reviewers;
  return list.filter((r) => {
    if (r.active_from > isoDateStr) return false;
    if (r.active_until !== null && r.active_until < isoDateStr) return false;
    return true;
  });
}
