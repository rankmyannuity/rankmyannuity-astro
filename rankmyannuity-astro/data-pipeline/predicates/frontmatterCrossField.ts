// [Phase 5.0c] Frontmatter cross-field predicates — shared module.
//
// SHARED CONTRACT between THREE call sites that all enforce the same
// conditional-required rules across MDX review frontmatter:
//
//   1. data-pipeline/schemas/carrier.ts   (pipeline-side carrier schema)
//   2. data-pipeline/schemas/product.ts   (pipeline-side product schema)
//   3. src/content/config.ts              (Astro content-collection schema)
//
// Any change to the rules, paths, or messages below MUST update ALL
// THREE call sites in the SAME PR. This file is the single source of
// truth; drift here silently changes what the pipeline accepts and
// what Astro will build.
//
// Kickoff-ratified scope (PHASE5_KICKOFF.md, Phase 5.0c):
//   - Single-purpose, single-argument, side-effect-free API. Input in,
//     Issue[] out. No options bag, no normalization flags. Same spirit
//     as data-pipeline/predicates/myga.ts.
//   - Zod-free by design: the predicate returns plain {path, message}
//     records. Each call site wraps them into its own zod ctx.addIssue
//     call. This avoids coupling the Astro-side zod version to the
//     pipeline-side zod version.
//   - Scope stays the THREE existing rules below. Do NOT generalize
//     beyond the fields currently in the refine — future field
//     additions are their own spec decisions (PHASE5_KICKOFF.md §5.0c).
//
// The rules (PHASE5_SPEC.md §4):
//   Rule 1 (carrier only): status === "shipping"
//     ⇒ shipping_criteria must be present
//   Rule 2 (carrier only): shipping_criteria.rates_not_applicable === true
//     ⇒ shipping_criteria.rates_not_applicable_reason must be non-empty
//   Rule 3 (carrier OR product): status === "retired"
//     ⇒ retired_reason must be non-empty
//
// `shipping_criteria` is carrier-only per spec; products never carry
// rules 1 or 2.

/**
 * Plain issue record returned by the predicate. Deliberately zod-free.
 * Each call site converts this into its own zod custom issue via
 * `ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })`.
 *
 * `path` is the zod issue path relative to the validated object.
 */
export type FrontmatterCrossFieldIssue = {
  path: ReadonlyArray<string | number>;
  message: string;
};

/**
 * Input shape accepted by the predicate. Deliberately loose/structural
 * so every call site (pipeline carrier schema, pipeline product schema,
 * Astro content-collection union) can pass its own already-validated
 * value without a coercion step.
 *
 * `kind` selects which rules apply:
 *   - "carrier": rules 1, 2, 3
 *   - "product": rule 3 only
 *
 * All other fields are optional; absent/undefined fields are treated
 * as "not provided".
 */
export type FrontmatterCrossFieldInput = {
  kind: "carrier" | "product";
  status: "pilot" | "shipping" | "retired";
  shipping_criteria?: {
    rates_not_applicable?: boolean;
    rates_not_applicable_reason?: string;
    // Other shipping_criteria fields are irrelevant to these cross-field rules.
    [key: string]: unknown;
  };
  retired_reason?: string;
};

/**
 * Collects all cross-field frontmatter issues for a single review
 * (carrier or product). Pure, no I/O, no side effects. Returns an
 * empty array when the input is valid.
 *
 * SHARED CONTRACT: see module docstring. Changes here must land with
 * corresponding updates in every call site in the same PR.
 *
 * Returns issues in a stable order (rule 1, then rule 2, then rule 3)
 * so call sites emit deterministic validation output.
 */
export function checkFrontmatterCrossField(
  input: FrontmatterCrossFieldInput,
): FrontmatterCrossFieldIssue[] {
  const issues: FrontmatterCrossFieldIssue[] = [];

  // Rule 1 (carrier only): status === "shipping" ⇒ shipping_criteria present.
  if (
    input.kind === "carrier" &&
    input.status === "shipping" &&
    !input.shipping_criteria
  ) {
    issues.push({
      path: ["shipping_criteria"],
      message: "shipping_criteria is required when status === 'shipping'",
    });
  }

  // Rule 2 (carrier only): rates_not_applicable === true
  //   ⇒ rates_not_applicable_reason non-empty.
  if (
    input.kind === "carrier" &&
    input.shipping_criteria?.rates_not_applicable === true &&
    (input.shipping_criteria.rates_not_applicable_reason === undefined ||
      input.shipping_criteria.rates_not_applicable_reason.trim() === "")
  ) {
    issues.push({
      path: ["shipping_criteria", "rates_not_applicable_reason"],
      message:
        "rates_not_applicable_reason is required (non-empty) when shipping_criteria.rates_not_applicable === true",
    });
  }

  // Rule 3 (carrier OR product): status === "retired" ⇒ retired_reason non-empty.
  if (
    input.status === "retired" &&
    (input.retired_reason === undefined || input.retired_reason.trim() === "")
  ) {
    issues.push({
      path: ["retired_reason"],
      message:
        "retired_reason is required (non-empty) when status === 'retired'",
    });
  }

  return issues;
}
