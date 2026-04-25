// IncomeCalculator — IRR solver UI
// Extracted from engine.js dQ component and rewritten as clean TSX.

import { useState } from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
// PATH DIVERGENCE NOTE: In the SPA this file lives at src/lib/calculator/
// so benchmarks is ../../data/benchmarks and calculator math is ./calculatorMath.
// In the Astro project this file lives at src/components-react/calculator/
// and calculator math/types live at src/lib/calculator/, so the relative
// paths change. No logic change.
import { benchmarkRates } from "../../data/benchmarks";
import { calculateResult, formatUSD } from "../../lib/calculator/calculatorMath";
import type { IncomeCalcResult, BenchmarkRate } from "../../lib/calculator/types";
import { GRADE_SCALE } from "../../lib/calculator/types";
// [Phase 5] Shared liveness utilities — keep the calculator island in
// sync with the Astro pages (rates.astro, reviews/[...slug].astro) so
// the em-dash + chip invariant is identical across every surface.
import {
  BENCHMARK_CHIP_LABEL,
  BENCHMARK_VALUE_TESTID,
  NOT_LIVE_CHIP_TESTID,
  benchmarkValueString,
  isBenchmarkNotLive,
  type BenchmarkStatus,
} from "../../lib/ui/liveness";

// ─── Reusable input field ────────────────────────────────────────────
function CalcInput({
  label,
  id,
  value,
  onChange,
  prefix,
  suffix,
  min,
  step,
  tooltip,
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
  tooltip?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        {label}
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground cursor-help">
                  <Info size={14} />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs bg-popover text-popover-foreground border border-border rounded-md px-3 py-1.5 shadow-md z-50">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </label>
      <div className="flex items-center border border-input rounded-md bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
        {prefix && (
          <span className="px-3 py-2.5 bg-secondary text-muted-foreground text-sm border-r border-input select-none">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          min={min}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "0"}
          className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          data-testid={`input-${id}`}
        />
        {suffix && (
          <span className="px-3 py-2.5 bg-secondary text-muted-foreground text-sm border-l border-input select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Benchmark rate bar ──────────────────────────────────────────────
//
// [Phase 5] When `status !== "live"` the value column renders an em-dash
// and an inline "Not live" chip — never "0.00%". The Beats/Below badge
// and the impliedRate overlay are both suppressed because a comparison
// against a not-live benchmark is meaningless. This matches the
// em-dash invariant in PHASE5_SPEC.md §3 and mirrors the treatment in
// rates.astro and reviews/[...slug].astro.
function BenchmarkBar({
  label,
  rate,
  impliedRate,
  source,
  status = "live",
}: {
  label: string;
  rate: number;
  impliedRate: number | null;
  source: string;
  status?: BenchmarkStatus;
}) {
  const notLive = isBenchmarkNotLive(status);
  const valueString = benchmarkValueString(status, rate);
  const maxRate = 0.12;
  const barWidth = notLive ? 0 : Math.min((rate / maxRate) * 100, 100);
  const impliedWidth =
    !notLive && impliedRate !== null
      ? Math.min(Math.max(impliedRate, 0) / maxRate * 100, 100)
      : 0;
  const beats = !notLive && impliedRate !== null && impliedRate >= rate;

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">({source})</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium text-foreground"
            data-testid={BENCHMARK_VALUE_TESTID}
          >
            {valueString}
          </span>
          {notLive && status !== "live" && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 border border-amber-300"
              data-testid={NOT_LIVE_CHIP_TESTID}
              role="status"
              aria-label={BENCHMARK_CHIP_LABEL[status]}
            >
              {BENCHMARK_CHIP_LABEL[status]}
            </span>
          )}
          {!notLive && impliedRate !== null && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                beats
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {beats ? "Beats" : "Below"}
            </span>
          )}
        </div>
      </div>
      <div className="benchmark-bar">
        <div
          className="benchmark-bar-fill bg-muted-foreground/30"
          style={{ width: `${barWidth}%` }}
        />
        {!notLive && impliedRate !== null && (
          <div
            className={`absolute top-0 h-full rounded-full transition-all duration-700 ${
              beats
                ? "bg-green-500 dark:bg-green-400"
                : "bg-destructive"
            }`}
            style={{ width: `${impliedWidth}%`, opacity: 0.7 }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Result card ─────────────────────────────────────────────────────
function ResultCard({ result }: { result: IncomeCalcResult }) {
  if (result.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        {result.error}
      </div>
    );
  }
  if (result.grade === "N/A") return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Hypothetical result card */}
      <div
        className="result-animate rounded-xl border border-border bg-card p-6 sm:p-8 flex flex-col items-center text-center gap-4"
        data-testid="card-result"
      >
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
            Your Implied Rate of Return
          </p>
          <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
            Hypothetical
          </span>
        </div>
        <div
          className={`grade-display ${result.gradeClass}`}
          data-testid="text-grade"
        >
          {result.grade}
        </div>
        <div
          className="text-3xl font-semibold text-foreground"
          data-testid="text-implied-rate"
        >
          {result.impliedRatePct}
        </div>
        <p className="text-sm text-muted-foreground max-w-xs">
          {result.gradeLabel}
        </p>
        <div className="w-full border-t border-border pt-4 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {result.benchmarkComparison}
          </p>
        </div>
      </div>

      {/* Grade explanation */}
      <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed">
        This grade reflects our published methodology across contract features,
        costs, flexibility, and index-related confidence factors. It is not a
        recommendation.
      </p>

      {/* Hypothetical footer */}
      <p className="text-[10px] text-muted-foreground italic text-center">
        Hypothetical scenario only. Actual credited interest may be materially
        higher or lower. Not a guarantee or prediction.
      </p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────
export function IncomeCalculator({
  onSwitchToIndex,
}: {
  onSwitchToIndex: () => void;
}) {
  const [premium, setPremium] = useState("");
  const [deferral, setDeferral] = useState("0");
  const [payout, setPayout] = useState("");
  const [years, setYears] = useState("");
  const [result, setResult] = useState<IncomeCalcResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  function handleCalculate() {
    const res = calculateResult({
      premium: parseFloat(premium),
      deferralYears: parseFloat(deferral) || 0,
      monthlyPayout: parseFloat(payout),
      payoutYears: parseFloat(years),
    });
    setResult(res);
    setShowResult(true);
  }

  function handleReset() {
    setPremium("");
    setDeferral("0");
    setPayout("");
    setYears("");
    setResult(null);
    setShowResult(false);
  }

  const premiumNum = parseFloat(premium) || 0;
  const payoutNum = parseFloat(payout) || 0;
  const yearsNum = parseFloat(years) || 0;
  const totalPayout = payoutNum * yearsNum * 12;

  const examples = [
    {
      label: "Typical SPIA",
      premium: "100000",
      deferral: "0",
      payout: "560",
      years: "20",
      note: "Avg market",
    },
    {
      label: "Good MYGA-like",
      premium: "100000",
      deferral: "5",
      payout: "800",
      years: "20",
      note: "Strong offer",
    },
    {
      label: "Poor offer",
      premium: "100000",
      deferral: "0",
      payout: "400",
      years: "20",
      note: "Below market",
    },
  ];

  return (
    <TooltipProvider>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: "clamp(1.8rem, 4vw, 2.5rem)",
            }}
            className="text-foreground mb-2"
          >
            Annuity Grade Calculator
          </h1>
          <p className="text-muted-foreground">
            Enter your annuity terms to calculate the true implied rate of
            return and see how it stacks up.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left column — inputs */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
              <h2 className="font-semibold text-foreground mb-5">
                Your Annuity Terms
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <CalcInput
                  label="Premium (lump sum paid)"
                  id="premium"
                  value={premium}
                  onChange={setPremium}
                  prefix="$"
                  min={0}
                  step={1000}
                  placeholder="100000"
                  tooltip="The total amount you pay upfront to the insurance company."
                />
                <CalcInput
                  label="Deferral Period"
                  id="deferral-years"
                  value={deferral}
                  onChange={setDeferral}
                  suffix="years"
                  min={0}
                  step={1}
                  placeholder="0"
                  tooltip="Years before payouts begin. Enter 0 for an immediate annuity."
                />
                <CalcInput
                  label="Monthly Payout"
                  id="monthly-payout"
                  value={payout}
                  onChange={setPayout}
                  prefix="$"
                  min={0}
                  step={100}
                  placeholder="600"
                  tooltip="The monthly income you'll receive during the payout phase."
                />
                <CalcInput
                  label="Payout Duration"
                  id="payout-years"
                  value={years}
                  onChange={setYears}
                  suffix="years"
                  min={1}
                  step={1}
                  placeholder="20"
                  tooltip="Number of years the monthly payout lasts. Use life expectancy or contract term."
                />
              </div>

              {/* Live summary */}
              {premiumNum > 0 && payoutNum > 0 && yearsNum > 0 && (
                <div className="rounded-md bg-secondary/50 border border-border p-4 mb-6 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">
                      Premium paid
                    </div>
                    <div className="font-medium text-foreground">
                      {formatUSD(premiumNum)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">
                      Total payout
                    </div>
                    <div className="font-medium text-foreground">
                      {formatUSD(totalPayout)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">
                      Nominal return
                    </div>
                    <div
                      className={`font-medium ${
                        totalPayout >= premiumNum
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {totalPayout >= premiumNum ? "+" : ""}
                      {formatUSD(totalPayout - premiumNum)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">
                      Simple payout ratio
                    </div>
                    <div className="font-medium text-foreground">
                      {premiumNum > 0
                        ? ((totalPayout / premiumNum) * 100).toFixed(1)
                        : "—"}
                      %
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCalculate}
                  disabled={!premium || !payout || !years}
                  className="flex-1 py-3 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="button-calculate"
                >
                  Calculate Grade
                </button>
                {showResult && (
                  <button
                    onClick={handleReset}
                    className="px-4 py-3 rounded-md border border-border text-muted-foreground text-sm hover:bg-secondary transition-colors"
                    data-testid="button-reset"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Examples */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4 text-sm">
                Try an Example
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {examples.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => {
                      setPremium(ex.premium);
                      setDeferral(ex.deferral);
                      setPayout(ex.payout);
                      setYears(ex.years);
                      setResult(null);
                      setShowResult(false);
                    }}
                    className="text-left p-3 rounded-md border border-border hover:bg-secondary transition-colors"
                    data-testid={`button-example-${ex.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="text-sm font-medium text-foreground">
                      {ex.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {ex.note}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${Number(ex.payout).toLocaleString()}/mo × {ex.years} yrs
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right column — results & benchmarks */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {showResult && result ? (
              <ResultCard result={result} />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]">
                <div
                  style={{
                    fontFamily: "'DM Serif Display', Georgia, serif",
                    fontSize: "clamp(3rem, 8vw, 5rem)",
                  }}
                  className="text-muted-foreground/20"
                >
                  ?
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter your annuity terms and hit Calculate
                </p>
              </div>
            )}

            {/* Benchmarks */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-1 text-sm">
                Market Benchmarks
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                How your implied rate compares
              </p>
              <div>
                {benchmarkRates.map((b: BenchmarkRate) => (
                  <BenchmarkBar
                    key={b.label}
                    label={b.label}
                    rate={b.rate}
                    source={b.source}
                    status={b.status ?? "live"}
                    impliedRate={result?.impliedRate ?? null}
                  />
                ))}
              </div>
            </div>

            {/* Grading scale */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4 text-sm">
                Grading Scale
              </h3>
              <div className="flex flex-col gap-2">
                {GRADE_SCALE.map((g) => (
                  <div
                    key={g.grade}
                    className="flex items-center justify-between text-sm"
                  >
                    <div
                      className={`font-semibold w-8 grade-${g.grade.toLowerCase().replace("+", "plus")}`}
                    >
                      {g.grade}
                    </div>
                    <div className="text-muted-foreground flex-1 ml-2">
                      {g.range}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {g.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA for Index calculator */}
        <div className="mt-8 rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground mb-1">
              Considering a Fixed Indexed Annuity instead?
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The Index Performance Calculator lets you model how cap rates,
              spreads, and participation rates have historically affected
              credited returns across 64 FIA indexes — with a side-by-side
              comparison and $100K growth chart.
            </p>
          </div>
          <button
            onClick={onSwitchToIndex}
            className="shrink-0 px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Try Index Calculator →
          </button>
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-xs text-muted-foreground max-w-2xl">
          This tool calculates the implied annual rate of return using the
          deferred annuity present value formula solved via Newton-Raphson
          iteration. It assumes fixed monthly payments over a finite term.
          Results are hypothetical estimates for educational comparison
          purposes only and do not constitute personalized financial advice.
        </p>
      </div>
    </TooltipProvider>
  );
}
