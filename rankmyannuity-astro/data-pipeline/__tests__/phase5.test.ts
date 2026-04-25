// [Phase 5] Coverage for the 0.5.0 gates that don't already live in
// schemas.test.ts / helpers.test.ts / diff.test.ts. Groups:
//
//   1. applyShippingSha256Downgrade     — sha mismatch / missing / absent
//   2. frozenTimeGate                   — proceed / refuse / warn paths
//   3. wallClockRegressionGate          — refuse / first-run carve-out / proceed
//   4. Liveness UI invariants            — em-dash, chip labels, page header,
//                                          noindex meta tags, single testid
//   5. Benchmark legacy-array plumbing   — status is carried end-to-end
//                                          from BenchmarkSnapshot into the
//                                          legacyBenchmarkRates array shape.
//
// The existing suites (schemas / helpers / diff / idempotency) cover the
// other 5.0a additions (schema status fields, reviewers active_at,
// qualifying-rate predicate, benchmark exclusivity, Manifest shape).

import { describe, it, expect } from "vitest";

import type { MdxCorpus, MdxReviewRecord } from "../adapters/mdx.ts";
import { applyShippingSha256Downgrade } from "../normalize/index.ts";
import type { ShippingApprovalsFile } from "../schemas/shipping.ts";
import {
  frozenTimeGate,
  wallClockRegressionGate,
} from "../cli/publishGates.ts";

import {
  BENCHMARK_CHIP_LABEL,
  BENCHMARK_VALUE_TESTID,
  NOT_LIVE_CHIP_TESTID,
  REVIEW_CHIP_LABEL,
  benchmarkValueString,
  isBenchmarkNotLive,
  isReviewNotLive,
  notLiveMetaTags,
  pageHeaderForReview,
  reviewGradeString,
} from "../../src/lib/ui/liveness.ts";

// ─── Fixture helpers ─────────────────────────────────────────────────

// Build a minimally-populated carrier MDX record. We only care about the
// fields normalize reads: slug, kind, frontmatter.status.
function makeCarrierRecord(
  slug: string,
  status: "pilot" | "shipping" | "retired",
): MdxReviewRecord {
  return {
    slug,
    mdx_path: `reviews/${slug}`,
    kind: "carrier",
    // The discriminated schema is strict, but applyShippingSha256Downgrade
    // only reads `status` off the frontmatter; we intentionally cast so the
    // test can stay focused on the downgrade behavior rather than on
    // re-constructing every required frontmatter field.
    frontmatter: { status } as unknown as MdxReviewRecord["frontmatter"],
    body: "",
    file_sha256: "deadbeef".padEnd(64, "0"),
    file_path: `/tmp/${slug}.mdx`,
  };
}

function makeCorpus(records: MdxReviewRecord[]): MdxCorpus {
  return {
    carriers: records.filter((r) => r.kind === "carrier"),
    products: records.filter((r) => r.kind === "product"),
  };
}

// ─── 1. applyShippingSha256Downgrade ──────────────────────────────────

describe("applyShippingSha256Downgrade", () => {
  it("leaves status='shipping' untouched when sha matches the approval", () => {
    const rec = makeCarrierRecord("acme", "shipping");
    const corpus = makeCorpus([rec]);
    const sha = "a".repeat(64);
    const shipping: ShippingApprovalsFile = {
      approvals: [
        {
          carrier_slug: "acme",
          approved_by: "alice",
          approved_at: "2026-04-22T12:00:00.000Z",
          mdx_sha256: sha,
          notes: "clean promote",
        },
      ],
    };
    const shaLookup = new Map<string, string>([["acme", sha]]);

    const notes = applyShippingSha256Downgrade(corpus, shipping, shaLookup);
    expect((rec.frontmatter as { status: string }).status).toBe("shipping");
    expect(notes).toEqual([]);
  });

  it("downgrades to 'pilot' when sha256 no longer matches the approval", () => {
    const rec = makeCarrierRecord("acme", "shipping");
    const corpus = makeCorpus([rec]);
    const shipping: ShippingApprovalsFile = {
      approvals: [
        {
          carrier_slug: "acme",
          approved_by: "alice",
          approved_at: "2026-04-22T12:00:00.000Z",
          mdx_sha256: "a".repeat(64),
        },
      ],
    };
    const shaLookup = new Map<string, string>([["acme", "b".repeat(64)]]);

    const notes = applyShippingSha256Downgrade(corpus, shipping, shaLookup);
    expect((rec.frontmatter as { status: string }).status).toBe("pilot");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/acme.*sha256.*does not match/i);
    expect(notes[0]).toMatch(/downgraded to.*pilot/i);
  });

  it("downgrades to 'pilot' when no approval entry exists for a shipping carrier", () => {
    const rec = makeCarrierRecord("acme", "shipping");
    const corpus = makeCorpus([rec]);
    const shipping: ShippingApprovalsFile = { approvals: [] };
    const shaLookup = new Map<string, string>([["acme", "c".repeat(64)]]);

    const notes = applyShippingSha256Downgrade(corpus, shipping, shaLookup);
    expect((rec.frontmatter as { status: string }).status).toBe("pilot");
    expect(notes[0]).toMatch(/no matching entry in carriers\.shipping\.yml/i);
  });

  it("downgrades to 'pilot' when current MDX sha cannot be computed", () => {
    const rec = makeCarrierRecord("acme", "shipping");
    const corpus = makeCorpus([rec]);
    const shipping: ShippingApprovalsFile = {
      approvals: [
        {
          carrier_slug: "acme",
          approved_by: "alice",
          approved_at: "2026-04-22T12:00:00.000Z",
          mdx_sha256: "d".repeat(64),
        },
      ],
    };
    // Empty lookup — simulates orchestrator failing to read the file.
    const shaLookup = new Map<string, string>();

    const notes = applyShippingSha256Downgrade(corpus, shipping, shaLookup);
    expect((rec.frontmatter as { status: string }).status).toBe("pilot");
    expect(notes[0]).toMatch(/could not be computed/i);
  });

  it("is a no-op for pilot and retired statuses", () => {
    const pilot = makeCarrierRecord("foo", "pilot");
    const retired = makeCarrierRecord("bar", "retired");
    const corpus = makeCorpus([pilot, retired]);
    const shipping: ShippingApprovalsFile = { approvals: [] };
    const shaLookup = new Map<string, string>();

    const notes = applyShippingSha256Downgrade(corpus, shipping, shaLookup);
    expect((pilot.frontmatter as { status: string }).status).toBe("pilot");
    expect((retired.frontmatter as { status: string }).status).toBe("retired");
    expect(notes).toEqual([]);
  });

  it("returns [] and mutates nothing when shipping or sha lookup is undefined", () => {
    const rec = makeCarrierRecord("acme", "shipping");
    const corpus = makeCorpus([rec]);
    expect(applyShippingSha256Downgrade(corpus, undefined, new Map())).toEqual([]);
    expect(applyShippingSha256Downgrade(corpus, { approvals: [] }, undefined)).toEqual([]);
    expect((rec.frontmatter as { status: string }).status).toBe("shipping");
  });
});

// ─── 2. frozenTimeGate ────────────────────────────────────────────────

describe("frozenTimeGate", () => {
  it("returns 'proceed' when frozen_time is null (regular wall-clock run)", () => {
    expect(
      frozenTimeGate({ frozenTime: null, allowOverride: false }),
    ).toEqual({ action: "proceed" });
    // Override doesn't matter when there's no frozen_time set.
    expect(
      frozenTimeGate({ frozenTime: null, allowOverride: true }),
    ).toEqual({ action: "proceed" });
  });

  it("returns 'refuse' when frozen_time is set and override is absent", () => {
    expect(
      frozenTimeGate({
        frozenTime: "2026-04-21T20:00:00.000Z",
        allowOverride: false,
      }),
    ).toEqual({ action: "refuse" });
  });

  it("returns 'warn' when frozen_time is set AND override is active", () => {
    expect(
      frozenTimeGate({
        frozenTime: "2026-04-21T20:00:00.000Z",
        allowOverride: true,
      }),
    ).toEqual({ action: "warn" });
  });
});

// ─── 3. wallClockRegressionGate ───────────────────────────────────────

describe("wallClockRegressionGate", () => {
  it("first_published_run short-circuits to 'proceed' even with priors present", () => {
    // If first_published_run is true we are by definition on a clean slate;
    // any pre-existing snapshot files (e.g. from a dev experiment) are not
    // authoritative baselines. Carve-out must bypass regardless.
    expect(
      wallClockRegressionGate({
        firstPublishedRun: true,
        currentRunId: "1999-01-01T00:00:00.000Z",
        priorSnapshotFilenames: ["normalized-2099-01-01T00-00-00-000Z.json"],
      }),
    ).toEqual({ action: "proceed" });
  });

  it("returns 'proceed' when no prior snapshots exist", () => {
    expect(
      wallClockRegressionGate({
        firstPublishedRun: false,
        currentRunId: "2026-04-22T15:00:00.000Z",
        priorSnapshotFilenames: [],
      }),
    ).toEqual({ action: "proceed" });
  });

  it("returns 'proceed' when current run_id is strictly after the most recent snapshot", () => {
    expect(
      wallClockRegressionGate({
        firstPublishedRun: false,
        currentRunId: "2026-04-22T15:00:00.000Z",
        priorSnapshotFilenames: [
          "normalized-2026-04-22T12-00-00-000Z.json",
          "normalized-2026-04-21T20-00-00-000Z.json",
        ],
      }),
    ).toEqual({ action: "proceed" });
  });

  it("returns 'refuse' when current run_id equals the most recent snapshot (strict-after)", () => {
    const result = wallClockRegressionGate({
      firstPublishedRun: false,
      currentRunId: "2026-04-22T12:00:00.000Z",
      priorSnapshotFilenames: ["normalized-2026-04-22T12-00-00-000Z.json"],
    });
    expect(result).toEqual({
      action: "refuse",
      priorRunIdSafe: "2026-04-22T12-00-00-000Z",
    });
  });

  it("returns 'refuse' when current run_id is strictly before the most recent snapshot", () => {
    const result = wallClockRegressionGate({
      firstPublishedRun: false,
      currentRunId: "2026-04-20T10:00:00.000Z",
      priorSnapshotFilenames: [
        "normalized-2026-04-22T12-00-00-000Z.json",
        "normalized-2026-04-21T20-00-00-000Z.json",
      ],
    });
    expect(result.action).toBe("refuse");
    if (result.action === "refuse") {
      expect(result.priorRunIdSafe).toBe("2026-04-22T12-00-00-000Z");
    }
  });

  it("treats the current run_id's colons/dots as filesystem-safe for comparison", () => {
    // Ensures the gate normalizes the current run_id to the safe form before
    // comparing — otherwise "2026-04-22T12:00:00.000Z" would lex-compare
    // against "2026-04-22T12-00-00-000Z" across the ':' vs '-' boundary.
    const result = wallClockRegressionGate({
      firstPublishedRun: false,
      currentRunId: "2026-04-22T12:00:00.001Z",
      priorSnapshotFilenames: ["normalized-2026-04-22T12-00-00-000Z.json"],
    });
    expect(result).toEqual({ action: "proceed" });
  });
});

// ─── 4. Liveness UI invariants ────────────────────────────────────────

describe("liveness UI invariants", () => {
  describe("benchmarkValueString", () => {
    it("renders em-dash for pilot_empty regardless of rate", () => {
      expect(benchmarkValueString("pilot_empty", 0)).toBe("—");
      // Even if a non-zero rate leaked in (it can't — schema blocks it —
      // we still guard the UI against rendering a number):
      expect(benchmarkValueString("pilot_empty", 0.06)).toBe("—");
    });

    it("renders em-dash for degraded", () => {
      expect(benchmarkValueString("degraded", 0.0435)).toBe("—");
    });

    it("formats live rates as two-decimal percent", () => {
      expect(benchmarkValueString("live", 0.0435)).toBe("4.35%");
      expect(benchmarkValueString("live", 0.1)).toBe("10.00%");
      expect(benchmarkValueString("live", 0)).toBe("0.00%");
    });

    it("never emits the literal '0.00%' when status !== 'live'", () => {
      // The em-dash invariant is asserted byte-for-byte in PHASE5_SPEC.md §3.
      for (const status of ["pilot_empty", "degraded"] as const) {
        expect(benchmarkValueString(status, 0)).not.toContain("%");
        expect(benchmarkValueString(status, 0)).toBe("—");
      }
    });
  });

  describe("isBenchmarkNotLive", () => {
    it("returns false only for 'live'", () => {
      expect(isBenchmarkNotLive("live")).toBe(false);
      expect(isBenchmarkNotLive("pilot_empty")).toBe(true);
      expect(isBenchmarkNotLive("degraded")).toBe(true);
    });
  });

  describe("BENCHMARK_CHIP_LABEL", () => {
    it("exposes the exact, editorial-approved chip copy", () => {
      // Verbatim asserted so a copy change cannot land silently.
      expect(BENCHMARK_CHIP_LABEL.pilot_empty).toBe("Not live — awaiting data");
      expect(BENCHMARK_CHIP_LABEL.degraded).toBe("Not live — stale fallback");
    });
  });

  describe("REVIEW_CHIP_LABEL", () => {
    it("exposes the exact copy for every review not-live cause", () => {
      expect(REVIEW_CHIP_LABEL.pilot_carrier).toBe(
        "Pilot review — not yet editorially approved",
      );
      expect(REVIEW_CHIP_LABEL.degraded_benchmark).toBe(
        "Not live — benchmark degraded",
      );
      expect(REVIEW_CHIP_LABEL.empty_benchmark).toBe(
        "Not live — benchmark awaiting data",
      );
      expect(REVIEW_CHIP_LABEL.retired_carrier).toBe("Retired carrier");
    });
  });

  describe("isReviewNotLive / reviewGradeString", () => {
    it("isReviewNotLive matches the status predicate", () => {
      expect(isReviewNotLive("live")).toBe(false);
      expect(isReviewNotLive("not_live")).toBe(true);
    });

    it("reviewGradeString renders em-dash when not live OR when letter is null", () => {
      expect(reviewGradeString("not_live", "A+")).toBe("—");
      expect(reviewGradeString("live", null)).toBe("—");
      expect(reviewGradeString("live", "B")).toBe("B");
    });
  });

  describe("pageHeaderForReview", () => {
    it("appends the exact '(not live)' suffix on not-live reviews", () => {
      // Byte-for-byte invariant from PHASE5_SPEC.md §4.
      expect(pageHeaderForReview("Athene Review", "not_live")).toBe(
        "Athene Review (not live)",
      );
    });

    it("returns the base title untouched for live reviews", () => {
      expect(pageHeaderForReview("Athene Review", "live")).toBe(
        "Athene Review",
      );
    });
  });

  describe("notLiveMetaTags", () => {
    it("returns [] for live / no-op statuses", () => {
      expect(notLiveMetaTags("live")).toEqual([]);
    });

    it("emits both robots and googlebot noindex meta tags for every not-live status", () => {
      for (const status of [
        "not_live",
        "pilot_empty",
        "degraded",
      ] as const) {
        const tags = notLiveMetaTags(status);
        expect(tags).toHaveLength(2);
        expect(tags).toContainEqual({
          name: "robots",
          content: "noindex, nofollow",
        });
        expect(tags).toContainEqual({
          name: "googlebot",
          content: "noindex, nofollow",
        });
      }
    });
  });

  describe("structural testid constants", () => {
    it("keeps the single-source benchmark-value testid stable across surfaces", () => {
      // All three surfaces (rates.astro, calculator island, review page)
      // must carry the same data-testid so one vitest assertion can cover
      // the UI invariant uniformly.
      expect(BENCHMARK_VALUE_TESTID).toBe("benchmark-value");
      expect(NOT_LIVE_CHIP_TESTID).toBe("not-live-chip");
    });
  });
});

// ─── 5. legacyBenchmarkRates plumbing ─────────────────────────────────
//
// The `src/data/benchmarks.generated.ts` export shape now carries a
// `status` field. The calculator island reads this to render em-dash +
// chip without having to reload the richer panel JSON.

describe("benchmarks.generated.ts shape", () => {
  it("every legacy entry carries a valid BenchmarkStatus", async () => {
    const mod = await import("../../src/data/benchmarks.generated.ts");
    const rates = mod.benchmarkRates;
    expect(rates.length).toBeGreaterThan(0);
    for (const r of rates) {
      expect(["live", "pilot_empty", "degraded"]).toContain(r.status);
      // UI contract: a pilot_empty entry MUST have rate===0, and any
      // rate===0 entry MUST be marked pilot_empty. This mirrors the
      // schema's .superRefine so a stale generated file is caught here.
      if (r.status === "pilot_empty") {
        expect(r.rate).toBe(0);
      }
      if (r.rate === 0) {
        expect(r.status).toBe("pilot_empty");
      }
    }
  });
});
