// Calculator type definitions
// Extracted from engine.js and converted to TypeScript

/** A single FIA index definition with historical returns */
export interface IndexDefinition {
  label: string;
  shortLabel: string;
  category: IndexCategory;
  backtested: boolean;
  liveDate?: string; // e.g. "April 2011", "Jan 2021"
  issuer: string;
  note: string;
  returns: Record<number, number>; // year → annual return %
}

/** Derived history metadata for an index */
export interface IndexHistoryMeta {
  hasTenYearHistory: boolean;
  requiresUserAssumption: boolean;
  liveHistoryYears: number;
  liveHistoryMonths: number;
  historyLabel: string;
  historyWarning: string;
  inceptionDate: string | null;
  dataAsOf: string;
  sourceLabel: string;
}

/** Index category groupings */
export type IndexCategory =
  | "broad_equity"
  | "intl_equity"
  | "volatility_controlled"
  | "multi_asset"
  | "sector"
  | "bond"
  | "alternative";

/** Category display labels */
export const CATEGORY_LABELS: Record<IndexCategory, string> = {
  broad_equity: "Broad Equity",
  intl_equity: "International Equity",
  volatility_controlled: "Volatility Controlled",
  multi_asset: "Multi-Asset / Proprietary",
  sector: "Sector / Thematic",
  bond: "Bond / Fixed Income / Alt",
  alternative: "Alternative",
};

/** User inputs for the IRR / income calculator */
export interface IncomeCalcInputs {
  premium: number;
  deferralYears: number;
  monthlyPayout: number;
  payoutYears: number;
}

/** Result from the IRR solver */
export interface IncomeCalcResult {
  impliedRate: number | null;
  impliedRatePct: string;
  grade: string;
  gradeClass: string;
  gradeLabel: string;
  benchmarkComparison: string;
  error: string | null;
}

/** Grade tier for display */
export interface GradeTier {
  grade: string;
  range: string;
  desc: string;
}

/** Letter grade from the grading function */
export interface GradeResult {
  grade: string;
  gradeClass: string;
  gradeLabel: string;
}

/** Index strategy configuration for the modeler */
export interface StrategyConfig {
  indexKey: string;
  creditMethod: "cap" | "spread" | "participation";
  cap: number;
  spread: number;
  participation: number;
  floor: number;
}

/** One year of modeler results */
export interface YearResult {
  year: number;
  raw: number | null;
  credited: number | null;
}

/** Benchmark rate entry */
export interface BenchmarkRate {
  label: string;
  rate: number;
  source: string;
  // [Phase 5] Liveness status. Absent/undefined is treated as "live"
  // to keep legacy test fixtures backward-compatible.
  status?: "live" | "pilot_empty" | "degraded";
}

/** Grading scale */
export const GRADE_SCALE: GradeTier[] = [
  { grade: "A+", range: "≥ 8.00%", desc: "Exceptional" },
  { grade: "A", range: "6.00 – 7.99%", desc: "Strong" },
  { grade: "B", range: "4.00 – 5.99%", desc: "Fair" },
  { grade: "C", range: "2.00 – 3.99%", desc: "Below avg" },
  { grade: "F", range: "< 2.00%", desc: "Poor" },
];
