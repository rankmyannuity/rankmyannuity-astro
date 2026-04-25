// [Phase 5] Unit tests for data-pipeline/helpers/*.
//
// Covers:
//   - mdxSha256: exact-bytes hashing; whitespace-sensitive; throws on missing file.
//   - qualifyingFiveYearMygaRate: predicate + filter + any.
//   - reviewersYaml: read missing/empty/populated; active_at window semantics;
//     schema rejection of invalid shape; duplicate-id rejection.

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { mdxSha256 } from "../helpers/mdxSha256.ts";
import {
  isQualifyingFiveYearMygaRate,
  qualifyingFiveYearMygaRates,
  hasQualifyingFiveYearMygaRate,
} from "../helpers/qualifyingFiveYearMygaRate.ts";
import {
  readReviewersYaml,
  activeAt,
  type Reviewer,
} from "../helpers/reviewersYaml.ts";
import { readSiteYaml } from "../helpers/siteYaml.ts";
import {
  readShippingYaml,
  findShippingApproval,
} from "../helpers/shippingYaml.ts";
import type { MygaRate } from "../schemas/rate.ts";

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "helpers-test-"));
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

// -------------------------------------------------------------------------
// mdxSha256
// -------------------------------------------------------------------------

describe("mdxSha256", () => {
  it("hashes exact file bytes", () => {
    const content = "# Title\n\nBody.\n";
    const path = tmpFile("a.mdx", content);
    const expected = createHash("sha256").update(content).digest("hex");
    expect(mdxSha256(path)).toBe(expected);
  });

  it("is whitespace-sensitive — a trailing newline changes the hash", () => {
    const a = tmpFile("a.mdx", "hello");
    const b = tmpFile("b.mdx", "hello\n");
    expect(mdxSha256(a)).not.toBe(mdxSha256(b));
  });

  it("throws on missing file", () => {
    expect(() => mdxSha256("/nonexistent/path/does-not-exist.mdx")).toThrow();
  });
});

// -------------------------------------------------------------------------
// qualifyingFiveYearMygaRate
// -------------------------------------------------------------------------

function mkRate(partial: Partial<MygaRate>): MygaRate {
  return {
    carrier_slug: "athene",
    product_slug: "athene-maxrate",
    // [Phase 5.0d] Product-variant + observed_at fields.
    product_variant: "Athene MaxRate",
    product_variant_slug: "athene-maxrate",
    term_years: 5,
    rate: 0.055,
    premium_band_min: 100000,
    premium_band_max: 499999,
    effective_date: "2026-04-15",
    observed_at: "2026-04-15",
    source_name: "test",
    source_url: null,
    ...partial,
  };
}

describe("qualifyingFiveYearMygaRate", () => {
  it("accepts a 5-year rate with rate > 0", () => {
    expect(isQualifyingFiveYearMygaRate(mkRate({}))).toBe(true);
  });

  it("rejects non-5-year rates", () => {
    expect(isQualifyingFiveYearMygaRate(mkRate({ term_years: 4 }))).toBe(false);
    expect(isQualifyingFiveYearMygaRate(mkRate({ term_years: 7 }))).toBe(false);
  });

  it("rejects rate === 0 (zero is not a real rate)", () => {
    expect(isQualifyingFiveYearMygaRate(mkRate({ rate: 0 }))).toBe(false);
  });

  it("filter + has operate consistently", () => {
    const list = [
      mkRate({ term_years: 3 }),
      mkRate({ term_years: 5, rate: 0.055 }),
      mkRate({ term_years: 5, rate: 0 }),
      mkRate({ term_years: 5, rate: 0.06 }),
    ];
    const qualifying = qualifyingFiveYearMygaRates(list);
    expect(qualifying).toHaveLength(2);
    expect(hasQualifyingFiveYearMygaRate(list)).toBe(true);
    expect(hasQualifyingFiveYearMygaRate([])).toBe(false);
    expect(
      hasQualifyingFiveYearMygaRate([mkRate({ term_years: 5, rate: 0 })]),
    ).toBe(false);
  });
});

// -------------------------------------------------------------------------
// reviewersYaml
// -------------------------------------------------------------------------

describe("reviewersYaml", () => {
  it("returns empty list for missing file", () => {
    const result = readReviewersYaml("/nonexistent/reviewers.yml");
    expect(result.reviewers).toEqual([]);
  });

  it("treats empty YAML document as empty reviewer list", () => {
    const path = tmpFile("reviewers.yml", "");
    expect(readReviewersYaml(path).reviewers).toEqual([]);
  });

  it("reads a populated file", () => {
    const yaml = `reviewers:
  - id: alice
    name: Alice Example
    active_from: "2026-04-22"
    active_until: null
    notes: Head of Compliance
`;
    const path = tmpFile("reviewers.yml", yaml);
    const parsed = readReviewersYaml(path);
    expect(parsed.reviewers).toHaveLength(1);
    expect(parsed.reviewers[0].id).toBe("alice");
    expect(parsed.reviewers[0].active_until).toBe(null);
  });

  it("rejects malformed ids", () => {
    const yaml = `reviewers:
  - id: "Alice Example"
    name: Alice
    active_from: "2026-04-22"
    active_until: null
`;
    const path = tmpFile("reviewers.yml", yaml);
    expect(() => readReviewersYaml(path)).toThrow(/kebab-case|id/i);
  });

  it("rejects duplicate reviewer ids", () => {
    const yaml = `reviewers:
  - id: alice
    name: Alice One
    active_from: "2026-01-01"
    active_until: null
  - id: alice
    name: Alice Two
    active_from: "2026-02-01"
    active_until: null
`;
    const path = tmpFile("reviewers.yml", yaml);
    expect(() => readReviewersYaml(path)).toThrow(/duplicate/i);
  });

  it("rejects active_until before active_from", () => {
    const yaml = `reviewers:
  - id: alice
    name: Alice
    active_from: "2026-04-22"
    active_until: "2026-04-01"
`;
    const path = tmpFile("reviewers.yml", yaml);
    expect(() => readReviewersYaml(path)).toThrow(/active_until/i);
  });

  describe("activeAt", () => {
    const reviewers: Reviewer[] = [
      {
        id: "alice",
        name: "Alice",
        active_from: "2026-04-01",
        active_until: "2026-04-30",
      },
      {
        id: "bob",
        name: "Bob",
        active_from: "2026-04-15",
        active_until: null,
      },
      {
        id: "carol",
        name: "Carol",
        active_from: "2026-05-01",
        active_until: null,
      },
    ];

    it("returns only reviewers whose window covers the date (inclusive)", () => {
      const ids = activeAt(reviewers, "2026-04-20").map((r) => r.id);
      expect(ids.sort()).toEqual(["alice", "bob"]);
    });

    it("treats active_from inclusively", () => {
      const ids = activeAt(reviewers, "2026-04-01").map((r) => r.id);
      expect(ids).toEqual(["alice"]);
    });

    it("treats active_until inclusively", () => {
      const ids = activeAt(reviewers, "2026-04-30").map((r) => r.id);
      expect(ids.sort()).toEqual(["alice", "bob"]);
    });

    it("excludes reviewers whose window has closed", () => {
      const ids = activeAt(reviewers, "2026-05-05").map((r) => r.id);
      expect(ids.sort()).toEqual(["bob", "carol"]);
    });

    it("excludes reviewers whose window has not yet opened", () => {
      const ids = activeAt(reviewers, "2026-03-15").map((r) => r.id);
      expect(ids).toEqual([]);
    });

    it("accepts the file-wrapper shape too", () => {
      const ids = activeAt({ reviewers }, "2026-04-20").map((r) => r.id);
      expect(ids.sort()).toEqual(["alice", "bob"]);
    });

    it("rejects malformed iso date", () => {
      expect(() => activeAt(reviewers, "04/20/2026")).toThrow(/YYYY-MM-DD/);
    });
  });
});

// -------------------------------------------------------------------------
// siteYaml
// -------------------------------------------------------------------------

describe("siteYaml", () => {
  it("reads a valid site.yml", () => {
    const path = tmpFile("site.yml", "top_myga_public: false\n");
    expect(readSiteYaml(path).top_myga_public).toBe(false);
  });

  it("reads top_myga_public: true", () => {
    const path = tmpFile("site.yml", "top_myga_public: true\n");
    expect(readSiteYaml(path).top_myga_public).toBe(true);
  });

  it("throws on missing file (site.yml is required)", () => {
    expect(() => readSiteYaml("/nonexistent/site.yml")).toThrow(/site\.yml/);
  });

  it("rejects unknown keys", () => {
    const path = tmpFile(
      "site.yml",
      "top_myga_public: false\nunknown_flag: true\n",
    );
    expect(() => readSiteYaml(path)).toThrow();
  });

  it("rejects non-boolean top_myga_public", () => {
    const path = tmpFile("site.yml", "top_myga_public: \"yes\"\n");
    expect(() => readSiteYaml(path)).toThrow();
  });
});

// -------------------------------------------------------------------------
// shippingYaml
// -------------------------------------------------------------------------

describe("shippingYaml", () => {
  const validSha = "a".repeat(64);

  it("returns empty list for missing file", () => {
    expect(readShippingYaml("/nonexistent/carriers.shipping.yml").approvals).toEqual([]);
  });

  it("treats empty YAML as empty approvals", () => {
    const path = tmpFile("carriers.shipping.yml", "");
    expect(readShippingYaml(path).approvals).toEqual([]);
  });

  it("reads a populated approval", () => {
    const yaml = `approvals:
  - carrier_slug: athene
    mdx_path: src/content/reviews/athene.mdx
    mdx_sha256: "${validSha}"
    approved_by: alice
    approved_at: "2026-04-22"
`;
    const path = tmpFile("carriers.shipping.yml", yaml);
    const f = readShippingYaml(path);
    expect(f.approvals).toHaveLength(1);
    expect(f.approvals[0].carrier_slug).toBe("athene");
    expect(f.approvals[0].mdx_sha256).toBe(validSha);
  });

  it("rejects non-hex sha256", () => {
    const yaml = `approvals:
  - carrier_slug: athene
    mdx_path: x.mdx
    mdx_sha256: "notahash"
    approved_by: alice
    approved_at: "2026-04-22"
`;
    const path = tmpFile("carriers.shipping.yml", yaml);
    expect(() => readShippingYaml(path)).toThrow(/sha256|hex/i);
  });

  it("rejects duplicate carrier_slug", () => {
    const yaml = `approvals:
  - carrier_slug: athene
    mdx_path: x.mdx
    mdx_sha256: "${validSha}"
    approved_by: alice
    approved_at: "2026-04-22"
  - carrier_slug: athene
    mdx_path: y.mdx
    mdx_sha256: "${"b".repeat(64)}"
    approved_by: bob
    approved_at: "2026-04-23"
`;
    const path = tmpFile("carriers.shipping.yml", yaml);
    expect(() => readShippingYaml(path)).toThrow(/duplicate/i);
  });

  it("findShippingApproval returns match or undefined", () => {
    const approvals = [
      {
        carrier_slug: "athene",
        mdx_path: "x.mdx",
        mdx_sha256: validSha,
        approved_by: "alice",
        approved_at: "2026-04-22",
      },
    ];
    expect(findShippingApproval(approvals, "athene")?.approved_by).toBe("alice");
    expect(findShippingApproval(approvals, "nonexistent")).toBeUndefined();
  });
});
