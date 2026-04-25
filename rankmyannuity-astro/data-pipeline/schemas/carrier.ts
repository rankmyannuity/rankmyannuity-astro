// Carrier schema — describes the shape the pipeline reads from the MDX
// frontmatter of /src/content/reviews/<slug>.mdx where kind=="carrier".
//
// Per Phase 4 brief: MDX frontmatter is the source of truth for carrier
// facts. This schema is NOT a second source of truth. It is a read-side
// contract so that if MDX frontmatter drifts, the pipeline fails loud
// rather than silently coercing.
//
// .strict() means any unexpected key in the frontmatter fails the build.
// That's the entire point — it forces Phase 2's frontmatter schema and
// the pipeline's expectations to stay in sync.

import { z } from "zod";
import { checkFrontmatterCrossField } from "../predicates/frontmatterCrossField";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// [Phase 5] Carrier lifecycle status — authored in MDX. The pipeline may
// DOWNGRADE an authored "shipping" to "pilot" at normalize time if the MDX
// sha256 does not match the carriers.shipping.yml approval entry. See
// PHASE5_SPEC.md §4 for the full promotion model.
export const CarrierStatusSchema = z.enum(["pilot", "shipping", "retired"]);
export type CarrierStatus = z.infer<typeof CarrierStatusSchema>;

// [Phase 5] shipping_criteria sub-object. Conditionally required: must be
// present (and all booleans truthy where applicable) when status === "shipping".
// The conditional-required logic lives in .superRefine on the parent schema.
const ShippingCriteriaSchema = z.object({
  // true iff ≥1 rate in rates.myga.yml is linked to this carrier
  rates_logged: z.boolean(),
  // set by editorial when the carrier has no MYGA product to rate (e.g. FIA-only)
  rates_not_applicable: z.boolean().default(false),
  // REQUIRED non-empty when rates_not_applicable === true; conditional via .superRefine
  rates_not_applicable_reason: z.string().min(1).optional(),
  // every in-scope product for this carrier has an MDX review
  products_reviewed: z.boolean(),
  legal_approved: z.boolean(),
  compliance_approved: z.boolean(),
  sme_reviewed: z.boolean(),
}).strict();

export const CarrierFrontmatterSchema = z.object({
  // MDX-level fields (Phase 2 schema)
  kind: z.literal("carrier"),
  title: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(), // MDX filename is fallback
  publishedAt: z.string(),                            // coerced to date by Astro; we keep raw
  updatedAt: z.string(),
  author: z.object({
    name: z.string(),
    title: z.string().optional(),
    bio: z.string().optional(),
    url: z.string().url().optional(),
  }),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),

  // Carrier-specific structured fields
  carrier: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    legalName: z.string().min(1),
    displayName: z.string().min(1),
    domicile: z.string().length(2),                   // "IA"
    ratings: z.object({
      amBest: z.string().optional(),
      sp: z.string().optional(),
      moodys: z.string().optional(),
      fitch: z.string().optional(),
      asOf: z.string().optional(),
    }).default({}),
    website: z.string().url().optional(),
  }),

  // Editorial verdict — authored by humans, not computed
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
  heroImage: z.any().optional(),                      // Astro image() — pipeline ignores
  heroImageAlt: z.string().optional(),

  // [Phase 5] Lifecycle status — required. Defaults to "pilot" for
  // existing carriers being migrated (see PHASE5_KICKOFF.md). "shipping"
  // may be downgraded to "pilot" by the normalize layer on MDX sha256
  // drift; "retired" requires retired_reason.
  status: CarrierStatusSchema,

  // [Phase 5] Required when status === "shipping". Checked via .superRefine.
  shipping_criteria: ShippingCriteriaSchema.optional(),

  // [Phase 5] Required non-empty string when status === "retired". Surfaced
  // on the review page so users landing on old links see the context.
  retired_reason: z.string().min(1).optional(),
}).strict().superRefine((val, ctx) => {
  // [Phase 5.0c] Delegates to the shared cross-field predicate so this
  // schema, data-pipeline/schemas/product.ts, and src/content/config.ts
  // all emit identical paths + messages for the same violations.
  // SHARED CONTRACT: data-pipeline/predicates/frontmatterCrossField.ts.
  for (const issue of checkFrontmatterCrossField({
    kind: "carrier",
    status: val.status,
    shipping_criteria: val.shipping_criteria,
    retired_reason: val.retired_reason,
  })) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...issue.path],
      message: issue.message,
    });
  }
});

export type CarrierFrontmatter = z.infer<typeof CarrierFrontmatterSchema>;
