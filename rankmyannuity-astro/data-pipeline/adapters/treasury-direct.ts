// treasury-direct adapter — fetches the 10-Year Treasury Note average
// interest rate from fiscaldata.treasury.gov as an INDEPENDENT cross-check
// against FRED DGS10. Per Phase 4 brief: "If source data conflicts, flag it
// and stop for review." The normalize layer compares the two; if they differ
// by more than 10 basis points for the same date, the run is blocked with a
// conflict entry in conflicts.md.
//
// Note: TreasuryDirect's "avg_interest_rate_amt" is the average rate paid
// on outstanding marketable Treasury Notes, which is a slightly different
// measure than FRED DGS10 (daily CMT). For a pilot cross-check this is
// acceptable — we're looking for catastrophic divergence, not exact match.
// If the pilot expands, swap this for the daily Treasury CMT feed.

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
// [Phase 5] Adapter emits status-free AdapterBenchmarkSnapshot; normalize
// layer adds the final live/pilot_empty/degraded tag (PHASE5_SPEC.md §3).

type TDRecord = { record_date: string; avg_interest_rate_amt: string };
type TDResponse = { data: TDRecord[] };

export async function fetchTreasuryDirect10Yr(opts?: {
  pipelineRoot?: string;
  fetchFn?: typeof fetch;
  offline?: boolean;
  recordDate?: string; // ISO date, for the filter
}): Promise<AdapterResult<AdapterBenchmarkSnapshot>> {
  const pipelineRoot = opts?.pipelineRoot ?? resolve(process.cwd(), "data-pipeline");
  const offline = opts?.offline ?? process.env.PIPELINE_OFFLINE === "1";
  const fetched_at = now();

  let rawPayload: string;
  let http_status: number | null;
  let cached: boolean;

  if (offline) {
    const fixturePath = resolve(pipelineRoot, "fixtures", "treasury-direct-10yr.json");
    if (!existsSync(fixturePath)) {
      return fail(fetched_at, `TreasuryDirect fixture missing at ${fixturePath}`, null);
    }
    rawPayload = readFileSync(fixturePath, "utf8");
    http_status = null;
    cached = true;
  } else {
    const date = opts?.recordDate ?? new Date().toISOString().slice(0, 10);
    const url =
      `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates` +
      `?filter=security_desc:eq:Treasury%20Notes,record_date:eq:${date}`;
    try {
      const f = opts?.fetchFn ?? fetch;
      const res = await f(url);
      http_status = res.status;
      if (!res.ok) return fail(fetched_at, `TreasuryDirect: HTTP ${res.status}`, http_status);
      rawPayload = await res.text();
      cached = false;
    } catch (e) {
      return fail(fetched_at, `TreasuryDirect: network error: ${(e as Error).message}`, null);
    }
  }

  let parsed: TDResponse;
  try {
    parsed = JSON.parse(rawPayload) as TDResponse;
  } catch (e) {
    return fail(fetched_at, `TreasuryDirect: JSON parse: ${(e as Error).message}`, http_status);
  }

  const row = parsed.data?.[0];
  if (!row || !row.avg_interest_rate_amt) {
    return fail(fetched_at, "TreasuryDirect: no rows in response", http_status);
  }

  const rate = Number(row.avg_interest_rate_amt) / 100;
  const snapshot = {
    label: "10-yr Treasury (cross-check)",
    rate,
    source: "TreasuryDirect avg_interest_rates (Treasury Notes)",
    source_url: "https://fiscaldata.treasury.gov/datasets/average-interest-rates-treasury-securities/",
    as_of: row.record_date,
    adapter_id: "treasury-direct" as const,
  };

  const checked = AdapterBenchmarkSnapshotSchema.safeParse(snapshot);
  if (!checked.success) {
    return fail(
      fetched_at,
      `TreasuryDirect: snapshot failed schema: ${checked.error.issues.map((i) => i.message).join("; ")}`,
      http_status,
    );
  }

  return {
    status: "ok",
    data: checked.data,
    provenance: {
      adapter_id: "treasury-direct",
      fetched_at,
      http_status,
      record_count: 1,
      sha256: sha256Hex(rawPayload),
      cached,
    },
    notes: cached ? ["TreasuryDirect: served from fixture (offline mode)"] : [],
    errors: [],
  };
}

function fail(fetched_at: string, msg: string, http_status: number | null): AdapterResult<AdapterBenchmarkSnapshot> {
  const prov: AdapterProvenance = {
    adapter_id: "treasury-direct",
    fetched_at,
    http_status,
    record_count: 0,
    sha256: sha256Hex(""),
    cached: false,
  };
  return { status: "failed", data: null, provenance: prov, notes: [], errors: [msg] };
}
