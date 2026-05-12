# Product-grading sections removed from /methodology

When `/reviews` was pulled off production (PR following #14, 2026-05-12), the four product-grading sections of `src/pages/methodology.astro` were stripped to keep the page consistent with the rest of the live site. The calculator's IRR-based grade (`What the grade measures` and `What the grade means`) is **kept live** and untouched.

This document preserves the exact removed content so the restore is a paste-back.

## Restore instructions

1. In `src/pages/methodology.astro`, restore the `factors` array (was line 10–17) and the `familyGrades` array (was line 27–33) at the top of the frontmatter:

```ts
const factors = [
  { weight: "30%", name: "Contract Mechanics", desc: "How the crediting formula, investment options, or guaranteed benefits are designed — and how they interact with costs and limits." },
  { weight: "20%", name: "Renewal Stability", desc: "Carrier financial strength, guaranteed minimums, and the track record of honoring competitive rates past year one." },
  { weight: "15%", name: "Surrender Severity", desc: "How long the surrender period lasts, how steep the charges are, and how quickly they decline." },
  { weight: "15%", name: "Fee Drag", desc: "Total explicit annual costs including insurance charges, rider fees, and subaccount expenses where applicable." },
  { weight: "10%", name: "Liquidity / Flexibility", desc: "Free withdrawal provisions, waiver features, and the ability to reallocate strategies or subaccounts." },
  { weight: "10%", name: "Index / Investment Confidence", desc: "Live track record length, index or fund transparency, and how closely real results have tracked historical illustrations." },
];

const familyGrades = [
  { g: "A", pct: "≥ 85th", desc: "Excellent — among the strongest in its product family" },
  { g: "B", pct: "≥ 65th", desc: "Strong — above-average contract terms within its family" },
  { g: "C", pct: "≥ 40th", desc: "Average — typical for its product family" },
  { g: "D", pct: "≥ 20th", desc: "Below average — weaker terms relative to peers" },
  { g: "F", pct: "Below 20th", desc: "Poor — significant concerns relative to alternatives" },
];
```

2. In `src/pages/methodology.astro`, paste the block below **between** the `Using Compare Indices` section's closing `</section>` (was line 317) and the `Limitations to know` section (was line 422). The block starts with the "Product-Specific Grading" divider.

3. Restore the page title:

```ts
const title = "How It Works — Methodology, Grading & Disclaimers | RankMyAnnuity";
```

## Removed block — paste back verbatim

```astro
      {/* DIVIDER: Product Grading */}
      <div style={divider}>
        <div style={dividerLine}></div>
        <span style={dividerLabel}>Product-Specific Grading</span>
        <div style={dividerLine}></div>
      </div>

      <section>
        <h2 style={h2}>Like-for-like comparison</h2>
        <p style={para}>
          RankMyAnnuity does not use one universal grading formula for every
          annuity type. Each major product family — FIA, RILA, and VA — is
          graded against other products within that same family.
        </p>
        <p style={para}>
          Grades compare like with like. An FIA grade of B means strong for an
          FIA. A VA grade of B means strong for a VA. Comparing a B-grade FIA
          to a B-grade VA is not apples-to-apples.
        </p>
      </section>

      <section>
        <h2 style={h2}>Strategy-level scoring</h2>
        <p style={para}>
          For FIA and RILA products, the grade considers the limiter and the
          index together — not the limiter in isolation. A 10% cap on the S&amp;P
          500 is scored differently from a 10% cap on a proprietary
          volatility-controlled index.
        </p>
      </section>

      <section>
        <h2 style={h2}>The six scoring factors</h2>
        <p style={para}>Every product grade blends six independently scored factors:</p>
        <div style="border:1px solid rgb(226,232,240);border-radius:8px;overflow:hidden;margin:16px 0;">
          {factors.map((f, i) => (
            <div style={`display:grid;grid-template-columns:80px 1fr;gap:16px;padding:16px;${i>0 ? "border-top:1px solid rgb(226,232,240);" : ""}align-items:flex-start;`}>
              <div style={`font-family:${SERIF};font-size:18px;color:rgb(15,23,42);font-weight:600;`}>{f.weight}</div>
              <div>
                <div style="font-size:14px;font-weight:600;color:rgb(1,8,22);margin-bottom:4px;">{f.name}</div>
                <div style="font-size:14px;color:rgb(100,116,139);line-height:1.5;">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={para}>
          Each factor is scored independently and then weighted. Contract
          mechanics and renewal stability carry the most weight because they
          most directly determine what you'll actually earn over the life of
          the contract.
        </p>
      </section>

      <section>
        <h2 style={h2}>Carrier Strength vs. Product Grade</h2>
        <p style={para}>
          Every product review shows two separate ratings. These measure
          fundamentally different things:
        </p>
        <p style={para}>
          <strong style="color:rgb(1,8,22);font-weight:600;">Carrier Strength (AM Best rating).</strong>
          This reflects the insurance company's financial stability and ability
          to pay claims. An A+ rating means the carrier has exceptional
          financial strength. This is not a rating of the product — it's a
          rating of the company behind it.
        </p>
        <p style={para}>
          <strong style="color:rgb(1,8,22);font-weight:600;">Product Grade (contract competitiveness).</strong>
          This compares the specific annuity contract against other products in
          its own family. An FIA is graded against other FIAs — not against VAs
          or MYGAs.
        </p>
        <p style={para}>
          A carrier rated A+ for financial strength might offer some products
          that grade as A and others that grade as D. The ratings are
          independent.
        </p>
      </section>

      <section>
        <h2 style={h2}>Letter grades & raw scores</h2>
        <p style={para}>
          Every product review shows two numbers: a <strong style="color:rgb(1,8,22);font-weight:600;">Raw
          Contract Score</strong> (0–100) and a <strong style="color:rgb(1,8,22);font-weight:600;">Family
          Grade</strong> (letter). The raw score is computed identically across
          all products and is directly comparable. The letter grade is
          percentile-based within each product family.
        </p>
        <div style="border:1px solid rgb(226,232,240);border-radius:8px;overflow:hidden;margin:16px 0;">
          {familyGrades.map((g, i) => (
            <div style={`display:grid;grid-template-columns:64px 110px 1fr;gap:16px;padding:14px 16px;${i>0 ? "border-top:1px solid rgb(226,232,240);" : ""}align-items:center;`}>
              <div style={`font-family:${SERIF};font-size:20px;color:rgb(15,23,42);font-weight:600;`}>{g.g}</div>
              <div style="font-size:14px;color:rgb(1,8,22);font-weight:500;">{g.pct}</div>
              <div style="font-size:14px;color:rgb(100,116,139);">{g.desc}</div>
            </div>
          ))}
        </div>
        <p style={para}>
          For product families with fewer than 10 products, grades are capped
          at B to avoid over-confidence from small samples.
        </p>
      </section>
```
