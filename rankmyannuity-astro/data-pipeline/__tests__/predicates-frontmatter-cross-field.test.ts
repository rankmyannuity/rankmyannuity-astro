// [Phase 5.0c] Unit tests for the canonical cross-field frontmatter
// predicate module.
//
// These tests import from
// data-pipeline/predicates/frontmatterCrossField.ts (the canonical
// single source of truth) and formalize the eight cases called out in
// the Phase 5.0c plan:
//
//   Carrier rules (1, 2, 3):
//     1. carrier shipping without shipping_criteria     → rule 1 fires
//     2. carrier rates_not_applicable without reason    → rule 2 fires
//     3. carrier retired without retired_reason         → rule 3 fires
//     4. carrier pilot (no constraints)                 → no issues
//     5. carrier shipping WITH shipping_criteria        → no issues
//     6. carrier all-valid (all three rules pass)       → no issues
//
//   Product rules (rule 3 only — shipping_criteria is carrier-only):
//     7. product retired without retired_reason         → rule 3 fires
//     8. product pilot (no constraints)                 → no issues
//
// The predicate is zod-free by contract — tests only assert on the
// plain {path, message} records the predicate returns. Each call site
// (carrier schema, product schema, Astro content-collection union) is
// responsible for wrapping those into its own ctx.addIssue call.

import { describe, it, expect } from "vitest";

import {
  checkFrontmatterCrossField,
  type FrontmatterCrossFieldInput,
} from "../predicates/frontmatterCrossField.ts";

// -----------------------------------------------------------------------------
// Error-path constants — these MUST match the pre-extraction strings exactly.
// Any change here is a schema-visible change and requires a spec decision.
// -----------------------------------------------------------------------------
const MSG_SHIPPING_CRITERIA_REQUIRED =
  "shipping_criteria is required when status === 'shipping'";
const MSG_RATES_NA_REASON_REQUIRED =
  "rates_not_applicable_reason is required (non-empty) when shipping_criteria.rates_not_applicable === true";
const MSG_RETIRED_REASON_REQUIRED =
  "retired_reason is required (non-empty) when status === 'retired'";

describe("predicates/frontmatterCrossField — carrier rules", () => {
  // Case 1: carrier shipping without shipping_criteria
  it("flags rule 1 when carrier status is 'shipping' and shipping_criteria is missing", () => {
    const input: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "shipping",
      // shipping_criteria intentionally omitted
    };
    const issues = checkFrontmatterCrossField(input);
    expect(issues).toEqual([
      {
        path: ["shipping_criteria"],
        message: MSG_SHIPPING_CRITERIA_REQUIRED,
      },
    ]);
  });

  // Case 2: carrier rates_not_applicable === true without reason
  it("flags rule 2 when rates_not_applicable is true but reason is missing/empty", () => {
    // Missing reason
    const missing: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "pilot",
      shipping_criteria: {
        rates_not_applicable: true,
      },
    };
    expect(checkFrontmatterCrossField(missing)).toEqual([
      {
        path: ["shipping_criteria", "rates_not_applicable_reason"],
        message: MSG_RATES_NA_REASON_REQUIRED,
      },
    ]);

    // Whitespace-only reason
    const whitespace: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "pilot",
      shipping_criteria: {
        rates_not_applicable: true,
        rates_not_applicable_reason: "   ",
      },
    };
    expect(checkFrontmatterCrossField(whitespace)).toEqual([
      {
        path: ["shipping_criteria", "rates_not_applicable_reason"],
        message: MSG_RATES_NA_REASON_REQUIRED,
      },
    ]);
  });

  // Case 3: carrier retired without retired_reason
  it("flags rule 3 when carrier status is 'retired' and retired_reason is missing/empty", () => {
    const missing: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "retired",
    };
    expect(checkFrontmatterCrossField(missing)).toEqual([
      {
        path: ["retired_reason"],
        message: MSG_RETIRED_REASON_REQUIRED,
      },
    ]);

    const whitespace: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "retired",
      retired_reason: "   ",
    };
    expect(checkFrontmatterCrossField(whitespace)).toEqual([
      {
        path: ["retired_reason"],
        message: MSG_RETIRED_REASON_REQUIRED,
      },
    ]);
  });

  // Case 4: carrier pilot (no constraints apply)
  it("returns no issues for a pilot carrier with no optional fields", () => {
    const input: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "pilot",
    };
    expect(checkFrontmatterCrossField(input)).toEqual([]);
  });

  // Case 5: carrier shipping WITH shipping_criteria (no rates_not_applicable)
  it("returns no issues for a shipping carrier with complete shipping_criteria", () => {
    const input: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "shipping",
      shipping_criteria: {
        rates_logged: true,
        rates_not_applicable: false,
        products_reviewed: true,
      },
    };
    expect(checkFrontmatterCrossField(input)).toEqual([]);
  });

  // Case 6: all valid — shipping + rates_not_applicable + reason supplied
  it("returns no issues when rates_not_applicable is true and reason is provided", () => {
    const input: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "shipping",
      shipping_criteria: {
        rates_logged: false,
        rates_not_applicable: true,
        rates_not_applicable_reason:
          "Carrier only ships SPIA/DIA products; MYGA rates not applicable.",
        products_reviewed: true,
      },
    };
    expect(checkFrontmatterCrossField(input)).toEqual([]);
  });
});

describe("predicates/frontmatterCrossField — product rules", () => {
  // Case 7: product retired without retired_reason
  it("flags rule 3 when product status is 'retired' and retired_reason is missing/empty", () => {
    const input: FrontmatterCrossFieldInput = {
      kind: "product",
      status: "retired",
    };
    expect(checkFrontmatterCrossField(input)).toEqual([
      {
        path: ["retired_reason"],
        message: MSG_RETIRED_REASON_REQUIRED,
      },
    ]);
  });

  // Case 8: product pilot (no constraints apply; shipping_criteria rules do
  // NOT apply to products even if the input object happened to contain them)
  it("returns no issues for a pilot product with no optional fields", () => {
    const input: FrontmatterCrossFieldInput = {
      kind: "product",
      status: "pilot",
    };
    expect(checkFrontmatterCrossField(input)).toEqual([]);
  });

  // Guard-rail: rules 1 and 2 must NEVER fire for kind === "product",
  // even when the caller accidentally passes a shipping_criteria shape.
  // This protects against a future regression where someone widens the
  // predicate's behavior without a spec decision.
  it("never applies rule 1 or rule 2 to kind === 'product'", () => {
    const productShipping: FrontmatterCrossFieldInput = {
      kind: "product",
      status: "shipping",
      // No shipping_criteria — rule 1 would fire for a carrier, not a product.
    };
    expect(checkFrontmatterCrossField(productShipping)).toEqual([]);

    const productWithRatesNA: FrontmatterCrossFieldInput = {
      kind: "product",
      status: "pilot",
      shipping_criteria: {
        rates_not_applicable: true,
        // No reason — rule 2 would fire for a carrier, not a product.
      },
    };
    expect(checkFrontmatterCrossField(productWithRatesNA)).toEqual([]);
  });
});

describe("predicates/frontmatterCrossField — purity and determinism", () => {
  // The predicate is pure and side-effect-free per the shared contract.
  // Calling it twice on the same input yields identical results and does
  // not mutate the input.
  it("is pure and does not mutate its input", () => {
    const input: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "shipping",
      shipping_criteria: {
        rates_not_applicable: true,
        // missing reason → rule 2 fires
      },
    };
    const snapshot = JSON.stringify(input);
    const a = checkFrontmatterCrossField(input);
    const b = checkFrontmatterCrossField(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  // Issues are returned in a stable order: rule 1, rule 2, rule 3. This
  // matters because downstream zod output to users is sorted by emission
  // order.
  it("emits issues in a stable order when multiple rules fire", () => {
    // Contrive an input that triggers all three carrier rules simultaneously
    // is impossible (rule 1 requires status==='shipping' and absent
    // shipping_criteria; rule 2 requires shipping_criteria to be present).
    // So test rule 1 + rule 3 co-firing (shipping without criteria AND
    // status retired is impossible; shipping and retired are mutually
    // exclusive statuses). We instead verify rule 2 + rule 3:
    const input: FrontmatterCrossFieldInput = {
      kind: "carrier",
      status: "retired",
      shipping_criteria: {
        rates_not_applicable: true,
        // missing reason → rule 2 fires
      },
      // missing retired_reason → rule 3 fires
    };
    const issues = checkFrontmatterCrossField(input);
    expect(issues.map((i) => i.path.join("."))).toEqual([
      "shipping_criteria.rates_not_applicable_reason",
      "retired_reason",
    ]);
  });
});
