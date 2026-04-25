// Public entry point for benchmark rates.
//
// Prior to Phase 4, this file held hardcoded values. It now re-exports
// from benchmarks.generated.ts, which is produced by the Phase 4 data
// pipeline (see data-pipeline/publish/emit-data.ts). Do not hand-edit
// the generated file; changes are overwritten on every `npm run
// publish-data`.
//
// Shape is preserved exactly: `{ label, rate, source }[]`. All existing
// imports (e.g. calculatorMath.ts, IncomeCalculator.tsx) continue to
// work unchanged.

export { benchmarkRates } from "./benchmarks.generated";
export type { BenchmarkRate } from "./benchmarks.generated";
