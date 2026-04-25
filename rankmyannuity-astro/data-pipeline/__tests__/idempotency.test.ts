// Idempotency test — the whole pipeline must produce byte-identical
// preview output when run twice on the same inputs. This is the single
// most important correctness guarantee of Phase 4: "Deterministic,
// auditable builds first."
//
// Strategy:
//   1. Freeze time via PIPELINE_FROZEN_TIME so `now()` is stable
//   2. Force offline mode (PIPELINE_OFFLINE=1) so adapter inputs are
//      fixture files, not live APIs
//   3. Redirect reports/ to a throwaway tmp dir so we can diff runs
//      without polluting the project tree
//   4. Assert that every generated file's sha256 matches across runs

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { runPipeline } from "../cli/orchestrator.js";

const projectRoot = resolve(__dirname, "..", "..");
const pipelineRoot = resolve(__dirname, "..");

beforeAll(() => {
  process.env.PIPELINE_OFFLINE = "1";
  process.env.PIPELINE_FROZEN_TIME = "2026-04-21T20:00:00.000Z";
  delete process.env.FRED_API_KEY;
});

// Recursively hash every file under dir, keyed by relative path. Returns
// a Map so consumers can diff two runs cleanly.
function hashTree(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (p: string) => {
    for (const name of readdirSync(p)) {
      const full = join(p, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        const bytes = readFileSync(full);
        map.set(relative(dir, full), createHash("sha256").update(bytes).digest("hex"));
      }
    }
  };
  walk(dir);
  return map;
}

describe("pipeline idempotency", () => {
  it("produces byte-identical preview files on two back-to-back refresh runs", async () => {
    // Two fresh runs. Each creates its own run_id'd directory under reports/,
    // so we can't compare entire trees 1:1 — we compare the inner preview/
    // subtree that contains the generated artifacts. manifest.json and
    // REVIEW.md include the run_id (timestamp), so those legitimately
    // differ between runs — we exclude them.
    const a = await runPipeline({
      projectRoot,
      pipelineRoot,
      runMode: "test",
      previewOnly: true,
    });
    const b = await runPipeline({
      projectRoot,
      pipelineRoot,
      runMode: "test",
      previewOnly: true,
    });

    const aPreview = resolve(a.runDir, "preview");
    const bPreview = resolve(b.runDir, "preview");

    const aHashes = hashTree(aPreview);
    const bHashes = hashTree(bPreview);

    expect(aHashes.size).toBeGreaterThan(0);
    expect([...aHashes.keys()].sort()).toEqual([...bHashes.keys()].sort());

    for (const [file, hashA] of aHashes) {
      const hashB = bHashes.get(file);
      expect(hashA, `mismatch at ${file}`).toBe(hashB);
    }
  }, 15_000);

  it("manifest.status is ready_for_review on a clean run", async () => {
    const out = await runPipeline({
      projectRoot,
      pipelineRoot,
      runMode: "test",
      previewOnly: true,
    });
    expect(out.manifest.status).toBe("ready_for_review");
    expect(out.manifest.conflicts).toEqual([]);
    expect(out.manifest.missing_required).toEqual([]);
    expect(out.manifest.schema_failures).toEqual([]);
  }, 15_000);

  it("emits exactly one sidecar per MDX review (1:1 mapping)", async () => {
    // [Phase 5.0b] Corpus grew from Athene-only (2 reviews) to Athene +
    // 10 wave-1 carriers (22 reviews). The structural invariant this
    // test asserts is 1:1 mapping: exactly one sidecar per MDX file,
    // with no duplicates and no orphans. We verify by counting and by
    // checking uniqueness, not by matching a hardcoded slug list.
    const { readdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const mdxFiles = readdirSync(resolve(projectRoot, "src/content/reviews"))
      .filter((f) => f.endsWith(".mdx"));

    const out = await runPipeline({
      projectRoot,
      pipelineRoot,
      runMode: "test",
      previewOnly: true,
    });
    const reviewSlugs = out.normalize.reviews.map((r) => r.slug);
    expect(reviewSlugs.length).toBe(mdxFiles.length);
    expect(new Set(reviewSlugs).size).toBe(reviewSlugs.length); // unique
    // Athene pilot must still be present after wave-1 expansion.
    expect(reviewSlugs).toContain("athene");
    expect(reviewSlugs).toContain("athene-performance-elite");
  }, 15_000);
});
