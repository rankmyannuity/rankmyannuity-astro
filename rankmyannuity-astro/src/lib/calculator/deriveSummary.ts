// deriveSummary — NEW helper added in the Phase 3 port.
//
// This file is NOT a verbatim port. The SPA's calculatorMath.ts does NOT
// expose totalPayout, nominalReturn, or simplePayoutRatio. Those three
// values are computed inline inside IncomeCalculator.tsx's JSX and
// displayed in the "live summary" card.
//
// Per the user's Phase 3 instruction (Issue 1 CONFIRMED), calculateResult
// is ported verbatim as a 7-field result, and this helper is added as a
// separate, clearly-labeled non-ported module for the sole purpose of
// producing the three summary values that unit-test parity fixtures
// assert on.
//
// The JSX lines this helper mirrors, pasted verbatim from
// rankmyannuity/src/src/lib/calculator/IncomeCalculator.tsx (lines 252-255,
// 375, 389-390, 398-401):
//
//   const premiumNum = parseFloat(premium) || 0;
//   const payoutNum = parseFloat(payout) || 0;
//   const yearsNum = parseFloat(years) || 0;
//   const totalPayout = payoutNum * yearsNum * 12;
//
//   // (line 375) Total payout display:
//   <div className="font-medium text-foreground">
//     {formatUSD(totalPayout)}
//   </div>
//
//   // (lines 389-390) Nominal return display:
//   {totalPayout >= premiumNum ? "+" : ""}
//   {formatUSD(totalPayout - premiumNum)}
//
//   // (lines 398-401) Simple payout ratio display:
//   {premiumNum > 0
//     ? ((totalPayout / premiumNum) * 100).toFixed(1)
//     : "—"}
//   %
//
// Behavior preserved:
//   - parseFloat with `|| 0` fallback
//   - totalPayout = monthlyPayout * payoutYears * 12 (no rounding)
//   - nominalReturn = totalPayout - premium (no rounding; sign preserved)
//   - simplePayoutRatio = (totalPayout / premium) * 100 (no rounding at
//     compute time; UI rounds to 1 dp via .toFixed(1))
//
// The helper returns RAW numbers. Formatting (dollar signs, "+" prefix,
// toFixed(1), "—" fallback) is a separate display concern and is kept
// out of this helper so the numeric parity tests can assert exact numeric
// equality as required by the Phase 3 brief.

import type { IncomeCalcInputs } from "./types";

export interface IncomeSummary {
  /** monthly × years × 12, unrounded. */
  totalPayout: number;
  /** totalPayout − premium, unrounded. Negative when premium > totalPayout. */
  nominalReturn: number;
  /** (totalPayout / premium) × 100, unrounded. Returns NaN if premium ≤ 0. */
  simplePayoutRatio: number;
}

export function deriveSummary(inputs: IncomeCalcInputs): IncomeSummary {
  const { premium, monthlyPayout, payoutYears } = inputs;
  const totalPayout = monthlyPayout * payoutYears * 12;
  const nominalReturn = totalPayout - premium;
  const simplePayoutRatio = premium > 0 ? (totalPayout / premium) * 100 : NaN;
  return { totalPayout, nominalReturn, simplePayoutRatio };
}
