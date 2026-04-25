// IndexModeler — FIA index backtester UI
// Updated with compliance/regulatory UX: hypothetical labels, short-history handling,
// guaranteed-floor-first ordering, and educational disclaimers.

import { useState, useMemo, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
// PATH DIVERGENCE NOTE: SPA paths rewritten for Astro src/components-react/
// → src/lib/calculator/ layout. No logic change.
import { INDEX_DATA } from "../../lib/calculator/indexData";
import { CATEGORY_LABELS } from "../../lib/calculator/types";
import type { StrategyConfig, IndexCategory } from "../../lib/calculator/types";
// T1 bundle isolation: these helpers live in indexModelerMath.ts (separate
// file from calculatorMath.ts) specifically so that INDEX_DATA is pulled in
// only through this lazy chunk.
import {
  computeStrategyResults,
  getYearRange,
} from "../../lib/calculator/indexModelerMath";
import { getIndexHistoryMeta, getLiveYears } from "../../lib/calculator/indexHistory";

// ─── Callout box component ──────────────────────────────────────────
function Callout({
  title,
  children,
  variant = "info",
}: {
  title?: string;
  children: React.ReactNode;
  variant?: "info" | "warning" | "caution";
}) {
  const styles = {
    info: "border-blue-500/30 bg-blue-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    caution: "border-orange-500/30 bg-orange-500/5",
  };
  const iconColor = {
    info: "text-blue-400",
    warning: "text-amber-400",
    caution: "text-orange-400",
  };

  return (
    <div
      className={`rounded-lg border ${styles[variant]} px-4 py-3 flex gap-3 items-start`}
    >
      <svg
        className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconColor[variant]}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        {title && (
          <span className="text-sm font-semibold text-foreground">
            {title}
          </span>
        )}
        <div className="text-xs text-muted-foreground leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Index picker dropdown ───────────────────────────────────────────
function IndexPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return Object.entries(INDEX_DATA).filter(
      ([, def]) =>
        def.label.toLowerCase().includes(q) ||
        def.shortLabel.toLowerCase().includes(q) ||
        def.issuer.toLowerCase().includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const g: Record<string, { key: string; def: (typeof INDEX_DATA)[string] }[]> = {};
    filtered.forEach(([key, def]) => {
      if (!g[def.category]) g[def.category] = [];
      g[def.category].push({ key, def });
    });
    return g;
  }, [filtered]);

  useEffect(() => {
    function handleClick(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = INDEX_DATA[value];

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        className="w-full flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setSearch("");
        }}
      >
        <span className="truncate">
          {current?.shortLabel ?? "Select index…"}
        </span>
        <svg
          className="h-4 w-4 ml-2 text-muted-foreground flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-[100] mt-1 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          {/* Search */}
          <div className="px-2 py-2 border-b border-border bg-card">
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-2 py-1">
              <svg
                className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                autoFocus
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                placeholder="Search indexes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Grouped list */}
          <div className="max-h-72 overflow-y-auto bg-card">
            {(Object.entries(CATEGORY_LABELS) as [IndexCategory, string][]).map(
              ([cat, label]) => {
                const items = grouped[cat];
                if (!items || items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 sticky top-0">
                      {label}
                    </div>
                    {items.map(({ key, def }) => {
                      const meta = getIndexHistoryMeta(def);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2 ${
                            key === value
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground"
                          }`}
                          onClick={() => {
                            onChange(key);
                            setOpen(false);
                            setSearch("");
                          }}
                        >
                          <span className="truncate">{def.shortLabel}</span>
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            {def.backtested && (
                              <span className="text-[10px] text-amber-500 font-medium">
                                BT
                              </span>
                            )}
                            {meta.requiresUserAssumption && (
                              <span className="text-[10px] text-orange-400 font-medium">
                                &lt;10yr
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              }
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No indexes match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground bg-card">
            {Object.keys(INDEX_DATA).length} indexes total · BT = backtested
            history · &lt;10yr = limited live history
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Strategy config panel ───────────────────────────────────────────
function StrategyPanel({
  config,
  onChange,
  label,
  color,
}: {
  config: StrategyConfig;
  onChange: (c: StrategyConfig) => void;
  label: string;
  color: string;
}) {
  const indexDef = INDEX_DATA[config.indexKey];
  const meta = indexDef ? getIndexHistoryMeta(indexDef) : null;

  return (
    <div
      className={`border-l-4 ${color} bg-muted/10 border border-border rounded-xl p-4 flex flex-col gap-3`}
    >
      <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Index
        </label>
        <IndexPicker
          value={config.indexKey}
          onChange={(key) => onChange({ ...config, indexKey: key })}
        />
      </div>

      {/* Credit method tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["cap", "spread", "participation"] as const).map((method) => (
          <button
            key={method}
            type="button"
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              config.creditMethod === method
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => onChange({ ...config, creditMethod: method })}
          >
            {method === "cap"
              ? "Cap Rate"
              : method === "spread"
                ? "Spread"
                : "Participation"}
          </button>
        ))}
      </div>

      {/* Parameter inputs */}
      <div className="grid grid-cols-2 gap-2">
        {config.creditMethod === "cap" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Cap % (0 = uncapped)
            </label>
            <input
              type="number"
              min={0}
              step={0.25}
              value={config.cap}
              onChange={(e) =>
                onChange({ ...config, cap: parseFloat(e.target.value) || 0 })
              }
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full"
            />
          </div>
        )}
        {config.creditMethod === "spread" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Spread %</label>
            <input
              type="number"
              min={0}
              step={0.25}
              value={config.spread}
              onChange={(e) =>
                onChange({
                  ...config,
                  spread: parseFloat(e.target.value) || 0,
                })
              }
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full"
            />
          </div>
        )}
        {config.creditMethod === "participation" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Participation %
            </label>
            <input
              type="number"
              min={0}
              step={5}
              value={config.participation}
              onChange={(e) =>
                onChange({
                  ...config,
                  participation: parseFloat(e.target.value) || 100,
                })
              }
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full"
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Floor %</label>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={config.floor}
            onChange={(e) =>
              onChange({ ...config, floor: parseFloat(e.target.value) || 0 })
            }
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full"
          />
        </div>
      </div>

      {/* Index info */}
      {indexDef && (
        <div className="rounded-md bg-muted/20 border border-border px-2.5 py-1.5 flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold text-foreground">
            {indexDef.issuer}
          </div>
          {indexDef.backtested && indexDef.liveDate && (
            <div className="text-[10px]">
              <span className="text-orange-400 font-semibold">Backtested</span>
              <span className="text-muted-foreground"> · Live since </span>
              <span className="text-foreground font-semibold">
                {indexDef.liveDate}
              </span>
            </div>
          )}
          {meta && (
            <div className="text-[10px] text-muted-foreground">
              {meta.historyLabel}
              {meta.liveHistoryYears > 0 &&
                ` (${meta.liveHistoryYears} yr${meta.liveHistoryYears !== 1 ? "s" : ""})`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Short-history assumption panel ──────────────────────────────────
function AssumptionPanel({
  assumption,
  onChange,
}: {
  assumption: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Callout title="Limited history" variant="warning">
        This index has less than 10 years of live history. RankMyAnnuity shows
        the available live-history facts below, but does not create its own
        historical-style illustration for this index. To explore how the
        crediting formula works, choose your own annual assumption.
      </Callout>

      <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
        <label className="text-xs font-semibold text-foreground">
          Your assumed annual underlying index return
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={-10}
            max={20}
            step={0.5}
            value={assumption}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={-10}
              max={20}
              step={0.5}
              value={assumption}
              onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
              className="w-20 bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          This user-selected assumption is for educational scenario modeling
          only.
        </p>
        {assumption === 6 && (
          <p className="text-[10px] text-muted-foreground/60 italic">
            Default neutral assumption (editable)
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Live-history facts panel ────────────────────────────────────────
function LiveHistoryFacts({
  indexKey,
}: {
  indexKey: string;
}) {
  const def = INDEX_DATA[indexKey];
  if (!def) return null;
  const meta = getIndexHistoryMeta(def);
  const liveYears = getLiveYears(def);

  if (liveYears.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-semibold text-foreground mb-2">
          Available live-history facts
        </div>
        <p className="text-xs text-muted-foreground">
          No live-period data is available for this index.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="text-xs font-semibold text-foreground">
        Available live-history facts
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {meta.inceptionDate && (
          <div>
            <span className="text-muted-foreground">Inception date: </span>
            <span className="text-foreground font-medium">
              {meta.inceptionDate}
            </span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Live history: </span>
          <span className="text-foreground font-medium">
            {meta.liveHistoryYears} year{meta.liveHistoryYears !== 1 ? "s" : ""}
            {meta.liveHistoryMonths % 12 > 0 &&
              `, ${meta.liveHistoryMonths % 12} mo`}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Observed live period: </span>
          <span className="text-foreground font-medium">
            {liveYears[0]}–{liveYears[liveYears.length - 1]}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Data as of: </span>
          <span className="text-foreground font-medium">{meta.dataAsOf}</span>
        </div>
      </div>

      {/* Live-year returns */}
      {liveYears.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {liveYears.map((yr) => {
            const ret = def.returns[yr];
            return (
              <div
                key={yr}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-border ${
                  ret >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {yr}: {ret >= 0 ? "+" : ""}
                {ret.toFixed(1)}%
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 italic mt-1">
        Limited live history can make outcomes appear better or worse than a
        longer market cycle would suggest.
      </p>
    </div>
  );
}

// ─── Dollar formatter for chart axis / tooltip ───────────────────────
function fmtDollar(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

// ─── Main component ──────────────────────────────────────────────────
export function IndexModeler() {
  const [compare, setCompare] = useState(false);
  const [assumptionA, setAssumptionA] = useState(6);
  const [assumptionB, setAssumptionB] = useState(6);

  const [stratA, setStratA] = useState<StrategyConfig>({
    indexKey: "sp500_price",
    creditMethod: "cap",
    cap: 10,
    spread: 0,
    participation: 100,
    floor: 0,
  });

  const [stratB, setStratB] = useState<StrategyConfig>({
    indexKey: "bloomberg_dynamic_ii",
    creditMethod: "participation",
    cap: 0,
    spread: 0,
    participation: 135,
    floor: 0,
  });

  // History metadata
  const metaA = useMemo(
    () => (INDEX_DATA[stratA.indexKey] ? getIndexHistoryMeta(INDEX_DATA[stratA.indexKey]) : null),
    [stratA.indexKey]
  );
  const metaB = useMemo(
    () => (INDEX_DATA[stratB.indexKey] ? getIndexHistoryMeta(INDEX_DATA[stratB.indexKey]) : null),
    [stratB.indexKey]
  );

  const shortHistoryA = metaA?.requiresUserAssumption ?? false;
  const shortHistoryB = metaB?.requiresUserAssumption ?? false;

  const yearRange = useMemo(
    () =>
      getYearRange(compare ? [stratA.indexKey, stratB.indexKey] : [stratA.indexKey]),
    [compare, stratA.indexKey, stratB.indexKey]
  );

  const resultsA = useMemo(
    () => computeStrategyResults(stratA, yearRange),
    [stratA, yearRange]
  );
  const resultsB = useMemo(
    () => computeStrategyResults(stratB, yearRange),
    [stratB, yearRange]
  );

  // Guaranteed floor result for Strategy A
  const guaranteedFloorA = stratA.floor;
  const guaranteedFloorB = stratB.floor;

  // Averages
  const avgCreditedA = useMemo(() => {
    const vals = resultsA.filter((r) => r.credited !== null).map((r) => r.credited!);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }, [resultsA]);

  const avgRawA = useMemo(() => {
    const vals = resultsA.filter((r) => r.raw !== null).map((r) => r.raw!);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }, [resultsA]);

  const avgCreditedB = useMemo(() => {
    const vals = resultsB.filter((r) => r.credited !== null).map((r) => r.credited!);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }, [resultsB]);

  const avgRawB = useMemo(() => {
    const vals = resultsB.filter((r) => r.raw !== null).map((r) => r.raw!);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }, [resultsB]);

  // Assumption-based credited return for short-history indices
  const assumptionCreditedA = useMemo(() => {
    if (!shortHistoryA) return null;
    const { cap, spread, participation, floor } = stratA;
    let credited = assumptionA * (participation / 100);
    credited = credited - spread;
    if (cap > 0) credited = Math.min(credited, cap);
    return Math.max(credited, floor);
  }, [shortHistoryA, assumptionA, stratA]);

  const assumptionCreditedB = useMemo(() => {
    if (!shortHistoryB) return null;
    const { cap, spread, participation, floor } = stratB;
    let credited = assumptionB * (participation / 100);
    credited = credited - spread;
    if (cap > 0) credited = Math.min(credited, cap);
    return Math.max(credited, floor);
  }, [shortHistoryB, assumptionB, stratB]);

  const leader = avgCreditedA >= avgCreditedB ? "Strategy A" : "Strategy B";
  const bestAvg = Math.max(avgCreditedA, avgCreditedB);
  const worstAvg = Math.min(avgCreditedA, avgCreditedB);
  const leaderColor =
    avgCreditedA >= avgCreditedB ? "text-blue-400" : "text-teal-400";

  // Growth chart data
  const chartData = useMemo(() => {
    const rows: Record<string, string | number>[] = [];
    let aIdx = 1e5,
      aCred = 1e5,
      bIdx = 1e5,
      bCred = 1e5;
    const firstYear = yearRange[0] - 1;

    const initial: Record<string, string | number> = { year: String(firstYear) };
    initial["A Index"] = 1e5;
    initial["A Credited"] = 1e5;
    if (compare) {
      initial["B Index"] = 1e5;
      initial["B Credited"] = 1e5;
    }
    rows.push(initial);

    for (const yr of yearRange) {
      const a = resultsA.find((r) => r.year === yr);
      const b = resultsB.find((r) => r.year === yr);
      if (a?.raw != null) aIdx *= 1 + a.raw / 100;
      if (a?.credited != null) aCred *= 1 + a.credited / 100;
      if (b?.raw != null) bIdx *= 1 + b.raw / 100;
      if (b?.credited != null) bCred *= 1 + b.credited / 100;

      const row: Record<string, string | number> = { year: String(yr) };
      if (a?.raw != null || a?.credited != null) {
        row["A Index"] = Math.round(aIdx);
        row["A Credited"] = Math.round(aCred);
      }
      if (compare && (b?.raw != null || b?.credited != null)) {
        row["B Index"] = Math.round(bIdx);
        row["B Credited"] = Math.round(bCred);
      }
      rows.push(row);
    }
    return rows;
  }, [yearRange, resultsA, resultsB, compare]);

  const lastRow = chartData[chartData.length - 1];
  const finalACredited = lastRow["A Credited"] as number;
  const finalAIndex = lastRow["A Index"] as number;
  const finalBCredited = compare ? (lastRow["B Credited"] as number) : null;
  const finalBIndex = compare ? (lastRow["B Index"] as number) : null;

  // Show historical data table only for 10+ year indices, or all for non-short
  const showFullHistoricalTable = !shortHistoryA || compare;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-foreground">
          FIA Index Crediting Modeler
        </h2>
        <p className="text-sm text-muted-foreground">
          Model how cap rates, spreads, and participation rates affect credited
          returns across{" "}
          <span className="text-foreground font-semibold">
            {Object.keys(INDEX_DATA).length} indexes
          </span>
          . All outputs are hypothetical scenarios based on contract terms and
          user-selected assumptions.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={() => setCompare(false)}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
            !compare
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Single Index
        </button>
        <button
          type="button"
          onClick={() => setCompare(true)}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
            compare
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Compare Indices
        </button>
      </div>

      {/* Strategy panels + results */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="flex flex-col gap-3 w-full md:w-56 md:flex-shrink-0">
          <StrategyPanel
            config={stratA}
            onChange={setStratA}
            label={compare ? "Strategy A" : "Index Strategy"}
            color="border-blue-500"
          />
          {compare && (
            <StrategyPanel
              config={stratB}
              onChange={setStratB}
              label="Strategy B"
              color="border-teal-500"
            />
          )}
        </div>

        <div className="flex flex-col gap-4 flex-1 min-w-0 w-full">
          {/* ── Guaranteed floor card (FIRST) ── */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-emerald-400">
                Guaranteed floor
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              The contractual downside floor or minimum outcome based on current
              product terms.
            </p>
            <div className="flex gap-4">
              <div>
                <div className="text-xs text-muted-foreground">
                  {compare ? "Strategy A floor" : "Annual floor"}
                </div>
                <div className="text-lg font-bold text-emerald-400">
                  {guaranteedFloorA.toFixed(1)}%
                </div>
              </div>
              {compare && (
                <div>
                  <div className="text-xs text-muted-foreground">
                    Strategy B floor
                  </div>
                  <div className="text-lg font-bold text-emerald-400">
                    {guaranteedFloorB.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Short-history handling for Strategy A ── */}
          {shortHistoryA && !compare && (
            <>
              <Callout title="Use caution with short history" variant="caution">
                This index has a limited live track record. Historical figures
                shown here provide context, but shorter histories can produce a
                misleadingly strong or weak snapshot.
              </Callout>

              <LiveHistoryFacts indexKey={stratA.indexKey} />

              <AssumptionPanel
                assumption={assumptionA}
                onChange={setAssumptionA}
              />

              {/* Assumption-based output */}
              {assumptionCreditedA !== null && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-foreground">
                      Hypothetical credited return
                    </span>
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                      Hypothetical
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    If the underlying index returned{" "}
                    <span className="text-foreground font-medium">
                      {assumptionA}%
                    </span>{" "}
                    annually, the crediting formula would yield:
                  </p>
                  <div className="text-2xl font-bold text-blue-400">
                    {assumptionCreditedA >= 0 ? "+" : ""}
                    {assumptionCreditedA.toFixed(2)}%
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 italic">
                    Hypothetical scenario only. Actual credited interest may be
                    materially higher or lower. Not a guarantee or prediction.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Full historical table (10+ year indices or compare mode) ── */}
          {(!shortHistoryA || compare) && (
            <>
              {/* Historical context caption */}
              <p className="text-[10px] text-muted-foreground italic">
                Historical context only. Past index behavior does not predict
                future credited results.
              </p>

              {/* Summary bar with hypothetical badge */}
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                    Hypothetical
                  </span>
                </div>
                {compare ? (
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${leaderColor}`}>
                        {leader}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        leads with avg hypothetical credited return of
                      </span>
                      <span className={`text-sm font-bold ${leaderColor}`}>
                        {bestAvg.toFixed(2)}%
                      </span>
                      <span className="text-muted-foreground text-sm">vs</span>
                      <span className="text-sm font-semibold text-foreground">
                        {worstAvg.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {yearRange.length} years of data
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {INDEX_DATA[stratA.indexKey]?.shortLabel ?? "Index"}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        avg return
                      </span>
                      <span className="text-sm font-bold text-emerald-400">
                        {avgRawA >= 0 ? "+" : ""}
                        {avgRawA.toFixed(2)}%
                      </span>
                      <span className="text-muted-foreground text-sm">·</span>
                      <span className="text-sm text-muted-foreground">
                        hypothetical credited
                      </span>
                      <span className="text-sm font-bold text-blue-400">
                        {avgCreditedA >= 0 ? "+" : ""}
                        {avgCreditedA.toFixed(2)}%
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          avgCreditedA - avgRawA < 0
                            ? "text-red-400"
                            : "text-emerald-400"
                        }`}
                      >
                        ({avgCreditedA - avgRawA >= 0 ? "+" : ""}
                        {(avgCreditedA - avgRawA).toFixed(2)}%)
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {yearRange.length} years of data
                    </div>
                  </div>
                )}
              </div>

              {/* Data table */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                          Year
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                          {compare ? "A Index" : "Index Return"}
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-blue-400 text-xs uppercase tracking-wider">
                          {compare ? "A Credited" : "Credited"}
                        </th>
                        {compare && (
                          <>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                              B Index
                            </th>
                            <th className="text-right px-3 py-2 font-semibold text-teal-400 text-xs uppercase tracking-wider">
                              B Credited
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {yearRange.map((yr, idx) => {
                        const a = resultsA.find((r) => r.year === yr);
                        const b = resultsB.find((r) => r.year === yr);
                        const aBT =
                          INDEX_DATA[stratA.indexKey]?.backtested &&
                          INDEX_DATA[stratA.indexKey]?.liveDate &&
                          yr <
                            parseInt(
                              INDEX_DATA[stratA.indexKey].liveDate!.match(/\d{4}/)?.[0] ?? "9999"
                            );
                        const bBT =
                          INDEX_DATA[stratB.indexKey]?.backtested &&
                          INDEX_DATA[stratB.indexKey]?.liveDate &&
                          yr <
                            parseInt(
                              INDEX_DATA[stratB.indexKey].liveDate!.match(/\d{4}/)?.[0] ?? "9999"
                            );

                        return (
                          <tr
                            key={yr}
                            className={`border-b border-border/50 ${
                              idx % 2 === 0 ? "bg-background" : "bg-muted/5"
                            }`}
                          >
                            <td className="px-3 py-1.5 text-muted-foreground font-medium">
                              {yr}
                              {aBT && !compare && (
                                <span className="ml-1.5 text-[10px] text-orange-400 font-bold">
                                  BT
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono ${
                                a?.raw == null
                                  ? "text-muted-foreground/40"
                                  : a.raw >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                              }`}
                            >
                              {a?.raw != null ? (
                                <span>
                                  {a.raw >= 0 ? "+" : ""}
                                  {a.raw.toFixed(2)}%
                                  {aBT && compare && (
                                    <span className="ml-1 text-[10px] text-orange-400">
                                      BT
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono font-semibold ${
                                a?.credited == null
                                  ? "text-muted-foreground/40"
                                  : a.credited >= 0
                                    ? "text-blue-400"
                                    : "text-red-400"
                              }`}
                            >
                              {a?.credited != null
                                ? `${a.credited >= 0 ? "+" : ""}${a.credited.toFixed(2)}%`
                                : "—"}
                            </td>
                            {compare && (
                              <>
                                <td
                                  className={`px-3 py-1.5 text-right font-mono ${
                                    b?.raw == null
                                      ? "text-muted-foreground/40"
                                      : b.raw >= 0
                                        ? "text-emerald-400"
                                        : "text-red-400"
                                  }`}
                                >
                                  {b?.raw != null ? (
                                    <span>
                                      {b.raw >= 0 ? "+" : ""}
                                      {b.raw.toFixed(2)}%
                                      {bBT && (
                                        <span className="ml-1 text-[10px] text-orange-400">
                                          BT
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td
                                  className={`px-3 py-1.5 text-right font-mono font-semibold ${
                                    b?.credited == null
                                      ? "text-muted-foreground/40"
                                      : b.credited >= 0
                                        ? "text-teal-400"
                                        : "text-red-400"
                                  }`}
                                >
                                  {b?.credited != null
                                    ? `${b.credited >= 0 ? "+" : ""}${b.credited.toFixed(2)}%`
                                    : "—"}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30 border-t-2 border-border">
                        <td className="px-3 py-2 font-bold text-foreground text-xs uppercase tracking-wider">
                          Avg
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono font-semibold text-sm ${
                            avgRawA >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {avgRawA >= 0 ? "+" : ""}
                          {avgRawA.toFixed(2)}%
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono font-bold text-sm ${
                            avgCreditedA >= 0 ? "text-blue-400" : "text-red-400"
                          }`}
                        >
                          {avgCreditedA >= 0 ? "+" : ""}
                          {avgCreditedA.toFixed(2)}%
                          <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                            ({avgCreditedA >= avgRawA ? "+" : ""}
                            {(avgCreditedA - avgRawA).toFixed(2)}%)
                          </span>
                        </td>
                        {compare && (
                          <>
                            <td
                              className={`px-3 py-2 text-right font-mono font-semibold text-sm ${
                                avgRawB >= 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {avgRawB >= 0 ? "+" : ""}
                              {avgRawB.toFixed(2)}%
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-bold text-sm ${
                                avgCreditedB >= 0
                                  ? "text-teal-400"
                                  : "text-red-400"
                              }`}
                            >
                              {avgCreditedB >= 0 ? "+" : ""}
                              {avgCreditedB.toFixed(2)}%
                              <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                                ({avgCreditedB >= avgRawB ? "+" : ""}
                                {(avgCreditedB - avgRawB).toFixed(2)}%)
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Hypothetical footer */}
              <p className="text-[10px] text-muted-foreground italic">
                Hypothetical scenario only. Actual credited interest may be
                materially higher or lower. Not a guarantee or prediction.
              </p>
            </>
          )}

          {/* Growth chart — only for 10+ year or compare */}
          {(!shortHistoryA || compare) && (
            <div className="rounded-xl border border-border bg-muted/5 px-4 pt-4 pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      $100,000 Hypothetical Growth
                    </span>
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                      Hypothetical
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Assumption-based output over the displayed period
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground">
                      {compare ? "A Index" : "Index Return"}
                    </span>
                    <span className="font-bold text-emerald-400">
                      {fmtDollar(finalAIndex)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground">
                      {compare ? "A Credited" : "Credited"}
                    </span>
                    <span className="font-bold text-blue-400">
                      {fmtDollar(finalACredited)}
                    </span>
                  </div>
                  {compare && finalBIndex != null && finalBCredited != null && (
                    <>
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground">B Index</span>
                        <span className="font-bold" style={{ color: "#2dd4bf" }}>
                          {fmtDollar(finalBIndex)}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground">B Credited</span>
                        <span className="font-bold" style={{ color: "#818cf8" }}>
                          {fmtDollar(finalBCredited)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={chartData}
                  margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                  />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtDollar}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      fmtDollar(value),
                      name,
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(222 47% 11%)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{
                      color: "#e2e8f0",
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                    itemStyle={{ color: "#cbd5e1" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Line
                    type="monotone"
                    dataKey="A Index"
                    stroke="#34d399"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 3"
                    name={compare ? "A Index" : "Index Return"}
                  />
                  <Line
                    type="monotone"
                    dataKey="A Credited"
                    stroke="#60a5fa"
                    strokeWidth={2.5}
                    dot={false}
                    name={compare ? "A Credited" : "Credited"}
                  />
                  {compare && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="B Index"
                        stroke="#2dd4bf"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 3"
                        name="B Index"
                      />
                      <Line
                        type="monotone"
                        dataKey="B Credited"
                        stroke="#818cf8"
                        strokeWidth={2.5}
                        dot={false}
                        name="B Credited"
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* CTA for Income Calculator */}
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground mb-1">
            Want to evaluate an income annuity offer?
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The Income / IRR Calculator solves for the implied rate of
            return on any immediate or deferred income annuity — and grades it
            against current MYGAs, Treasuries, and CDs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            (window as any).__switchToIncome?.();
          }}
          className="shrink-0 px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
        >
          Try Income Calculator →
        </button>
      </div>

      {/* Non-affiliation + Disclaimer */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-muted/10 border border-border px-3 py-2 text-xs text-muted-foreground leading-relaxed">
          <span className="text-orange-400 font-semibold">
            Backtested data (BT):
          </span>{" "}
          Index returns prior to the live date are hypothetical/simulated and do
          not represent actual index performance. Excess Return (ER) indexes
          subtract a financing rate (SOFR/LIBOR) from gross returns, which
          significantly reduces stated returns vs. total return versions —
          especially in rising rate environments. These calculations illustrate
          crediting mechanics only; actual annuity credited interest depends on
          additional policy charges, surrender schedules, and carrier-specific
          terms. Past performance does not guarantee future results.
        </div>

        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          RankMyAnnuity.pro is independent and is not sponsored, endorsed, sold,
          or promoted by the index provider or insurer unless expressly stated.
        </p>
      </div>
    </div>
  );
}
