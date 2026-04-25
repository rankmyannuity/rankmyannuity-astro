// fdic-cd adapter — fetches the FDIC 5-year CD national average. This
// feed is less reliable than FRED / TreasuryDirect (the FDIC "National
// Rates and Rate Caps" source is published weekly as HTML, not as a
// stable JSON API), so this adapter has fallback-to-snapshot behavior:
//
//   1. offline mode → read from fixtures/fdic-cd-5yr.json
//   2. live mode + success → use the live value, write new snapshot
//   3. live mode + failure → read most recent snapshot from snapshots/,
//      mark status="degraded", add a REVIEW.md note
//
// A degraded run is NOT blocked. The CD benchmark is an editorial floor
// comparison; the site is informative even if it's a few weeks stale.
// The REVIEW.md note ensures the human reviewer sees it.

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
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
// [Phase 5] Adapter emits the status-free AdapterBenchmarkSnapshot. The
// degraded-vs-live decision is expressed via AdapterResult.status ("ok" |
// "degraded"); normalize translates that into the final BenchmarkSnapshot
// `status` field. See PHASE5_SPEC.md §3.

type FdicPayload = { as_of: string; national_average_pct: number };

export async function fetchFdicCd5Yr(opts?: {
  pipelineRoot?: string;
  fetchFn?: typeof fetch;
  offline?: boolean;
  writeSnapshotOnSuccess?: boolean;
}): Promise<AdapterResult<AdapterBenchmarkSnapshot>> {
  const pipelineRoot = opts?.pipelineRoot ?? resolve(process.cwd(), "data-pipeline");
  const offline = opts?.offline ?? process.env.PIPELINE_OFFLINE === "1";
  const fetched_at = now();

  if (offline) {
    const fixturePath = resolve(pipelineRoot, "fixtures", "fdic-cd-5yr.json");
    if (!existsSync(fixturePath)) {
      return fail(fetched_at, `FDIC fixture missing at ${fixturePath}`, null);
    }
    const raw = readFileSync(fixturePath, "utf8");
    return buildOk(JSON.parse(raw) as FdicPayload, raw, fetched_at, null, true, [
      "FDIC CD: served from fixture (offline mode)",
    ]);
  }

  // Live mode — try fetch, fall back to latest snapshot on any failure.
  const url = "https://www.fdic.gov/resources/bankers/national-rates/";
  try {
    const f = opts?.fetchFn ?? fetch;
    const res = await f(url);
    if (!res.ok) return fallbackToSnapshot(pipelineRoot, fetched_at, `FDIC: HTTP ${res.status}`);

    // NOTE: Parsing the live FDIC HTML page is out of scope for Phase 4 —
    // the pipeline doesn't own a scraper for that. In production, a
    // replacement adapter should target the FDIC's downloadable CSV under
    // national-rates-and-rate-caps-previous-rates. For now, in live mode
    // we deliberately fall back to snapshot and flag the run degraded,
    // making the gap visible in REVIEW.md rather than hiding it.
    return fallbackToSnapshot(
      pipelineRoot,
      fetched_at,
      "FDIC: live HTML scrape not implemented; using most recent snapshot",
    );
  } catch (e) {
    return fallbackToSnapshot(pipelineRoot, fetched_at, `FDIC: network error: ${(e as Error).message}`);
  }
}

function fallbackToSnapshot(
  pipelineRoot: string,
  fetched_at: string,
  reason: string,
): AdapterResult<AdapterBenchmarkSnapshot> {
  const snapshotDir = resolve(pipelineRoot, "snapshots");
  if (!existsSync(snapshotDir)) {
    return fail(fetched_at, `${reason}; no snapshot directory at ${snapshotDir}`, null);
  }
  const candidates = readdirSync(snapshotDir)
    .filter((f) => f.startsWith("fdic-cd-5yr-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (candidates.length === 0) {
    // First-ever run with no live success and no pre-recorded snapshot:
    // use the fixture as the last-resort fallback. This is the Phase 4
    // pilot accommodation — once the snapshots directory is populated
    // by a successful live run, this path stops being reachable.
    const fixturePath = resolve(pipelineRoot, "fixtures", "fdic-cd-5yr.json");
    if (!existsSync(fixturePath)) {
      return fail(fetched_at, `${reason}; no snapshots and no fixture`, null);
    }
    const raw = readFileSync(fixturePath, "utf8");
    return buildOkDegraded(JSON.parse(raw) as FdicPayload, raw, fetched_at, [
      `${reason} — falling back to bundled fixture (no live snapshots yet)`,
    ]);
  }
  const raw = readFileSync(resolve(snapshotDir, candidates[0]), "utf8");
  return buildOkDegraded(JSON.parse(raw) as FdicPayload, raw, fetched_at, [
    `${reason} — using snapshot ${candidates[0]}`,
  ]);
}

function buildOk(
  payload: FdicPayload,
  rawPayload: string,
  fetched_at: string,
  http_status: number | null,
  cached: boolean,
  notes: string[],
): AdapterResult<AdapterBenchmarkSnapshot> {
  return finalize(payload, rawPayload, fetched_at, http_status, cached, notes, "ok");
}

function buildOkDegraded(
  payload: FdicPayload,
  rawPayload: string,
  fetched_at: string,
  notes: string[],
): AdapterResult<AdapterBenchmarkSnapshot> {
  return finalize(payload, rawPayload, fetched_at, null, true, notes, "degraded");
}

function finalize(
  payload: FdicPayload,
  rawPayload: string,
  fetched_at: string,
  http_status: number | null,
  cached: boolean,
  notes: string[],
  status: "ok" | "degraded",
): AdapterResult<AdapterBenchmarkSnapshot> {
  const snapshot = {
    label: "5-yr CD national average",
    rate: payload.national_average_pct / 100,
    source: "FDIC National Rates and Rate Caps (5-year CD, national average)",
    source_url: "https://www.fdic.gov/resources/bankers/national-rates/",
    as_of: payload.as_of,
    adapter_id: "fdic-cd" as const,
  };
  const checked = AdapterBenchmarkSnapshotSchema.safeParse(snapshot);
  if (!checked.success) {
    return fail(
      fetched_at,
      `FDIC: snapshot failed schema: ${checked.error.issues.map((i) => i.message).join("; ")}`,
      http_status,
    );
  }
  return {
    status,
    data: checked.data,
    provenance: {
      adapter_id: "fdic-cd",
      fetched_at,
      http_status,
      record_count: 1,
      sha256: sha256Hex(rawPayload),
      cached,
    },
    notes,
    errors: [],
  };
}

function fail(fetched_at: string, msg: string, http_status: number | null): AdapterResult<AdapterBenchmarkSnapshot> {
  const prov: AdapterProvenance = {
    adapter_id: "fdic-cd",
    fetched_at,
    http_status,
    record_count: 0,
    sha256: sha256Hex(""),
    cached: false,
  };
  return { status: "failed", data: null, provenance: prov, notes: [], errors: [msg] };
}

// Utility for CLI to persist a successful live run as a fresh snapshot.
// Not called by any adapter; orchestrator calls this after a clean live run.
export function writeFdicSnapshot(pipelineRoot: string, payload: FdicPayload): string {
  const dir = resolve(pipelineRoot, "snapshots");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fname = `fdic-cd-5yr-${payload.as_of}.json`;
  const path = resolve(dir, fname);
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
  return path;
}
