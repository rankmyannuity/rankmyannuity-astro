// fred adapter — fetches the most recent observation for a FRED series
// (DGS10 for 10-yr Treasury, DGS1 for 1-yr). Returns the rate as a decimal
// (FRED reports in percent; we convert).
//
// Offline mode: if PIPELINE_OFFLINE=1 (or no FRED_API_KEY is set), this
// adapter reads from data-pipeline/fixtures/fred-<series>.json. Tests
// always run offline so they are deterministic.
//
// Failure behavior: on HTTP error, the adapter returns status="failed" and
// the orchestrator decides whether to block the run. FRED is REQUIRED for
// Phase 4 (the /rates page comparison card uses it), so a failure here
// will block.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type AdapterResult,
  type AdapterProvenance,
  sha256Hex,
  now,
} from "./types.js";
import {
  AdapterBenchmarkSnapshotSchema,
  type AdapterBenchmarkSnapshot,
} from "../schemas/rate.js";

// [Phase 5] Adapters now emit the status-free AdapterBenchmarkSnapshot.
// The final `status` field (live / pilot_empty / degraded) is added by
// the normalize layer, which has the runtime context to infer it. See
// PHASE5_SPEC.md §3 and data-pipeline/schemas/rate.ts for the split.

type FredObs = { date: string; value: string };
type FredResponse = { observations: FredObs[] };

export interface FredSeriesConfig {
  series_id: "DGS10" | "DGS1";
  label: string;                     // human-readable label to embed in the benchmark
  fixture_filename: string;          // under data-pipeline/fixtures/
}

export const DGS10_CONFIG: FredSeriesConfig = {
  series_id: "DGS10",
  label: "10-yr Treasury",
  fixture_filename: "fred-dgs10.json",
};
export const DGS1_CONFIG: FredSeriesConfig = {
  series_id: "DGS1",
  label: "1-yr Treasury",
  fixture_filename: "fred-dgs1.json",
};

// Reads the latest non-blank observation. FRED uses "." to denote missing
// values on holidays; we skip those.
function pickLatestObservation(obs: FredObs[]): FredObs | null {
  for (const o of obs) {
    if (o.value && o.value !== "." && !Number.isNaN(Number(o.value))) return o;
  }
  return null;
}

export async function fetchFredSeries(
  cfg: FredSeriesConfig,
  opts?: {
    pipelineRoot?: string;
    fetchFn?: typeof fetch;
    apiKey?: string;
    offline?: boolean;
  },
): Promise<AdapterResult<AdapterBenchmarkSnapshot>> {
  const pipelineRoot = opts?.pipelineRoot ?? resolve(process.cwd(), "data-pipeline");
  const offline = opts?.offline ?? (process.env.PIPELINE_OFFLINE === "1" || !process.env.FRED_API_KEY);
  const fetched_at = now();

  let rawPayload: string;
  let http_status: number | null;
  let cached: boolean;

  if (offline) {
    const fixturePath = resolve(pipelineRoot, "fixtures", cfg.fixture_filename);
    if (!existsSync(fixturePath)) {
      return failure(cfg, fetched_at, `FRED fixture missing at ${fixturePath}`, null);
    }
    rawPayload = readFileSync(fixturePath, "utf8");
    http_status = null; // local fixture has no HTTP status
    cached = true;
  } else {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${cfg.series_id}&api_key=${opts?.apiKey ?? process.env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
    try {
      const f = opts?.fetchFn ?? fetch;
      const res = await f(url);
      http_status = res.status;
      if (!res.ok) {
        return failure(cfg, fetched_at, `FRED ${cfg.series_id}: HTTP ${res.status}`, http_status);
      }
      rawPayload = await res.text();
      cached = false;
    } catch (e) {
      return failure(cfg, fetched_at, `FRED ${cfg.series_id}: network error: ${(e as Error).message}`, null);
    }
  }

  let parsed: FredResponse;
  try {
    parsed = JSON.parse(rawPayload) as FredResponse;
  } catch (e) {
    return failure(cfg, fetched_at, `FRED ${cfg.series_id}: JSON parse: ${(e as Error).message}`, http_status);
  }

  const latest = pickLatestObservation(parsed.observations ?? []);
  if (!latest) {
    return failure(cfg, fetched_at, `FRED ${cfg.series_id}: no usable observation in response`, http_status);
  }

  const rate = Number(latest.value) / 100;
  const snapshot = {
    label: cfg.label,
    rate,
    source: `FRED ${cfg.series_id} (${cfg.series_id === "DGS10" ? "10-Year" : "1-Year"} Treasury CMT)`,
    source_url: `https://fred.stlouisfed.org/series/${cfg.series_id}`,
    as_of: latest.date,
    adapter_id: "fred" as const,
  };

  // Self-validate against schema to catch any upstream surprise (e.g. rate
  // above hard-cap of 0.25). If FRED ever returns wildly bad data we want
  // to stop the pipeline, not pass it through.
  const checked = AdapterBenchmarkSnapshotSchema.safeParse(snapshot);
  if (!checked.success) {
    return failure(
      cfg,
      fetched_at,
      `FRED ${cfg.series_id}: snapshot failed schema: ${checked.error.issues.map((i) => i.message).join("; ")}`,
      http_status,
    );
  }

  return {
    status: "ok",
    data: checked.data,
    provenance: {
      adapter_id: "fred",
      fetched_at,
      http_status,
      record_count: 1,
      sha256: sha256Hex(rawPayload),
      cached,
    },
    notes: cached ? [`FRED ${cfg.series_id}: served from fixture (offline mode)`] : [],
    errors: [],
  };
}

function failure(
  cfg: FredSeriesConfig,
  fetched_at: string,
  msg: string,
  http_status: number | null,
): AdapterResult<AdapterBenchmarkSnapshot> {
  const prov: AdapterProvenance = {
    adapter_id: "fred",
    fetched_at,
    http_status,
    record_count: 0,
    sha256: sha256Hex(""),
    cached: false,
  };
  return { status: "failed", data: null, provenance: prov, notes: [], errors: [msg] };
}
