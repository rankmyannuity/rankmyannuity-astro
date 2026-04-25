// [Phase 5] Schema for data-pipeline/sources/carriers.shipping.yml.
//
// See sources/carriers.shipping.yml for field-level documentation and
// PHASE5_SPEC.md §2 for the shipping promotion model.

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const hex64 = z.string().regex(/^[0-9a-f]{64}$/, "must be 64-char lowercase hex sha256");

export const ShippingApprovalSchema = z
  .object({
    carrier_slug: z.string().regex(/^[a-z0-9-]+$/),
    mdx_path: z.string().min(1),
    mdx_sha256: hex64,
    approved_by: z.string().regex(/^[a-z0-9-]+$/), // FK → reviewers.yml.id
    approved_at: isoDate,
    notes: z.string().optional(),
  })
  .strict();

export type ShippingApproval = z.infer<typeof ShippingApprovalSchema>;

export const ShippingApprovalsFileSchema = z
  .object({
    approvals: z.array(ShippingApprovalSchema),
  })
  .strict()
  .superRefine((val, ctx) => {
    // A carrier may appear at most once — duplicates would make the
    // "active approval" query ambiguous. If re-approval is needed (e.g.
    // after sha256 drift), the existing entry is updated in place.
    const seen = new Set<string>();
    for (let i = 0; i < val.approvals.length; i++) {
      const slug = val.approvals[i].carrier_slug;
      if (seen.has(slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["approvals", i, "carrier_slug"],
          message: `duplicate shipping approval for carrier: ${slug}`,
        });
      }
      seen.add(slug);
    }
  });

export type ShippingApprovalsFile = z.infer<typeof ShippingApprovalsFileSchema>;
