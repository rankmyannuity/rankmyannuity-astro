// Calculator math — IRR solver, NPV, grading, formatting
// Extracted from engine.js functions: $c, u_, h_, m_, gf
// Pure functions with no React or DOM dependencies.

import type {
  IncomeCalcInputs,
  IncomeCalcResult,
  GradeResult,
} from "./types";
import { benchmarkRates } from "../../data/benchmarks";
// NOTE (T1 bundle isolation): creditedReturn, computeStrategyResults, and
// getYearRange were moved to ./indexModelerMath.ts so that INDEX_DATA is
// reachable only through the lazy IndexModeler chunk. Function bodies were
// copied verbatim; no math changed. Consumers that need these helpers must
// import directly from ./indexModelerMath — IndexModeler.tsx already does.

// ─── IRR core math ───────────────────────────────────────────────────
// Present value of an annuity-due stream discounted at annual rate `rate`,
// compounded `compPerYear` times per year, paying `pmt` per period for
// `payYears` years, deferred by `deferYears`.
// Original name: $c
function annuityPV(
  rate: number,
  compPerYear: number,
  payYears: number,
  deferYears: number,
  pmt: number
): number {
  if (rate < 1e-10) return pmt * payYears * compPerYear;
  const periodicRate = rate / compPerYear;
  const annuityFactor =
    (1 - Math.pow(1 + periodicRate, -payYears * compPerYear)) / periodicRate;
  const deferralDiscount = Math.pow(
    1 + periodicRate,
    -deferYears * compPerYear
  );
  return pmt * annuityFactor * deferralDiscount;
}

// Newton-Raphson solver for the implied annual rate.
// Original name: u_
export function solveIRR(inputs: IncomeCalcInputs): number | null {
  const { premium, deferralYears, monthlyPayout, payoutYears } = inputs;
  const compPerYear = 12;

  if (premium <= 0 || monthlyPayout <= 0 || payoutYears <= 0) return null;

  // Initial guess: positive if total payout > premium, else negative
  let rate =
    monthlyPayout * payoutYears * 12 > premium ? 0.04 : -0.01;

  const maxIter = 500;
  const tolerance = 1e-8;

  for (let iter = 0; iter < maxIter; iter++) {
    const fVal =
      annuityPV(rate, compPerYear, payoutYears, deferralYears, monthlyPayout) -
      premium;

    // Numerical derivative (central difference)
    const h = 1e-6;
    const derivative =
      (annuityPV(
        rate + h,
        compPerYear,
        payoutYears,
        deferralYears,
        monthlyPayout
      ) -
        annuityPV(
          rate - h,
          compPerYear,
          payoutYears,
          deferralYears,
          monthlyPayout
        )) /
      (2 * h);

    if (Math.abs(derivative) < 1e-15) break;

    let nextRate = rate - fVal / derivative;
    // Clamp to reasonable bounds
    if (nextRate < -0.5) nextRate = -0.5;
    else if (nextRate > 5) nextRate = 5;
    rate = nextRate;

    if (Math.abs(fVal) < tolerance) break;
  }

  // Verify the solution converged
  const check = annuityPV(
    rate,
    compPerYear,
    payoutYears,
    deferralYears,
    monthlyPayout
  );
  if (Math.abs(check - premium) / premium > 0.01) return null;

  return rate;
}

// ─── Grading ─────────────────────────────────────────────────────────
// Original name: h_
export function gradeRate(rate: number): GradeResult {
  if (rate >= 0.08)
    return {
      grade: "A+",
      gradeClass: "grade-aplus",
      gradeLabel: "Exceptional — top of market",
    };
  if (rate >= 0.06)
    return {
      grade: "A",
      gradeClass: "grade-a",
      gradeLabel: "Strong — beats most benchmarks",
    };
  if (rate >= 0.04)
    return {
      grade: "B",
      gradeClass: "grade-b",
      gradeLabel: "Fair — competitive with CDs/Treasuries",
    };
  if (rate >= 0.02)
    return {
      grade: "C",
      gradeClass: "grade-c",
      gradeLabel: "Below average — shop around",
    };
  return {
    grade: "F",
    gradeClass: "grade-f",
    gradeLabel: "Poor — likely a bad deal",
  };
}

// ─── Full result builder ─────────────────────────────────────────────
// Original name: m_
export function calculateResult(inputs: IncomeCalcInputs): IncomeCalcResult {
  const { premium, monthlyPayout, payoutYears } = inputs;

  const emptyResult = (error: string): IncomeCalcResult => ({
    impliedRate: null,
    impliedRatePct: "—",
    grade: "N/A",
    gradeClass: "",
    gradeLabel: "",
    benchmarkComparison: "",
    error,
  });

  if (!premium || !monthlyPayout || !payoutYears)
    return emptyResult("Please fill in all required fields.");

  if (premium < 100) return emptyResult("Premium must be at least $100.");

  const rate = solveIRR(inputs);
  if (rate === null)
    return emptyResult("Could not solve for a rate. Check your inputs.");

  const { grade, gradeClass, gradeLabel } = gradeRate(rate);
  const impliedRatePct = (rate * 100).toFixed(2) + "%";

  const topMyga = benchmarkRates[0].rate;
  const diff = rate - topMyga;
  const benchmarkComparison =
    diff >= 0
      ? `${(diff * 100).toFixed(2)}% above top MYGA rate (${(topMyga * 100).toFixed(2)}%)`
      : `${(Math.abs(diff) * 100).toFixed(2)}% below top MYGA rate (${(topMyga * 100).toFixed(2)}%)`;

  return {
    impliedRate: rate,
    impliedRatePct,
    grade,
    gradeClass,
    gradeLabel,
    benchmarkComparison,
    error: null,
  };
}

// ─── Formatting ──────────────────────────────────────────────────────
// Original name: gf
export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

// Index Modeler math (creditedReturn, computeStrategyResults, getYearRange)
// lives in ./indexModelerMath.ts — see the top-of-file re-export. This was
// the only way to keep INDEX_DATA out of the CalculatorShell/IncomeCalculator
// initial chunk while preserving the SPA's public API. No math changed.
