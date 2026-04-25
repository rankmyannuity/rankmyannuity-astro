# Phase 3 — Calculator Port, Deliverables

**Status:** ✅ Complete. All 40 tests pass. T1 bundle isolation verified clean. T2 math invariants preserved (see parity table). T3 token parity and visual checklist below. T4 entry component naming followed with the two documented deviations.

---

## 1. Parity fixture table (T2 — math invariants)

All four hard-assert fixtures (F1, F3, F4, F6) pass at 2dp. F2 passes at 2dp. F5 diverges and is computed+reported per user instruction ("IRR~15" was approximate; obscured label/vs fields were "compute and report"). No math was adjusted.

| Fixture | Inputs | Expected IRR | Ported IRR | Match | Grade | Label | vs Top MYGA (5.90%) | Total payout | Nominal | Ratio |
|---|---|---|---|---|---|---|---|---|---|---|
| **F1** | 100000 / 10 / 1250 / 13 | 4.12% | **4.1160%** | ✅ 2dp | B | Fair — competitive with CDs/Treasuries | 1.78% below top MYGA rate (5.90%) | $195,000 | $95,000 | 195.0% |
| **F2** | 100000 / 10 / 1250 / 25 | 6.33% | **6.3318%** | ✅ 2dp | A | Strong — beats most benchmarks *(computed)* | 0.43% above top MYGA rate (5.90%) *(computed)* | $375,000 | $275,000 | 375.0% |
| **F3** | 50000 / 5 / 1250 / 5 | 5.43% | **5.4291%** | ✅ 2dp | B | Fair — competitive with CDs/Treasuries | 0.47% below top MYGA rate (5.90%) | $75,000 | $25,000 | 150.0% |
| **F4** | 50000 / 5 / 1000 / 5 | 2.43% | **2.4281%** | ✅ 2dp | C | Below average — shop around | 3.47% below top MYGA rate (5.90%) | $60,000 | $10,000 | 120.0% |
| **F5** | 100000 / 10 / 12750 / 13 | ~15.00% *(approx, per fixture)* | **19.7990%** | ⚠ Computed, not asserted | A+ | Exceptional — top of market *(computed)* | 13.90% above top MYGA rate (5.90%) *(computed)* | $1,989,000 | $1,889,000 | 1989.0% |
| **F6** | 100000 / 10 / 750 / 13 | 0.95% | **0.9534%** | ✅ 2dp | F | Poor — likely a bad deal | 4.95% below top MYGA rate (5.90%) | $117,000 | $17,000 | 117.0% |

### F5 divergence analysis

- Fixture stated "IRR~15.00" with tilde; label and vs fields were marked "obscured, compute and report."
- Ported solver returns **19.7990%**.
- Independent algebraic verification: at r = 0.198, present value of the deferred 13-year $12,750/mo stream exactly equals $100,000 (confirmed via second tool — `PV at 19.80%: 100000.00`). At r = 0.15, PV = $196,638 — nowhere near $100k. The 15% estimate was not consistent with the actual cash flows.
- Per Flag 3 (F1/F3/F4/F6 are the hard stop conditions), no math adjustment made. Reporting computed value as instructed.

---

## 2. Test output

```
 RUN  v2.1.9 /home/user/workspace/rankmyannuity-astro

stdout | src/lib/calculator/calculatorMath.test.ts > F5: grade A+
[F5] computed IRR=19.7990%, label="Exceptional — top of market", vs="13.90% above top MYGA rate (5.90%)"

stdout | src/lib/calculator/calculatorMath.test.ts > F2: report computed label + vs
[F2] label="Strong — beats most benchmarks", vs="0.43% above top MYGA rate (5.90%)"

 ✓ src/lib/calculator/calculatorMath.test.ts (31 tests) 23ms
 ✓ src/lib/calculator/deriveSummary.test.ts  (9 tests)  5ms

 Test Files  2 passed (2)
      Tests  40 passed (40)
```

**Test inventory (40 total):**

`calculatorMath.test.ts` (31):
- 5 hard-assert fixtures (F1/F2/F3/F4/F6): IRR 2dp + grade + label + vs
- 1 F5 report-only (grade A+; IRR logged)
- 1 F2 report-only (label + vs logged)
- 10 grade boundary tests (`>=` inclusive at 0.08, 0.06, 0.04, 0.02; strict below at 0.0799, 0.0599, 0.0399, 0.0199; plus 0.0 and −0.01 → F)
- 2 zero-rate branch tests (near-zero positive + zero-net-return clamp behavior)
- 2 negative-IRR regime tests (strongly underwater → null, F6 barely-positive)
- 3 error-branch tests (premium < 100, missing fields, null from solveIRR)
- 3 drift guards (F1 IRR within 0.005, F4 grade=C, F1 ratio=195 exactly)
- 1 formatUSD test
- 3 creditedReturn tests (participation+spread+cap+floor, negative floor, cap=0 skip)

`deriveSummary.test.ts` (9):
- 6 fixture equality tests (totalPayout, nominalReturn, simplePayoutRatio)
- 3 edge cases (premium=0 → NaN ratio, negative nominalReturn, fractional inputs)

---

## 3. T1 bundle isolation — verified clean

Initial chunks that ship with `<CalculatorShell client:visible />`:

| Chunk | Size | Contains `indexData` | `indexHistory` | `recharts` | `Slickcharts` | `S&P Dow Jones` |
|---|---|---|---|---|---|---|
| `CalculatorShell.BB5SZHhW.js` | 66 KB | **0** | **0** | **0** | **0** | **0** |
| `CalculatorShell.D6hXGs4g.js` | 100 B | **0** | **0** | **0** | **0** | **0** |
| `client.ByM5SMZr.js` | 1.8 KB | **0** | **0** | **0** | **0** | **0** |

Lazy chunk loaded only when the user clicks the Index Modeler tab:

| Chunk | Size | Contains `recharts` | `Slickcharts` | `S&P Dow Jones` | `-38.49` (2008 S&P return) |
|---|---|---|---|---|---|
| `IndexModeler.DPw9rXrA.js` | 449 KB | 15 hits ✓ | 1 hit ✓ | 1 hit ✓ | 1 hit ✓ |

Visualizer report written to `dist/_bundle-report.html` (823 KB interactive treemap).

### Architectural note

A T1 violation was detected on first build — `calculatorMath.ts` originally imported `INDEX_DATA` for the `computeStrategyResults`/`getYearRange` helpers, and Vite dragged the whole indexData module into the initial chunk. Fix: those three helpers (`creditedReturn`, `computeStrategyResults`, `getYearRange`) were relocated **verbatim** to a new `src/lib/calculator/indexModelerMath.ts` file. No function bodies changed; only their physical location. `IndexModeler.tsx` was updated to import from the new file. Initial chunk size dropped from 102 KB → 66 KB as a result.

---

## 4. T3 — Tailwind / token parity + visual parity

### Color-token deviation (1 known)

The SPA defines a CSS custom property `--muted` that collides with the one Phase 2 introduced for small supporting text in `global.css`. To avoid overriding Phase 2's design tokens globally, the SPA's muted-color HSL pair was imported under the alias `--muted-hsl` in `global.css`. All calculator components that reference `bg-muted`/`text-muted-foreground` resolve via Tailwind's mapped `muted` / `muted-foreground` entries in `tailwind.config.mjs`, which point at the aliased token. **Runtime color values are byte-identical** to the SPA; only the CSS variable name differs.

### Intentionally preserved: green-blob UI bug

`.grade-display` / `.grade-aplus` / `.grade-a` / `.grade-b` / `.grade-c` / `.grade-f` / `.benchmark-bar` / `.result-animate` are referenced by `IncomeCalculator.tsx` via `className` but **undefined in both** the SPA's `src/index.css` and the deployed `app-DUHA1Zt6.css`. This is the origin of the oversized green letter on A+/A/B grades. Per T3 + DO-NOT-FIX-IN-PHASE-3, these styles remain undefined in the Astro port as well.

### Visual parity screenshots (attached in zip)

| View | Live SPA | Astro port |
|---|---|---|
| Desktop 1280px | `live-calc-desktop.png` | `astro-calc-desktop.png` |
| Mobile 375px | `live-calc-mobile.png` | `astro-calc-mobile.png` |

**Verified identical:** H1, tab bar, form layout + labels + defaults (100000/0/600/20), Calculate Grade CTA, Try an Example 3-card row (Typical SPIA / Good MYGA-like / Poor offer), Market Benchmarks card (5.90/4.35/4.55/10.00), Grading Scale card, Considering FIA callout with "Try Index Calculator →" CTA, educational disclaimer banner, Income/IRR + Index Modeler tab switcher.

**Known delta:** live SPA ships with a dark theme on first load; the Astro port renders in light mode. This is a theme-default difference (Phase 2 did not port the SPA's dark-mode class toggle on `<html>`), not a token-value mismatch. Calculator markup, spacing, and layout match at both widths. If dark-by-default is a Phase 3 requirement, add `class="dark"` to `<html>` in `BaseLayout.astro` — one line.

---

## 5. File-tree diff vs Phase 2

```
src/
├── components-react/                       NEW directory
│   └── calculator/                         NEW
│       ├── CalculatorShell.tsx             NEW (entry island)
│       ├── IncomeCalculator.tsx            NEW (verbatim port)
│       └── IndexModeler.tsx                NEW (verbatim port)
├── data/
│   └── benchmarks.ts                       NEW (verbatim)
├── lib/
│   └── calculator/                         NEW
│       ├── calculatorMath.ts               NEW (verbatim port, sans 3 helpers)
│       ├── indexModelerMath.ts             NEW (holds the 3 relocated helpers)
│       ├── deriveSummary.ts                NEW (labeled non-port)
│       ├── indexData.ts                    NEW (verbatim, 1828 lines)
│       ├── indexHistory.ts                 NEW (verbatim)
│       ├── types.ts                        NEW (verbatim)
│       ├── calculatorMath.test.ts          NEW (31 tests)
│       └── deriveSummary.test.ts           NEW (9 tests)
├── layouts/
│   └── BaseLayout.astro                    MODIFIED (+4 lines: <slot name="head"/>)
├── pages/
│   └── calculator.astro                    REWRITTEN (H1 + explainer + FAQ ×10
│                                            + FAQPage JSON-LD + disclaimer +
│                                            last-updated + related Learn
│                                            + <noscript> + island mount)
└── styles/
    └── global.css                          MODIFIED (SPA tokens + --muted-hsl alias)

package.json                                MODIFIED (v0.3.0; +radix tooltip,
                                            lucide-react, recharts, vitest,
                                            rollup-plugin-visualizer)
astro.config.mjs                            MODIFIED (visualizer plugin)
tailwind.config.mjs                         MODIFIED (SPA color map mirrored)
vitest.config.ts                            NEW
```

---

## 6. T4 — Entry component naming (2 deliberate deviations documented)

`src/components-react/calculator/CalculatorShell.tsx`:

> ```
> // DEVIATION #1 from SPA: file renamed Calculator.tsx → CalculatorShell.tsx
> // to avoid collision with Astro's calculator.astro page file.
>
> // DEVIATION #2 from SPA: IndexModeler is lazy-loaded via React.lazy +
> // <Suspense>. In the SPA this is a static import.
> const IndexModeler = lazy(() =>
>   import("./IndexModeler").then((m) => ({ default: m.IndexModeler })),
> );
> ```

Every other line — interstitial modal copy, tab bar markup, tab state, global `window.__switchToIncome/__switchToIndex` callbacks, disclaimer bar, Tailwind classnames — is verbatim.

---

## 7. Phase 3 acceptance checklist

- ✅ `calculatorMath.ts` ported with all five T2 invariants preserved (1e-10 zero-rate branch, 1e-8 tolerance, 500 max iter, central-diff h=1e-6, clamp [-0.5, 5], 1% rejection, minimum premium 100, `>=` grade boundaries)
- ✅ Only identifier renames (`$c → annuityPV`, `u_ → solveIRR`, `h_ → gradeRate`, `m_ → calculateResult`, `gf → formatUSD`, `iQ → creditedReturn`, `aP → computeStrategyResults`, `rQ → getYearRange`)
- ✅ `deriveSummary.ts` is a labeled non-port with the exact JSX lines (252-255, 375, 389-390, 398-401) pasted as a comment at the top
- ✅ `calculateResult` returns the SPA's 7-field shape with `benchmarkComparison` field name preserved
- ✅ `CalculatorShell.tsx` entry component with the two documented deviations
- ✅ T1: initial chunk contains zero references to `indexData` / `indexHistory` / `recharts`
- ✅ T2: 4/4 hard-assert fixtures (F1, F3, F4, F6) match at 2dp; F2 matches at 2dp; F5 computed and reported (19.80%)
- ✅ T3: Tailwind tokens mirror the SPA; green-blob bug preserved; visual parity at 1280px and 375px
- ✅ T4: `CalculatorShell.tsx` with lazy IndexModeler; every other line verbatim
- ✅ FAQPage JSON-LD emitted in `<head>` via new `<slot name="head"/>` in BaseLayout
- ✅ 10-question FAQ, methodology explainer, grade table, assumptions, related-learn links, disclaimer, last-updated, `<noscript>` fallback all server-rendered
- ✅ vitest suite: 40 tests passing
- ✅ rollup-plugin-visualizer report at `dist/_bundle-report.html`

---

## 8. DO-NOT-FIX-IN-PHASE-3 — preserved

- Green-blob grade indicator bug: `.grade-display` and related classes remain undefined (matches both `src/index.css` and deployed `app-DUHA1Zt6.css`). Documented in the FAQ as "known UI bug." Dedicated polish pass after Phase 3 parity is signed off.

---

## 9. Stop condition check

Flag 3: "If F1/F3/F4/F6 IRR diverges from fixture at 2dp, STOP and REPORT."

- F1: 4.12 expected, **4.12 ported** (2dp match) ✓
- F3: 5.43 expected, **5.43 ported** (2dp match) ✓
- F4: 2.43 expected, **2.43 ported** (2dp match) ✓
- F6: 0.95 expected, **0.95 ported** (2dp match) ✓

**No stop condition triggered. Phase 3 complete.**
