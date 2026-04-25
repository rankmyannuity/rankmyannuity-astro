// Review (generated sidecar) schema — this is what the PIPELINE EMITS,
// not what an editor writes. The MDX file holds the editorial body and
// authoritative facts; this sidecar JSON layers in pipeline-computed data:
// a linked rate (if any), the implied rate derived from it, and the
// letter grade from calculatorMath.gradeRate().
//
// Pages read BOTH the MDX (via Astro getEntry) and this JSON (via a
// content collection of type "data") and render them together.

import { z } from "zod";
import { PIPELINE_VERSION } from "./manifest";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// [Phase 5] Review sidecar liveness status — unified surface so pages can
// uniformly apply the "not live" UI treatment (em-dash + chip + noindex)
// via src/lib/ui/liveness.ts. A sidecar is "not_live" whenever the pipeline
// cannot confidently publish the review's grade/comparison surface as a
// live datum. The not_live_cause enum is deliberately closed so unknown
// causes fail the schema rather than silently reaching the UI.
export const ReviewSidecarStatusSchema = z.enum(["live", "not_live"]);
export type ReviewSidecarStatus = z.infer<typeof ReviewSidecarStatusSchema>;

export const ReviewSidecarNotLiveCauseSchema = z.enum([
  "pilot_carrier",      // MDX carrier/product status === "pilot" (or sha256 drift downgraded it)
  "degraded_benchmark", // The benchmark backing this review's comparison is degraded
  "empty_benchmark",    // The benchmark backing this review is pilot_empty (no live value)
  "retired_carrier",    // MDX status === "retired"
]);
export type ReviewSidecarNotLiveCause = z.infer<typeof ReviewSidecarNotLiveCauseSchema>;

export const ReviewSidecarSchema = z.object({
  // Identity — matches the MDX filename / review slug
  slug: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["carrier", "product"]),

  // Back-refs to the curated layer (MDX); pages use these to load the body
  mdx_path: z.string(),                                      // e.g. "reviews/athene-performance-elite"
  carrier_slug: z.string(),
  product_slug: z.string().nullable(),                       // null for carrier-level reviews

  // Pipeline-computed / linked-in data. Anything null here means the
  // pipeline could not produce it from available sources; pages should
  // render a "Rate not available" state rather than hiding the section.
  linked_rate: z.object({
    term_years: z.number().int(),
    rate: z.number(),                                         // decimal
    effective_date: isoDate,
    // [Phase 5.0d] observed_at carried through so reviews can display
    // the same "last observed on ..." context the /rates table uses.
    observed_at: isoDate,
    // [Phase 5.0d] Product-variant fidelity — the specific named
    // product behind the generic product_slug MDX (e.g. for
    // new-york-life-secure-term-myga, product_variant might be
    // "Secure Term MVA II").
    product_variant: z.string().min(1),
    product_variant_slug: z.string().regex(/^[a-z0-9-]+$/),
    source_name: z.string(),
    source_url: z.string().url().nullable(),
    premium_band_min: z.number().int().nonnegative(),
    premium_band_max: z.number().int().positive().nullable(),
  }).nullable(),

  // Benchmark delta: linked_rate.rate - top_myga_5yr.rate. Only present
  // when linked_rate is present. Positive = beats top MYGA.
  benchmark_delta: z.object({
    vs_top_myga_5yr: z.number(),                              // decimal (e.g. -0.0058)
    formatted: z.string(),                                    // "0.58% below top MYGA (5.90%)"
  }).nullable(),

  // Computed grade — uses the EXISTING calculatorMath.gradeRate function.
  // source_fn is a machine-checkable guard: if the pipeline ever routes
  // through a different grading function, this literal must be updated,
  // and the schema bumps catch that in CI.
  computed_grade: z.object({
    rate_used: z.number(),                                    // the implied rate fed to gradeRate
    letter: z.enum(["A+","A","B","C","F","N/A"]),
    grade_class: z.string(),
    grade_label: z.string(),
    source_fn: z.literal("calculatorMath.gradeRate"),
  }).nullable(),

  // [Phase 5] Liveness surface. `status` is required; `not_live_cause` is
  // required-non-null when status === "not_live" and required-null when
  // status === "live". The .superRefine below enforces that invariant so
  // pages can trust the pair without defensive branching.
  status: ReviewSidecarStatusSchema,
  not_live_cause: ReviewSidecarNotLiveCauseSchema.nullable(),

  // Provenance — makes every emitted review traceable
  generated_at: z.string(),                                   // ISO timestamp
  pipeline_version: z.literal(PIPELINE_VERSION),
}).strict().superRefine((val, ctx) => {
  // Mutual-exclusivity invariant between status and not_live_cause:
  //
  //   status === "live"     ⇔  not_live_cause === null
  //   status === "not_live" ⇔  not_live_cause !== null
  //
  // This matches the benchmark schema pattern (rate===0 ⇔ pilot_empty)
  // and prevents the UI from ever rendering a "not live" review without
  // a displayable cause — or a "live" review that silently carries one.
  if (val.status === "live" && val.not_live_cause !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["not_live_cause"],
      message:
        "status 'live' requires not_live_cause === null; live reviews cannot carry a not_live_cause.",
    });
  }
  if (val.status === "not_live" && val.not_live_cause === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["not_live_cause"],
      message:
        "status 'not_live' requires a non-null not_live_cause; one of pilot_carrier | degraded_benchmark | empty_benchmark | retired_carrier.",
    });
  }
});

export type ReviewSidecar = z.infer<typeof ReviewSidecarSchema>;
