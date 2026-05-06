// Content-collection schemas.
//
// Phase 2 adds:
//   - `pages` collection (trust / informational content rendered at root)
//   - `draft` + optional `slug` override on every content collection
//   - Slightly tightened review schema (discriminated union kept from Phase 1)
//
// Deliberately NOT in this phase:
//   - `rates`, `rankings`, or any pipeline-generated data schemas
//   - Runtime business logic (calculator, ranking)

import { defineCollection, reference, z } from 'astro:content';
// [Phase 5.0c] Shared cross-field frontmatter predicate. See
// data-pipeline/predicates/frontmatterCrossField.ts for the contract.
// The predicate is zod-free by design — we wrap its plain Issue[] into
// zod custom issues below so the Astro-side zod version stays decoupled
// from the pipeline-side zod version.
import { checkFrontmatterCrossField } from '../../data-pipeline/predicates/frontmatterCrossField';

/* ---------- shared helpers ---------- */

const isoDate = z.coerce.date();
const url = z.string().url();

// [Phase 5] Carrier/product lifecycle status. Required on every
// review MDX. Mirrors data-pipeline/schemas/carrier.ts CarrierStatusSchema.
// Both schemas must stay in lockstep (PHASE5_SPEC.md §4, §6).
const carrierStatus = z.enum(['pilot', 'shipping', 'retired']);

// [Phase 5] shipping_criteria sub-object — mirrors
// data-pipeline/schemas/carrier.ts ShippingCriteriaSchema.
const shippingCriteria = z.object({
  rates_logged: z.boolean(),
  rates_not_applicable: z.boolean().default(false),
  rates_not_applicable_reason: z.string().min(1).optional(),
  products_reviewed: z.boolean(),
  legal_approved: z.boolean(),
  compliance_approved: z.boolean(),
  sme_reviewed: z.boolean(),
});

const authorSchema = z.object({
  name: z.string(),
  title: z.string().optional(),              // e.g. "Series 65, ChFC"
  bio: z.string().optional(),
  url: url.optional(),
});

const sourceSchema = z.object({
  label: z.string(),
  url: url,
  publisher: z.string().optional(),
  accessed: isoDate.optional(),
});

// Common fields shared across content-type collections
const commonContentFields = {
  title: z.string().min(10).max(90),
  description: z.string().min(70).max(170),
  slug: z.string().optional(),               // optional frontmatter override; filename is default
  publishedAt: isoDate,
  updatedAt: isoDate,
  author: authorSchema,
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  sources: z.array(sourceSchema).default([]),
};

/* ---------- /learn/* — articles and roundups ---------- */

const learn = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      ...commonContentFields,
      reviewer: authorSchema.optional(),
      heroImage: image().optional(),
      heroImageAlt: z.string().optional(),
      relatedArticles: z.array(reference('learn')).default([]),
      relatedReviews: z.array(reference('reviews')).default([]),
      disclaimer: z.enum(['general', 'yield', 'ranking', 'product']).default('general'),
      // Reserved for Phase 4 (rankings pipeline). Safe to declare now.
      rankingKey: z
        .enum(['fia-top', 'myga-top', 'rila-top', 'va-low-fee', 'income-top'])
        .optional(),
    }),
});

/* ---------- /reviews/* — carrier and product reviews ---------- */

const reviews = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    // [Phase 5] Conditional-required logic (status → shipping_criteria,
    // status=retired → retired_reason, rates_not_applicable → reason) lives
    // in an OUTER .superRefine rather than on each union member, because
    // zod's discriminatedUnion only accepts plain ZodObject options — a
    // .superRefine returns ZodEffects and breaks discrimination.
    z.discriminatedUnion('kind', [
      // Carrier review (e.g. /reviews/athene)
      z.object({
        kind: z.literal('carrier'),
        ...commonContentFields,
        reviewer: authorSchema.optional(),
        heroImage: image().optional(),
        // Carrier-specific fact fields, inlined so Phase 2 can render reviews
        // without depending on the (later) carriers data collection.
        carrier: z.object({
          slug: z.string(),                  // "athene"
          legalName: z.string(),             // "Athene Annuity and Life Company"
          displayName: z.string(),           // "Athene"
          domicile: z.string(),              // "IA"
          ratings: z
            .object({
              amBest: z.string().optional(),
              sp: z.string().optional(),
              moodys: z.string().optional(),
              fitch: z.string().optional(),
              asOf: isoDate.optional(),
            })
            .default({}),
          website: url.optional(),
        }),
        // Editorial verdict / our take, surfaced above the body copy
        verdict: z.object({
          grade: z.string().optional(),
          gradeStatus: z.enum(['active', 'deferred', 'retired']).default('deferred'),
          bestFor: z.string().optional(),
          watchouts: z.array(z.string()).default([]),
          }).default({}),
        // [Phase 5] lifecycle status — required
        status: carrierStatus,
        // [Phase 5] required when status === 'shipping' (enforced in outer .superRefine)
        shipping_criteria: shippingCriteria.optional(),
        // [Phase 5] required (non-empty) when status === 'retired'
        retired_reason: z.string().min(1).optional(),
        relatedReviews: z.array(reference('reviews')).default([]),
        relatedArticles: z.array(reference('learn')).default([]),
      }),
      // Product review (e.g. /reviews/athene-performance-elite)
      z.object({
        kind: z.literal('product'),
        ...commonContentFields,
        reviewer: authorSchema.optional(),
        heroImage: image().optional(),
        product: z.object({
          slug: z.string(),
          name: z.string(),
          carrierSlug: z.string(),           // cross-ref to a carrier review slug
          carrierName: z.string(),
          productType: z.enum(['FIA', 'MYGA', 'RILA', 'VA', 'SPIA', 'DIA']),
          surrenderYears: z.number().int().min(0).max(20).optional(),
          mvAllowed: z.boolean().optional(),
          featuredCapRate: z.number().optional(),            // decimal, e.g. 0.0825
          featuredParticipationRate: z.number().optional(),  // decimal
          featuredSpread: z.number().optional(),
          featuredIndexes: z.array(z.string()).default([]),
        }),
        verdict: z.object({
          grade: z.string().optional(),
            gradeStatus: z.enum(['active', 'deferred', 'retired']).default('deferred'),
          bestFor: z.string().optional(),
          watchouts: z.array(z.string()).default([]),
        }).default({}),
        // [Phase 5] lifecycle status — required; inherits from carrier unless
        // an individual product is independently retired.
        status: carrierStatus,
        // [Phase 5] required (non-empty) when status === 'retired'
        retired_reason: z.string().min(1).optional(),
        relatedReviews: z.array(reference('reviews')).default([]),
        relatedArticles: z.array(reference('learn')).default([]),
      }),
    ]).superRefine((val, ctx) => {
      // [Phase 5.0c] Delegates to the shared cross-field predicate so this
      // content-collection schema, data-pipeline/schemas/carrier.ts, and
      // data-pipeline/schemas/product.ts all emit identical paths + messages
      // for the same violations.
      // SHARED CONTRACT: data-pipeline/predicates/frontmatterCrossField.ts.
      const issues = checkFrontmatterCrossField(
        val.kind === 'carrier'
          ? {
              kind: 'carrier',
              status: val.status,
              shipping_criteria: val.shipping_criteria,
              retired_reason: val.retired_reason,
            }
          : {
              kind: 'product',
              status: val.status,
              retired_reason: val.retired_reason,
            },
      );
      for (const issue of issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...issue.path],
          message: issue.message,
        });
      }
    }),
});

/* ---------- pages — trust / informational content ----------
   Rendered at root URLs like /about, /methodology (via src/pages/[slug].astro),
   so the collection slug IS the URL path.
*/

const pages = defineCollection({
  type: 'content',
  schema: () =>
    z.object({
      ...commonContentFields,
      // noindex is useful for placeholder legal pages during development
      noindex: z.boolean().default(false),
      // Optional canonical override (rarely needed; default derives from slug)
      canonicalOverride: url.optional(),
    }),
});

export const collections = { learn, reviews, pages };
