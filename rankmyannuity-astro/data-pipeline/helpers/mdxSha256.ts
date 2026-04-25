// [Phase 5] mdxSha256 — exact-bytes content hash for MDX files.
//
// Used by the carriers.shipping.yml approval mechanism (PHASE5_SPEC.md §2).
// Each shipping approval entry pins the sha256 of the MDX file at the
// moment of approval. On every pipeline run, the current file hash is
// re-computed and compared; any drift DOWNGRADES the carrier status from
// "shipping" → "pilot" and flags a REVIEW.md gate so a human can re-approve.
//
// IMPORTANT: this must hash the file's raw bytes verbatim — no trimming,
// no gray-matter parsing, no newline normalization. The whole point is to
// detect ANY change to the MDX, including whitespace-only edits that might
// indicate a merge/rebase re-flow of content that wasn't re-reviewed.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Compute the sha256 hex digest of a file's raw bytes.
 *
 * @param filePath absolute or process-relative path to the file
 * @returns lowercase hex digest string
 * @throws if the file cannot be read (ENOENT, EACCES, etc.) — callers
 *         should handle this; a missing MDX file should fail loudly, not
 *         silently match a stale approval.
 */
export function mdxSha256(filePath: string): string {
  const bytes = readFileSync(filePath); // Buffer — NO encoding arg on purpose
  return createHash("sha256").update(bytes).digest("hex");
}
