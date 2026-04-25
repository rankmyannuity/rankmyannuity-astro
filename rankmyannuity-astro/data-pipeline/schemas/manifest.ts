// Pipeline run manifest — emitted once per refresh, committed on publish.
// The manifest is the top-level audit record. If a field ever needs to be
// added, bump pipeline_version and update the schema so old manifests are
// detectably stale.

import { z } from "zod";

export const PIPELINE_VERSION = "0.5.0" as const;

export const ManifestSchema = z.object({
  run_id: z.string(),                                          // ISO timestamp
  pipeline_version: z.literal(PIPELINE_VERSION),
  run_mode: z.enum(["refresh", "ci", "test"]),

  sources: z.array(z.object({
    adapter_id: z.enum(["fred","treasury-direct","fdic-cd","curated-yaml","mdx"]),
    fetched_at: z.string(),
    http_status: z.number().nullable(),                        // null for local sources
    record_count: z.number().int().nonnegative(),
    sha256: z.string().length(64),                             // content hash
    cached: z.boolean().default(false),                        // true if served from fixture
  })),

  counts: z.object({
    carriers: z.number().int().nonnegative(),
    products: z.number().int().nonnegative(),
    rates: z.number().int().nonnegative(),
    benchmarks: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
  }),

  diff_vs_previous: z.object({
    previous_snapshot: z.string().nullable(),                  // path, or null on first run
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    threshold_breaches: z.array(z.string()),                   // human-readable strings
  }),

  // Gate conditions — if any array is non-empty, the run is BLOCKED.
  // publish-data refuses to promote blocked runs.
  conflicts: z.array(z.string()),                              // source disagreements
  missing_required: z.array(z.string()),                       // unresolvable required fields
  schema_failures: z.array(z.string()),                        // zod errors, stringified

  // Decision — set by the CLI based on the above
  status: z.enum(["ready_for_review", "blocked"]),

  // [Phase 5] Set to the PIPELINE_FROZEN_TIME env value if the run used
  // a frozen clock (tests, idempotency runs); null for wall-clock runs.
  // Surfaced in REVIEW.md and gated by publish-data (see PHASE5_SPEC.md §5).
  frozen_time: z.string().nullable(),

  // [Phase 5] True iff this run has no previous snapshot to diff against —
  // i.e. the very first publish. Certain gates (e.g. wall-clock regression)
  // are carved out on this run because there is no baseline timestamp.
  first_published_run: z.boolean(),
}).strict();

export type Manifest = z.infer<typeof ManifestSchema>;
