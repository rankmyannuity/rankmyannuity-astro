// curated-yaml adapter — reads the two YAML source files and validates
// them against their zod schemas. These files are the human-maintained
// curated layer of the pipeline (per Phase 4 brief: "editorial / curated
// layer for overrides, normalization, exceptions, editorial notes").
//
// Because YAML is local and deterministic, this adapter never reaches
// the network — http_status is always null, cached is always false
// (there is no cache; the file itself is the source).

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  MygaRatesFileSchema,
  CuratedBenchmarksFileSchema,
  type MygaRatesFile,
  type CuratedBenchmarksFile,
} from "../schemas/rate.js";
import {
  type AdapterResult,
  type AdapterProvenance,
  sha256Hex,
  now,
} from "./types.js";

// Resolve source-file paths from the pipeline root. Callers pass in the
// absolute root; defaults to process.cwd()/data-pipeline so both the CLI
// and vitest can run without setup.
function resolveRoot(rootDir?: string): string {
  return rootDir ?? resolve(process.cwd(), "data-pipeline");
}

// --- rates.myga.yml ---------------------------------------------------------

export function loadMygaRates(rootDir?: string): AdapterResult<MygaRatesFile> {
  const path = resolve(resolveRoot(rootDir), "sources/rates.myga.yml");
  const fetched_at = now();
  const notes: string[] = [];
  const errors: string[] = [];

  if (!existsSync(path)) {
    return {
      status: "failed",
      data: null,
      provenance: makeProv({ fetched_at, record_count: 0, sha256: sha256Hex("") }),
      notes,
      errors: [`rates.myga.yml not found at ${path}`],
    };
  }

  const raw = readFileSync(path, "utf8");
  const sha = sha256Hex(raw);
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    return {
      status: "failed",
      data: null,
      provenance: makeProv({ fetched_at, record_count: 0, sha256: sha }),
      notes,
      errors: [`rates.myga.yml: YAML parse error: ${(e as Error).message}`],
    };
  }

  const result = MygaRatesFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: "failed",
      data: null,
      provenance: makeProv({ fetched_at, record_count: 0, sha256: sha }),
      notes,
      errors: result.error.issues.map(
        (i) => `rates.myga.yml: ${i.path.join(".") || "<root>"}: ${i.message}`,
      ),
    };
  }

  // Empty rates is a valid pilot state — surface as a REVIEW.md note, not an error.
  if (result.data.rates.length === 0) {
    notes.push(
      "rates.myga.yml has 0 entries. The /rates page will render an empty state. " +
        "This is expected for the Athene pilot (the only Athene review in scope is FIA, not MYGA).",
    );
  }

  return {
    status: "ok",
    data: result.data,
    provenance: makeProv({
      fetched_at,
      record_count: result.data.rates.length,
      sha256: sha,
    }),
    notes,
    errors,
  };
}

// --- benchmarks.curated.yml -------------------------------------------------

export function loadCuratedBenchmarks(
  rootDir?: string,
): AdapterResult<CuratedBenchmarksFile> {
  const path = resolve(resolveRoot(rootDir), "sources/benchmarks.curated.yml");
  const fetched_at = now();

  if (!existsSync(path)) {
    return {
      status: "failed",
      data: null,
      provenance: makeProv({ fetched_at, record_count: 0, sha256: sha256Hex("") }),
      notes: [],
      errors: [`benchmarks.curated.yml not found at ${path}`],
    };
  }

  const raw = readFileSync(path, "utf8");
  const sha = sha256Hex(raw);
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    return {
      status: "failed",
      data: null,
      provenance: makeProv({ fetched_at, record_count: 0, sha256: sha }),
      notes: [],
      errors: [`benchmarks.curated.yml: YAML parse error: ${(e as Error).message}`],
    };
  }

  const result = CuratedBenchmarksFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: "failed",
      data: null,
      provenance: makeProv({ fetched_at, record_count: 0, sha256: sha }),
      notes: [],
      errors: result.error.issues.map(
        (i) => `benchmarks.curated.yml: ${i.path.join(".") || "<root>"}: ${i.message}`,
      ),
    };
  }

  return {
    status: "ok",
    data: result.data,
    provenance: makeProv({ fetched_at, record_count: 1, sha256: sha }), // one record: sp500_historical
    notes: [],
    errors: [],
  };
}

// --- helpers ---------------------------------------------------------------

function makeProv(args: {
  fetched_at: string;
  record_count: number;
  sha256: string;
}): AdapterProvenance {
  return {
    adapter_id: "curated-yaml",
    fetched_at: args.fetched_at,
    http_status: null, // local file
    record_count: args.record_count,
    sha256: args.sha256,
    cached: false,
  };
}
