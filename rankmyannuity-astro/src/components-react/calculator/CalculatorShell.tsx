// CalculatorShell — entry component mounted as a React island from
// src/pages/calculator.astro via <CalculatorShell client:visible />.
//
// This file is based line-for-line on rankmyannuity/src/src/pages/Calculator.tsx
// at commit 5544c73 (main). Per T4, exactly TWO deliberate deviations from the
// SPA source:
//
//   1. File renamed Calculator.tsx → CalculatorShell.tsx to avoid collision
//      with Astro's calculator.astro page file.
//   2. IndexModeler imported via React.lazy + <Suspense> boundary so the
//      modeler tab — and its recharts + indexData.ts + indexHistory.ts
//      dependency closure — ships as a separate chunk and does NOT load
//      until the user clicks into the Index Modeler tab (T1 bundle
//      isolation).
//
// Every other line — interstitial modal copy, tab-bar markup, tab state,
// global window callbacks, disclaimer bar, Tailwind classnames — is
// preserved verbatim from the SPA source.

import { useState, useEffect, lazy, Suspense } from "react";
import { ChartColumn, TrendingUp } from "lucide-react";
import { IncomeCalculator } from "./IncomeCalculator";

// DEVIATION #2 from SPA: IndexModeler is lazy-loaded. In the SPA this is:
//   import { IndexModeler } from "../lib/calculator/IndexModeler";
const IndexModeler = lazy(() =>
  import("./IndexModeler").then((m) => ({ default: m.IndexModeler })),
);

type Tab = "income" | "index";

// ─── Interstitial modal ─────────────────────────────────────────────
function InterstitialModal({ onAccept, onCancel }: { onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 sm:p-8 flex flex-col gap-4 shadow-2xl">
        <h2
          className="text-lg font-bold text-foreground"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          Before you view results
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          These results are educational illustrations based on current product
          terms and user-selected assumptions. They do not predict actual future
          credited interest and are not a recommendation.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            I understand
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-md border border-border text-muted-foreground text-sm hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalculatorShell() {
  const [tab, setTab] = useState<Tab>("income");
  // In-memory only — resets on page reload, not stored in localStorage
  const [acknowledged, setAcknowledged] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Show the modal on first interaction with the calculator
  useEffect(() => {
    if (!acknowledged) {
      setShowModal(true);
    }
  }, []);

  // Allow cross-component tab switching via global callback
  useEffect(() => {
    (window as any).__switchToIncome = () => setTab("income");
    (window as any).__switchToIndex = () => setTab("index");
    return () => {
      delete (window as any).__switchToIncome;
      delete (window as any).__switchToIndex;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Interstitial modal */}
      {showModal && !acknowledged && (
        <InterstitialModal
          onAccept={() => {
            setAcknowledged(true);
            setShowModal(false);
          }}
          onCancel={() => {
            setShowModal(false);
            // Allow them to dismiss but still show the page
            setAcknowledged(true);
          }}
        />
      )}

      {/* Educational disclaimer bar */}
      <div className="bg-amber-500/5 border-b border-amber-500/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-amber-400 font-semibold">Educational tool only.</span>{" "}
            Results are hypothetical and not personalized advice. Actual credited
            interest depends on contract terms, carrier resets, and future index
            behavior.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 py-2">
          <button
            onClick={() => setTab("income")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "income"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <TrendingUp size={16} />
            Income / IRR
          </button>
          <button
            onClick={() => setTab("index")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "index"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <ChartColumn size={16} />
            Index Modeler
          </button>
        </div>
      </div>

      {/* Active tab */}
      {tab === "income" ? (
        <IncomeCalculator onSwitchToIndex={() => setTab("index")} />
      ) : (
        <Suspense
          fallback={
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 text-sm text-muted-foreground">
              Loading Index Modeler…
            </div>
          }
        >
          <IndexModeler />
        </Suspense>
      )}
    </div>
  );
}
