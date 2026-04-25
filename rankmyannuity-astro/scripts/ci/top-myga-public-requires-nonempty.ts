#!/usr/bin/env tsx
// [Phase 5] CI gate: site.yml.top_myga_public may only be `true` when the
// curated MYGA corpus contains at least one qualifying 5-year rate.
//
// Spec: PHASE5_SPEC.md §6, check #4.
//   "top_myga_public: true is only legal if the curated MYGA corpus
//    contains at least one qualifying 5-year rate (strict definition:
//    term_years === 5 AND rate > 0). Setting true while the corpus is
//    empty fails the build."
//
// Rationale: the site-wide "Top MYGA" benchmark is user-facing marketing.
// Flipping the flag on with no underlying rates causes the benchmark to
// render as em-dash + "Not live" chip publicly — which looks broken,
// not editorially intentional. This gate prevents that class of PR.
//
// The flag's default in Phase 5.0a is `false` (pilot state; empty corpus).
// It graduates to `true` only when wave-1 rates land in 5.0b.
//
// Exit 0 on success, 1 on violation.

import { resolve } from "node:path";
import { readSiteYaml } from "../../data-pipeline/helpers/siteYaml.ts";
import { loadMygaRates } from "../../data-pipeline/adapters/curated-yaml.ts";
import { hasQualifyingFiveYearMygaRate } from "../../data-pipeline/predicates/myga.ts";

const projectRoot = process.cwd();
const sitePath = resolve(projectRoot, "data-pipeline/sources/site.yml");
const pipelineRoot = resolve(projectRoot, "data-pipeline");

function main(): number {
  let site;
  try {
    site = readSiteYaml(sitePath);
  } catch (err) {
    console.error(
      `[ci:top-myga-public-requires-nonempty] FAIL: could not read site.yml: ${(err as Error).message}`,
    );
    return 1;
  }

  if (site.top_myga_public !== true) {
    console.log(
      `[ci:top-myga-public-requires-nonempty] OK — top_myga_public is ${site.top_myga_public}; gate does not apply.`,
    );
    return 0;
  }

  // Flag is ON: the MYGA corpus must contain at least one qualifying
  // 5-year rate (term_years === 5 AND rate > 0). Use the same predicate
  // the normalize layer uses so CI stays consistent with runtime.
  const loaded = loadMygaRates(pipelineRoot);
  if (loaded.status !== "ok" || !loaded.data) {
    console.error(
      `[ci:top-myga-public-requires-nonempty] FAIL: top_myga_public is true but rates.myga.yml could not be loaded (status=${loaded.status}).`,
    );
    for (const e of loaded.errors) console.error(`  - ${e}`);
    return 1;
  }

  if (!hasQualifyingFiveYearMygaRate(loaded.data.rates)) {
    console.error(
      `[ci:top-myga-public-requires-nonempty] FAIL: top_myga_public is true but the curated MYGA corpus contains no qualifying 5-year rate.\n` +
        `      A qualifying rate has term_years === 5 AND rate > 0.\n` +
        `      rates.myga.yml has ${loaded.data.rates.length} rate(s) total.\n` +
        `      Either (a) add a qualifying 5-year MYGA rate to rates.myga.yml, or\n` +
        `             (b) set top_myga_public back to false in site.yml.`,
    );
    return 1;
  }

  console.log(
    `[ci:top-myga-public-requires-nonempty] OK — top_myga_public=true and corpus contains a qualifying 5-year MYGA rate.`,
  );
  return 0;
}

process.exit(main());
