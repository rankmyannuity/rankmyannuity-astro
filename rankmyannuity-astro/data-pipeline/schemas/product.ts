// Product schema — describes the shape the pipeline reads from MDX
// frontmatter where kind=="product". MDX is authoritative (Phase 4 brief).

import { z } from "zod";
import { CarrierStatusSchema } from "./carrier";
import { checkFrontmatterCrossField } from "../predicates/frontmatterCrossField";

export const ProductFrontmatterSchema = z.object({
  kind: z.literal("product"),
  title: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  author: z.object({
    name: z.string(),
    title: z.string().optional(),
    bio: z.string().optional(),
    url: z.string().url().optional(),
  }),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),

  product: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    carrierSlug: z.string().regex(/^[a-z0-9-]+$/),       // FK → carrier review slug
    carrierName: z.string().min(1),
    productType: z.enum(["FIA","MYGA","RILA","VA","SPIA","DIA"]),
    surrenderYears: z.number().int().min(0).max(20).optional(),
    mvAllowed: z.boolean().optional(),
    featuredCapRate: z.number().min(0).max(1).optional(),         // decimal
    featuredParticipationRate: z.number().min(0).max(2).optional(),
    featuredSpread: z.number().min(0).max(0.20).optional(),
    featuredIndexes: z.array(z.string()).default([]),
  }),

  verdict: z.object({
    grade: z.enum(["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"]).optional(),
    bestFor: z.string().optional(),
    watchouts: z.array(z.string()).default([]),
  }).default({}),

  sources: z.array(z.object({
    label: z.string(),
    url: z.string().url(),
    publisher: z.string().optional(),
    accessed: z.string().optional(),
  })).default([]),

  relatedReviews: z.array(z.string()).default([]),
  relatedArticles: z.array(z.string()).default([]),
  reviewer: z.object({
    name: z.string(),
    title: z.string().optional(),
    bio: z.string().optional(),
    url: z.string().url().optional(),
  }).optional(),
  heroImage: z.any().optional(),
  heroImageAlt: z.string().optional(),

  // [Phase 5] Product-level lifecycle status. Mirrors the carrier enum so
  // a single product can be retired independently (e.g. a discontinued MYGA
  // term while the carrier stays shipping). Carrier-level shipping_criteria
  // is NOT duplicated here — shipping approval is a per-carrier event that
  // covers all of that carrier's in-scope products (PHASE5_SPEC.md §4).
  status: CarrierStatusSchema,

  // [Phase 5] Required non-empty string when status === "retired".
  retired_reason: z.string().min(1).optional(),
}).strict().superRefine((val, ctx) => {
  // [Phase 5.0c] Delegates to the shared cross-field predicate so this
  // schema, data-pipeline/schemas/carrier.ts, and src/content/config.ts
  // all emit identical paths + messages for the same violations.
  // SHARED CONTRACT: data-pipeline/predicates/frontmatterCrossField.ts.
  for (const issue of checkFrontmatterCrossField({
    kind: "product",
    status: val.status,
    retired_reason: val.retired_reason,
  })) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...issue.path],
      message: issue.message,
    });
  }
});

export type ProductFrontmatter = z.infer<typeof ProductFrontmatterSchema>;
