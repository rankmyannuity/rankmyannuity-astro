// [Phase 5.0d · Decision 1 — Option B] Unit tests for isFreshFiveYearMygaRate.
//
// Scope (user-ratified, verbatim): "qualifying+fresh, qualifying+stale,
// non-qualifying regardless of freshness, boundary exactly at window
// edge both sides, purity guard".
//
// The shape-only predicates (isQualifyingFiveYearMygaRate /
// qualifyingFiveYearMygaRates / hasQualifyingFiveYearMygaRate) already
// have their own test module (predicates-myga.test.ts). This file
// exercises the *composition* predicate only, and imports the named
// freshness constant so drift between normalize and tests is
// impossible: if MYGA_RATE_FRESHNESS_WINDOW_DAYS changes, both sides
// move together.

import { describe, it, expect } from "vitest";

import {
  isFreshFiveYearMygaRate,
  MYGA_RATE_FRESHNESS_WINDOW_DAYS,
} from "../predicates/myga.ts";
import type { MygaRate } from "../schemas/rate.ts";

function mkRate(partial: Partial<MygaRate>): MygaRate {
  return {
    carrier_slug: "new-york-life",
    product_slug: "new-york-life-secure-term-myga",
    product_variant: "Secure Term MVA II",
    product_variant_slug: "secure-term-mva-ii",
    term_years: 5,
    rate: 0.046,
    premium_band_min: 100000,
    premium_band_max: 1499999,
    effective_date: "2026-04-27",
    observed_at: "2026-04-22",
    source_name: "test",
    source_url: "https://www.nylannuities.com/resources/rates",
    ...partial,
  };
}

describe("predicates/myga — MYGA_RATE_FRESHNESS_WINDOW_DAYS", () => {
  // Fixture-pin: the user ratified 7 days. If this assertion fires, the
  // constant has changed — every call site (normalize, UI chip copy,
  // PHASE5D_CHECKLIST.md) must also be updated in the same PR.
  it("is exactly 7 (user-ratified freshness window)", () => {
    expect(MYGA_RATE_FRESHNESS_WINDOW_DAYS).toBe(7);
  });
});

describe("predicates/myga — isFreshFiveYearMygaRate (5.0d)", () => {
  // ─── qualifying + fresh ────────────────────────────────────────────────
  it("returns true for a qualifying 5-yr rate observed today", () => {
    const rate = mkRate({ observed_at: "2026-04-22" });
    const now = new Date("2026-04-22T12:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(true);
  });

  it("returns true for a qualifying rate observed 3 days ago (well inside window)", () => {
    const rate = mkRate({ observed_at: "2026-04-19" });
    const now = new Date("2026-04-22T00:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(true);
  });

  // ─── qualifying + stale ────────────────────────────────────────────────
  it("returns false for a qualifying rate observed 8 days ago (strictly past window)", () => {
    const rate = mkRate({ observed_at: "2026-04-14" });
    const now = new Date("2026-04-22T00:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(false);
  });

  it("returns false for a qualifying rate observed 30 days ago (well past window)", () => {
    const rate = mkRate({ observed_at: "2026-03-23" });
    const now = new Date("2026-04-22T00:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(false);
  });

  // ─── non-qualifying regardless of freshness ────────────────────────────
  // The composition must short-circuit on shape. A perfectly-fresh
  // observation of a non-5-year or rate===0 entry is still not fresh
  // for the purpose of the top_myga_5yr benchmark — it's not a real
  // 5-year MYGA rate at all.
  it("returns false for a non-5-year rate even when observed today", () => {
    const rate = mkRate({ term_years: 7, observed_at: "2026-04-22" });
    const now = new Date("2026-04-22T12:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(false);
  });

  it("returns false for a 5-year rate with rate === 0 even when observed today", () => {
    const rate = mkRate({ rate: 0, observed_at: "2026-04-22" });
    const now = new Date("2026-04-22T12:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(false);
  });

  it("returns false for a non-qualifying rate that is ALSO stale", () => {
    // Belt-and-suspenders: the shape check should fail first, but if
    // the implementation ever reordered the checks, this combination
    // would still return false.
    const rate = mkRate({ term_years: 10, observed_at: "2026-01-01" });
    const now = new Date("2026-04-22T00:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(false);
  });

  // ─── boundary exactly at window edge, both sides ───────────────────────
  // Contract: an observation exactly `windowDays` old is fresh
  // (inclusive upper bound); `windowDays + epsilon` is stale.
  it("treats exactly 7 days old as fresh (inclusive at the window boundary)", () => {
    // observed_at midnight UTC + 7 days at midnight UTC = 7 days exactly.
    const rate = mkRate({ observed_at: "2026-04-15" });
    const now = new Date("2026-04-22T00:00:00.000Z");
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(true);
  });

  it("treats more than 7 days old (even by a fraction of a day) as stale", () => {
    // 7 days + 1ms past the boundary. The predicate compares in days
    // via floating-point division, so the smallest reliable "past"
    // fixture is the next-day tick; here we use +1 day to be clearly
    // outside the window.
    const rate = mkRate({ observed_at: "2026-04-15" });
    const now = new Date("2026-04-22T00:00:00.001Z");
    // Fractional overshoot: strictly greater than 7 days → stale.
    expect(isFreshFiveYearMygaRate(rate, now, MYGA_RATE_FRESHNESS_WINDOW_DAYS)).toBe(false);
  });

  it("accepts an ISO-string `now` equivalent to the Date form", () => {
    const rate = mkRate({ observed_at: "2026-04-19" });
    const dateForm = new Date("2026-04-22T00:00:00.000Z");
    const stringForm = "2026-04-22T00:00:00.000Z";
    expect(isFreshFiveYearMygaRate(rate, dateForm, 7)).toBe(
      isFreshFiveYearMygaRate(rate, stringForm, 7),
    );
  });

  // ─── purity guard ──────────────────────────────────────────────────────
  it("does not mutate its inputs (rate, now Date)", () => {
    const rate = mkRate({ observed_at: "2026-04-19" });
    const rateSnapshot = JSON.stringify(rate);
    const now = new Date("2026-04-22T00:00:00.000Z");
    const nowSnapshot = now.toISOString();
    expect(isFreshFiveYearMygaRate(rate, now, 7)).toBe(true);
    expect(isFreshFiveYearMygaRate(rate, now, 7)).toBe(true);
    expect(JSON.stringify(rate)).toBe(rateSnapshot);
    expect(now.toISOString()).toBe(nowSnapshot);
  });
});
