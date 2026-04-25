// Index Modeler math — extracted from calculatorMath.ts into its own module
// so that the INDEX_DATA import stays inside the lazy-loaded modeler chunk
// (T1 bundle isolation).
//
// No math changes. Functions copied verbatim from calculatorMath.ts and the
// SPA engine.js (original names: iQ, aP, rQ). The three functions that were
// the only consumers of INDEX_DATA have been relocated here without
// modification; the `export` keyword on creditedReturn was in the original
// calculatorMath.ts and is preserved.

import type {
  StrategyConfig,
  YearResult,
  IndexDefinition,
} from "./types";
import { INDEX_DATA } from "./indexData";

// ─── Index Modeler math ──────────────────────────────────────────────
// FIA index crediting formula: applies participation, spread, cap, and floor.
// Original name: iQ
export function creditedReturn(
  rawReturn: number,
  cap: number,
  spread: number,
  participation: number,
  floor: number
): number {
  let credited = rawReturn * (participation / 100);
  credited = credited - spread;
  if (cap > 0) credited = Math.min(credited, cap);
  return Math.max(credited, floor);
}

// Compute year-by-year results for a strategy config.
// Original name: aP
export function computeStrategyResults(
  config: StrategyConfig,
  years: number[]
): YearResult[] {
  const indexDef = INDEX_DATA[config.indexKey] as IndexDefinition | undefined;
  if (!indexDef) return [];

  return years.map((year) => {
    const raw = indexDef.returns[year];
    if (raw === undefined) return { year, raw: null, credited: null };
    const credited = creditedReturn(
      raw,
      config.cap,
      config.spread,
      config.participation,
      config.floor
    );
    return { year, raw, credited };
  });
}

// Get the common year range across one or more indexes (last 12 years).
// Original name: rQ
export function getYearRange(indexKeys: string[]): number[] {
  const yearSet = new Set<number>();
  indexKeys.forEach((key) => {
    const def = INDEX_DATA[key];
    if (def) {
      Object.keys(def.returns).forEach((y) => yearSet.add(Number(y)));
    }
  });
  return Array.from(yearSet)
    .sort((a, b) => a - b)
    .slice(-12);
}
