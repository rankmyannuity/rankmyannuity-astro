// emit-collections — writes the generated JSON artifacts that Astro pages
// consume at build time. Specifically:
//
//   src/generated/reviews/<slug>.json   (one per review sidecar)
//   src/generated/rates/myga.json        (the flat MYGA rates list)
//   src/generated/benchmarks.json        (the 4-card benchmark panel)
//
// We emit to src/generated/ rather than src/content/ because:
//   1. Astro's content collections are MDX-only for reviews in Phase 2,
//      and changing the collection shape is out of scope for Phase 4.
//   2. src/generated/ is a single, obvious "do not hand-edit" location.
//   3. The rates/myga.json file feeds the /rates page directly via a
//      regular `import ratesJson from "src/generated/rates/myga.json"`.
//
// All writes go through canonicalize() so re-runs on unchanged inputs
// produce byte-identical files (idempotency test anchor).

import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizeOutput } from "../normalize/index.js";
import { canonicalize } from "../validate/diff.js";
import { PIPELINE_VERSION } from "../schemas/manifest.js";

export interface EmitPaths {
  reviewsDir: string;
  ratesFile: string;
  benchmarksFile: string;
  reviewFiles: string[];
}

export function emitCollections(
  out: NormalizeOutput,
  projectRoot: string,
  opts?: { previewOnly?: boolean; outRoot?: string },
): EmitPaths {
  // previewOnly writes under the run dir; publish writes directly into
  // src/generated/. CLI controls this.
  const root = opts?.outRoot ?? resolve(projectRoot, "src/generated");
  const reviewsDir = resolve(root, "reviews");
  const ratesDir = resolve(root, "rates");

  for (const d of [root, reviewsDir, ratesDir]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  // When publishing, we want to ensure stale sidecars from previous runs
  // are cleaned up (a review that was removed from MDX should disappear
  // from the generated tree too). Only touch files we own — files under
  // src/generated/reviews/ ending in .json.
  if (!opts?.previewOnly) {
    for (const f of readdirSync(reviewsDir)) {
      if (f.endsWith(".json")) {
        rmSync(resolve(reviewsDir, f));
      }
    }
  }

  const reviewFiles: string[] = [];
  for (const r of out.reviews) {
    const path = resolve(reviewsDir, `${r.slug}.json`);
    writeFileSync(path, canonicalize(r));
    reviewFiles.push(path);
  }

  const ratesFile = resolve(ratesDir, "myga.json");
  // Wrap in an object so the file has a self-describing shape rather than
  // a bare top-level array (easier to extend without breaking consumers).
  writeFileSync(
    ratesFile,
    canonicalize({
      generated_at: out.reviews[0]?.generated_at ?? null,
      pipeline_version: PIPELINE_VERSION,
      rates: out.mygaRates,
    }),
  );

  const benchmarksFile = resolve(root, "benchmarks.json");
  writeFileSync(
    benchmarksFile,
    canonicalize({
      pipeline_version: PIPELINE_VERSION,
      panel: out.benchmarkPanel,
      legacy_array: out.legacyBenchmarkRates,
    }),
  );

  return { reviewsDir, ratesFile, benchmarksFile, reviewFiles };
}
