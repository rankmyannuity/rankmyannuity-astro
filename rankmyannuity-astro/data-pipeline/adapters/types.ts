// Shared types for adapter return values.
//
// Every adapter returns an AdapterResult<T>: the payload plus a provenance
// record. The provenance record becomes one entry in manifest.sources — that
// is how an audit of a published run reconstructs exactly where each byte
// came from.
//
// Adapters do not throw on soft failures. They return { status: "failed",
// ... } or { status: "degraded", ... } so that the orchestrator can decide
// whether the run is blocked, degraded, or clean.

import { createHash } from "node:crypto";

export type AdapterId =
  | "fred"
  | "treasury-direct"
  | "fdic-cd"
  | "curated-yaml"
  | "mdx";

export interface AdapterProvenance {
  adapter_id: AdapterId;
  fetched_at: string;          // ISO timestamp
  http_status: number | null;  // null for local sources (yaml, mdx)
  record_count: number;
  sha256: string;              // content hash of the raw payload
  cached: boolean;             // true if served from fixture/snapshot
}

export type AdapterStatus = "ok" | "degraded" | "failed";

export interface AdapterResult<T> {
  status: AdapterStatus;
  // When status === "failed", data may be null; orchestrator decides blocking.
  data: T | null;
  provenance: AdapterProvenance;
  // Human-readable messages for REVIEW.md / conflicts.md / missing.md
  notes: string[];
  errors: string[];
}

// Convenience: compute sha256 of a string (raw file content or serialized JSON).
// We hash raw bytes whenever possible so re-running on unchanged input always
// produces the same manifest hash — critical for the idempotency test.
export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

// Convenience: deterministic ISO timestamp override for tests. If the
// environment variable PIPELINE_FROZEN_TIME is set, all adapters use it
// as "now" instead of Date.now(). The idempotency golden-snapshot test
// relies on this so two back-to-back runs produce byte-identical output.
export function now(): string {
  const frozen = process.env.PIPELINE_FROZEN_TIME;
  if (frozen && /^\d{4}-\d{2}-\d{2}T/.test(frozen)) return frozen;
  return new Date().toISOString();
}
