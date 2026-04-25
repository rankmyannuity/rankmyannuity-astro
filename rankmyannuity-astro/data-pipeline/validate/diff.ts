// Diff layer — compares the current NormalizeOutput to the most recently
// published snapshot under data-pipeline/snapshots/normalized-*.json and
// surfaces threshold breaches. The diff is advisory on its own (it does
// not block publish), but any breach becomes a note in REVIEW.md so the
// human reviewer explicitly sees material changes before approving.
//
// Thresholds (per Phase 4 brief's "diff review required"):
//   - Benchmark rate moved by > 25 bps         → breach
//   - MYGA rate for any (carrier, product, term) moved by > 50 bps → breach
//   - Rate added or removed                     → breach (structural change)
//   - Review added, removed, or changed grade   → breach
//
// All breaches become human-readable strings fed into REVIEW.md.

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizeOutput } from "../normalize/index.js";

export interface DiffResult {
  previous_snapshot: string | null;
  added: number;
  removed: number;
  modified: number;
  threshold_breaches: string[];
  notes: string[];
}

export const BENCHMARK_BREACH_BPS = 25;
export const RATE_BREACH_BPS = 50;

// Deterministic serialization for snapshots. We write pretty JSON sorted
// by keys so two identical NormalizeOutputs diff to zero-byte change.
export function canonicalize(obj: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = sort((v as Record<string, unknown>)[k]);
      }
      return sorted;
    }
    return v;
  };
  return JSON.stringify(sort(obj), null, 2) + "\n";
}

function findLatestSnapshot(pipelineRoot: string): string | null {
  const dir = resolve(pipelineRoot, "snapshots");
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((f) => f.startsWith("normalized-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return candidates[0] ? resolve(dir, candidates[0]) : null;
}

// The "comparable" shape we store in snapshots. We intentionally strip
// generated_at timestamps from the review sidecars before comparing, so
// re-running on the same sources doesn't trip the diff purely on time.
function compareShape(out: NormalizeOutput) {
  return {
    benchmarkPanel: out.benchmarkPanel,
    mygaRates: out.mygaRates,
    reviews: out.reviews.map((r) => ({
      ...r,
      generated_at: "<stripped-for-diff>",
    })),
  };
}

// Absolute bps gap between two decimal rates.
function bps(a: number, b: number): number {
  return Math.abs(a - b) * 10000;
}

export function diffVsPrevious(
  current: NormalizeOutput,
  pipelineRoot: string,
): DiffResult {
  const previousPath = findLatestSnapshot(pipelineRoot);
  if (!previousPath) {
    return {
      previous_snapshot: null,
      added: 0,
      removed: 0,
      modified: 0,
      threshold_breaches: [],
      notes: ["First run — no previous snapshot to diff against."],
    };
  }

  const prev = JSON.parse(readFileSync(previousPath, "utf8")) as ReturnType<
    typeof compareShape
  >;
  const curr = compareShape(current);
  const breaches: string[] = [];
  const notes: string[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;

  // Benchmark panel: 4 fixed keys.
  for (const key of ["top_myga_5yr", "treasury_10yr", "cd_5yr_national_avg", "sp500_historical"] as const) {
    const a = prev.benchmarkPanel?.[key]?.rate;
    const b = curr.benchmarkPanel?.[key]?.rate;
    if (a != null && b != null && bps(a, b) > BENCHMARK_BREACH_BPS) {
      breaches.push(
        `benchmark ${key}: moved ${(a * 100).toFixed(2)}% → ${(b * 100).toFixed(2)}% (${bps(a, b).toFixed(0)}bps > ${BENCHMARK_BREACH_BPS}bps threshold)`,
      );
      modified++;
    }
  }

  // MYGA rates: key by (carrier_slug, product_slug, term_years).
  const rateKey = (r: { carrier_slug: string; product_slug: string; term_years: number }) =>
    `${r.carrier_slug}::${r.product_slug}::${r.term_years}`;
  const prevRates = new Map(prev.mygaRates.map((r) => [rateKey(r), r]));
  const currRates = new Map(curr.mygaRates.map((r) => [rateKey(r), r]));
  for (const [k, r] of currRates) {
    const p = prevRates.get(k);
    if (!p) {
      breaches.push(`rate added: ${k} @ ${(r.rate * 100).toFixed(2)}%`);
      added++;
    } else if (bps(p.rate, r.rate) > RATE_BREACH_BPS) {
      breaches.push(
        `rate ${k}: moved ${(p.rate * 100).toFixed(2)}% → ${(r.rate * 100).toFixed(2)}% (${bps(p.rate, r.rate).toFixed(0)}bps > ${RATE_BREACH_BPS}bps threshold)`,
      );
      modified++;
    }
  }
  for (const [k] of prevRates) {
    if (!currRates.has(k)) {
      breaches.push(`rate removed: ${k}`);
      removed++;
    }
  }

  // Reviews: key by slug, compare computed grade letter.
  const prevRev = new Map(prev.reviews.map((r) => [r.slug, r]));
  const currRev = new Map(curr.reviews.map((r) => [r.slug, r]));
  for (const [slug, r] of currRev) {
    const p = prevRev.get(slug);
    if (!p) {
      breaches.push(`review added: ${slug}`);
      added++;
    } else {
      const pLetter = p.computed_grade?.letter ?? "N/A";
      const cLetter = r.computed_grade?.letter ?? "N/A";
      if (pLetter !== cLetter) {
        breaches.push(`review ${slug}: computed grade ${pLetter} → ${cLetter}`);
        modified++;
      }
    }
  }
  for (const [slug] of prevRev) {
    if (!currRev.has(slug)) {
      breaches.push(`review removed: ${slug}`);
      removed++;
    }
  }

  if (breaches.length === 0) {
    notes.push(`No threshold breaches vs ${previousPath.split("/").pop()}. Outputs structurally equivalent or within tolerance.`);
  }

  return {
    previous_snapshot: previousPath,
    added,
    removed,
    modified,
    threshold_breaches: breaches,
    notes,
  };
}

// Persists a normalized snapshot after a publish. Snapshot filename
// includes a sortable timestamp prefix so findLatestSnapshot picks the
// newest without reading every file.
export function writeNormalizedSnapshot(
  out: NormalizeOutput,
  pipelineRoot: string,
  run_id: string,
): string {
  const dir = resolve(pipelineRoot, "snapshots");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Safe filename: replace characters that some filesystems reject.
  const safeRunId = run_id.replace(/[:.]/g, "-");
  const path = resolve(dir, `normalized-${safeRunId}.json`);
  writeFileSync(path, canonicalize(compareShape(out)));
  return path;
}
