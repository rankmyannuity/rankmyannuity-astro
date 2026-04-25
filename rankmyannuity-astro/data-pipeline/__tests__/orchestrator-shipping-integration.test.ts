// [Phase 6.0a-step-1] Integration test for the two-layer shipping-sha256
// enforcement contract — exercises the FULL orchestrator → normalize path,
// NOT a manually-constructed Map<slug, sha>.
//
// Motivation: the prior `phase5.test.ts` coverage of
// applyShippingSha256Downgrade bypassed the orchestrator's lookup-building
// by constructing Map<slug, sha> directly. That bypass masked a real bug
// (orchestrator.ts lines 64-66 resolving an Astro collection id as a
// filesystem path, causing every readFileSync to ENOENT-silently and the
// lookup to always be empty). See PHASE6A_STEP1_FINDINGS.md, the three
// flag-and-stop documents, and SHIPPING_SHA256_CONTRACT.md for the full
// audit trail and the fix.
//
// Assertion shape: per flag-and-stop #3 Option α ratification, we assert
// against the EMITTED sidecar schema (ReviewSidecarSchema):
//   - sidecar.status is "live" | "not_live" (NOT "shipping" | "pilot")
//   - sidecar.not_live_cause disambiguates which downgrade cause fired
//   - downgrade notes are asserted against NormalizeOutput.notes
//     (the source-of-truth for REVIEW.md content), not a (nonexistent)
//     sidecar.downgrade_notes field.
//
// Fixture mechanism: per flag-and-stop #3 (5b) ratification, we build a
// minimal temp-dir project root per case by copying the real project's
// src/content/reviews/, data-pipeline/sources/, and data-pipeline/fixtures/
// trees (cpSync recursive), then mutating only the files each case needs
// to vary (the target carrier MDX and/or carriers.shipping.yml). Adapter
// fixtures and benchmark sources are reused verbatim from the real tree —
// do NOT reinvent offline adapter fixtures (explicit directive).
//
// Case summary (per flag-and-stop #3 + #4 resolution):
//   1. Valid shipping approval + matching on-disk bytes       → sidecar live
//   2. Valid shipping approval + mismatched sha               → downgrade (mismatch note)
//   3. Valid shipping approval + MDX missing on disk          → no sidecar emitted, pipeline completes
//   4. Empty approvals + pilot-status carrier (pass-through)  → sidecar not_live/pilot_carrier, no sha note
//
// Case 3 note (flag-and-stop #4, Option A): the "could not be computed"
// downgrade branch of applyShippingSha256Downgrade is architecturally
// unreachable from a black-box integration test because loadMdxReviews
// and the orchestrator sha-loop live in the same synchronous runPipeline
// call and both read from disk; a file absent at load time means no
// corpus record at iteration time, so the branch's loop guard fails
// before the could-not-compute check. That branch is covered by
// phase5.test.ts:128-147 directly at the normalize layer. See the long
// inline comment block inside case 3's body for the full constraint
// analysis, and SHIPPING_SHA256_CONTRACT.md §Layer 2 ›
// "Coverage split between integration and unit layers" for the
// coverage boundary.
//
// Case (5) — "shipping-without-approval" branch — deferred per reviewer
// disposition; noted in PHASE6A_STEP1_CHECKLIST.md as a future nice-to-have.

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  mkdtempSync,
  cpSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

import { runPipeline } from "../cli/orchestrator.js";
import { carrierReviewMdxPath } from "../helpers/carrierReviewMdxPath.js";

const realProjectRoot = resolve(__dirname, "..", "..");
const realPipelineRoot = resolve(__dirname, "..");

// Slug we use for the shipping-status carrier under test. We use
// pacific-life because (a) it's a real carrier in the corpus with a
// linked MYGA product (pacific-life-pacific-harbor) and a rate in
// rates.myga.yml (5.15% 5-yr, effective 2026-04-16), so the
// top_myga_5yr benchmark can go live without fixture engineering;
// (b) flipping its status from pilot to shipping requires adding
// shipping_criteria — a local MDX edit, no cross-file coordination;
// (c) it is still in pilot status at the end of 6.0a-step-4 (which
// promoted new-york-life; no other wave-1 carriers were promoted).
//
// This TEST_SLUG must point to a carrier that is still in pilot
// status. Each time a new carrier is promoted to shipping (6.0a-step-4
// promoted new-york-life; a future step may promote pacific-life;
// etc.), TEST_SLUG must be updated in the same work unit to a carrier
// that is still pilot. This is Option 3-A from the 6.0a-step-4
// flag-and-stop #3 resolution. The permanent decoupling (Option 3-B:
// synthesize a minimal fixture MDX) is deferred to Phase 6.0c or
// later data-model cleanup to avoid scope creep in promotion sub-steps.
const TEST_SLUG = "pacific-life";

beforeAll(() => {
  process.env.PIPELINE_OFFLINE = "1";
  process.env.PIPELINE_FROZEN_TIME = "2026-04-22T20:00:00.000Z";
  delete process.env.FRED_API_KEY;
});

// Track temp dirs so each test cleans up its own.
const createdDirs: string[] = [];
afterEach(() => {
  while (createdDirs.length) {
    const dir = createdDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

// ─── Fixture builder ─────────────────────────────────────────────────
//
// Constructs a temp-dir project that mirrors the real project's layout,
// then returns the paths runPipeline needs. Callers mutate specific files
// via the returned helpers before invoking runPipeline.

interface Fixture {
  projectRoot: string;
  pipelineRoot: string;
  mdxPath: string;
  shippingYamlPath: string;
}

function buildFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "phase6a-shipping-int-"));
  createdDirs.push(root);

  const projectRoot = root;
  const pipelineRoot = join(projectRoot, "data-pipeline");

  // Copy real project content/reviews (minimal MDX corpus we can mutate).
  cpSync(
    resolve(realProjectRoot, "src/content/reviews"),
    resolve(projectRoot, "src/content/reviews"),
    { recursive: true },
  );

  // Copy real data-pipeline sources + fixtures so benchmarks, rates,
  // site flags, and offline-adapter JSON fixtures are all present.
  cpSync(
    resolve(realPipelineRoot, "sources"),
    resolve(pipelineRoot, "sources"),
    { recursive: true },
  );
  cpSync(
    resolve(realPipelineRoot, "fixtures"),
    resolve(pipelineRoot, "fixtures"),
    { recursive: true },
  );

  return {
    projectRoot,
    pipelineRoot,
    mdxPath: carrierReviewMdxPath(projectRoot, TEST_SLUG),
    shippingYamlPath: resolve(pipelineRoot, "sources", "carriers.shipping.yml"),
  };
}

// Promote the test carrier's MDX from status:"pilot" to status:"shipping".
// This is a pure-text edit on the frontmatter so the resulting MDX stays
// schema-valid (shipping requires shipping_criteria with all booleans).
function promoteCarrierToShipping(mdxPath: string): void {
  const before = readFileSync(mdxPath, "utf8");
  // Replace the single authored line and inject shipping_criteria just
  // above it. The rest of the frontmatter (author, carrier block, sources)
  // already satisfies the schema.
  const after = before.replace(
    'status: "pilot"',
    [
      "shipping_criteria:",
      "  rates_logged: true",
      "  products_reviewed: true",
      "  legal_approved: true",
      "  compliance_approved: true",
      "  sme_reviewed: true",
      'status: "shipping"',
    ].join("\n"),
  );
  if (after === before) {
    throw new Error(
      `fixture precondition failed: could not find 'status: "pilot"' in ${mdxPath}`,
    );
  }
  writeFileSync(mdxPath, after);
}

function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeShippingYaml(path: string, body: string): void {
  writeFileSync(path, body);
}

// ─── Cases ───────────────────────────────────────────────────────────

describe("orchestrator → normalize shipping-sha256 integration", () => {
  it(
    "case 1 — matching sha: shipping carrier stays live in the emitted sidecar",
    async () => {
      const fx = buildFixture();

      // Promote NYL to shipping, then pin the sha of the promoted MDX
      // into the test-scoped carriers.shipping.yml.
      promoteCarrierToShipping(fx.mdxPath);
      const sha = sha256OfFile(fx.mdxPath);
      writeShippingYaml(
        fx.shippingYamlPath,
        [
          "approvals:",
          `  - carrier_slug: "${TEST_SLUG}"`,
          `    mdx_path: "reviews/${TEST_SLUG}"`,
          `    mdx_sha256: "${sha}"`,
          '    approved_by: "integration-test"',
          '    approved_at: "2026-04-22"',
          '    notes: "case-1-matching-sha"',
          "",
        ].join("\n"),
      );

      const out = await runPipeline({
        projectRoot: fx.projectRoot,
        pipelineRoot: fx.pipelineRoot,
        runMode: "test",
        previewOnly: true,
      });

      const sidecar = out.normalize.reviews.find((r) => r.slug === TEST_SLUG);
      expect(sidecar).toBeDefined();
      // Matching sha ⇒ shipping stays live (benchmark is also live in the
      // copied corpus — NYL's 5-yr MYGA rate is fresh).
      expect(sidecar!.status).toBe("live");
      expect(sidecar!.not_live_cause).toBeNull();
      // No sha-related note should have been appended for this slug.
      expect(
        out.normalize.notes.some(
          (n) => n.includes(TEST_SLUG) && /sha256|does not match|could not be computed/i.test(n),
        ),
      ).toBe(false);

      // Sanity — confirm the helper resolved to the correct absolute path.
      expect(fx.mdxPath.endsWith(`src/content/reviews/${TEST_SLUG}.mdx`)).toBe(true);
      expect(existsSync(fx.mdxPath)).toBe(true);
    },
    30_000,
  );

  it(
    "case 2 — mismatched sha: shipping carrier is downgraded, mismatch note emitted",
    async () => {
      const fx = buildFixture();

      promoteCarrierToShipping(fx.mdxPath);
      // Pin a DIFFERENT sha (64 hex chars, deliberately not matching).
      const wrongSha = "a".repeat(64);
      writeShippingYaml(
        fx.shippingYamlPath,
        [
          "approvals:",
          `  - carrier_slug: "${TEST_SLUG}"`,
          `    mdx_path: "reviews/${TEST_SLUG}"`,
          `    mdx_sha256: "${wrongSha}"`,
          '    approved_by: "integration-test"',
          '    approved_at: "2026-04-22"',
          '    notes: "case-2-mismatched-sha"',
          "",
        ].join("\n"),
      );

      const out = await runPipeline({
        projectRoot: fx.projectRoot,
        pipelineRoot: fx.pipelineRoot,
        runMode: "test",
        previewOnly: true,
      });

      const sidecar = out.normalize.reviews.find((r) => r.slug === TEST_SLUG);
      expect(sidecar).toBeDefined();
      expect(sidecar!.status).toBe("not_live");
      expect(sidecar!.not_live_cause).toBe("pilot_carrier");
      expect(
        out.normalize.notes.some(
          (n) => n.includes(TEST_SLUG) && /does not match current MDX/i.test(n),
        ),
      ).toBe(true);
    },
    30_000,
  );

  it(
    "case 3 — MDX missing on disk: no sidecar emitted, pipeline completes",
    async () => {
      const fx = buildFixture();

      // Note: we do NOT promote the carrier MDX to shipping this time —
      // the file will be deleted below. Instead we register an approval
      // for a slug whose MDX file is absent. We use the test slug's
      // path but delete the file first; the approval tells normalize
      // this carrier was supposed to be shipping.
      //
      // We still need the MDX present long enough to be discovered in
      // the corpus (normalize only considers records that loadMdxReviews
      // returned). So we promote it to shipping, delete the FILE on disk
      // after loadMdxReviews runs... but loadMdxReviews runs inside
      // runPipeline, so we can't interleave. Alternative: keep the MDX
      // but make the orchestrator fail to hash it by making the file
      // unreadable between adapter load and sha computation. That's
      // racy and brittle.
      //
      // Pragmatic approach — register an approval for a slug whose MDX
      // is not in the corpus at all. applyShippingSha256Downgrade at
      // normalize/index.ts:233 iterates mdx.carriers ∪ mdx.products; if
      // a slug isn't in the corpus, the downgrade function never sees
      // it. So a genuinely-missing MDX won't exercise the
      // "could-not-compute" branch — it simply won't produce any sidecar.
      //
      // The ACTUAL code path that triggers "could not be computed" is:
      // MDX record exists in the corpus, but mdxSha256(abs) throws
      // inside the orchestrator's try/catch at lines 64-78. This can be
      // forced by making the carrierReviewMdxPath(projectRoot, slug)
      // resolve to a file that doesn't exist. But in Layer 2, the
      // helper derives from rec.slug — meaning the slug must appear in
      // the MDX corpus yet NOT have a real file at the expected path.
      //
      // The only reliable way to produce this state: delete the file
      // after the adapter has loaded it into the corpus. loadMdxReviews
      // reads frontmatter eagerly (readFileSync at mdx.ts:73) so the
      // record is in memory; the subsequent mdxSha256(abs) re-reads the
      // file and will ENOENT.
      //
      // Since loadMdxReviews and the sha256 loop live inside the same
      // runPipeline call, we cannot interleave from outside the
      // function. Instead: we keep the MDX file present, promote it to
      // shipping (so the corpus has the record), pin a matching sha in
      // shipping.yml so the approval is structurally valid, THEN rename
      // the file after buildFixture but before runPipeline. This only
      // works if loadMdxReviews re-reads the file (it does not — it
      // reads eagerly). So the record will be in the corpus with a
      // stale-but-correct sha, and the subsequent mdxSha256 in the
      // orchestrator loop will ENOENT.
      //
      // Wait: if loadMdxReviews already read the file when it was
      // present, the record exists. Then orchestrator calls mdxSha256
      // on the now-deleted file — that throws. The try/catch swallows.
      // The slug is not in sha256Lookup. applyShippingSha256Downgrade
      // emits "could not be computed". ✓
      //
      // The trick hinges on loadMdxReviews's eager read + orchestrator's
      // separate lazy re-read being TWO filesystem touches of the same
      // path. Confirmed at adapters/mdx.ts:73 (eager) and orchestrator.ts:74
      // (helper-derived path → mdxSha256 → readFileSync, separate from
      // the adapter's earlier read).
      //
      // Implementation: promote, pin sha, delete file AFTER the pipeline
      // starts is impossible from userspace. But the adapter's read
      // happens first in runPipeline's call stack (line 51 loads mdx
      // BEFORE line 74 hashes). So if we delete the file AFTER calling
      // loadMdxReviews ourselves... no, we don't control that.
      //
      // Cleanest alternative: don't delete the file. Keep the record
      // in the corpus but make the helper-derived path resolve to a
      // path that doesn't exist by using a slug whose file we delete
      // BEFORE pipeline start. But then loadMdxReviews won't see it
      // either — so not in corpus — so applyShippingSha256Downgrade
      // never tries to hash it.
      //
      // Conclusion: in the current architecture, case (3) as literally
      // described (MDX-missing-on-disk-at-hash-time while present-at-
      // corpus-load-time) is only reproducible by interleaving inside
      // runPipeline, which is not possible from a black-box integration
      // test. FLAGGED in the test body below — the assertion we CAN
      // make is the degenerate one: a shipping approval for a slug
      // absent from the corpus emits no sidecar for that slug. That's
      // a useful regression check but does not exercise the "could not
      // be computed" branch.
      //
      // To actually exercise "could not be computed", we need to make
      // mdxSha256(abs) throw while the record is in the corpus. One
      // robust way: symlink the MDX path to a non-existent target
      // before the pipeline runs. loadMdxReviews uses readdirSync +
      // readFileSync; readdirSync sees the symlink as a file entry,
      // and readFileSync will follow the broken symlink and throw
      // ENOENT — which loadMdxReviews itself would fail on.
      //
      // Alternative that actually works: construct a DIFFERENT slug
      // whose MDX file we WRITE then DELETE, exploiting the fact that
      // we control timing before calling runPipeline:
      //
      //   - Write a new minimal carrier MDX at a temp slug.
      //   - Add a shipping approval for that slug.
      //   - CHMOD the MDX file to 000 just before runPipeline → reads
      //     will throw EACCES in loadMdxReviews too → the record won't
      //     be in the corpus.
      //
      // This is getting brittle. Per the reviewer's "If this observation
      // surfaces a fifth ambiguity, flag and stop before asserting" rule
      // (which covered case 4 explicitly, but the same spirit applies
      // when a directed case turns out unreproducible), we degrade
      // case (3) to the strongest-assertable claim:
      //
      //   Given a shipping approval whose target MDX cannot be hashed
      //   by the orchestrator, normalize emits a downgrade. The
      //   specific "could not be computed" branch is asserted via the
      //   existing unit tests in phase5.test.ts:128-147 (direct call
      //   with empty sha lookup), so integration coverage here adds
      //   value by confirming the orchestrator-normalize wire-up
      //   itself, not by duplicating the branch assertion.
      //
      // Pragmatic test: promote NYL to shipping, pin a correct sha,
      // then rename the file from new-york-life.mdx to a non-matching
      // name BEFORE runPipeline. loadMdxReviews will not find a
      // new-york-life.mdx at all → the record won't be in the corpus.
      // applyShippingSha256Downgrade iterates corpus records only —
      // missing-from-corpus slugs don't trigger the downgrade path.
      //
      // So this approach doesn't exercise the branch either.
      //
      // Final pragmatic test (documented limitation): we assert that
      // an approval targeting a genuinely-absent MDX file produces NO
      // sidecar (because loadMdxReviews never surfaces a record for
      // the missing file) and that no "shipping" sidecar is emitted
      // for that slug. The "could not be computed" code path remains
      // covered by the phase5.test.ts unit (direct empty-lookup call).
      //
      // We document this limitation inline for the next reviewer.

      promoteCarrierToShipping(fx.mdxPath);
      const shaBefore = sha256OfFile(fx.mdxPath);

      // Now delete the MDX file entirely.
      rmSync(fx.mdxPath);
      expect(existsSync(fx.mdxPath)).toBe(false);

      // Pin the pre-deletion sha. The approval references a slug whose
      // file no longer exists; loadMdxReviews won't surface a record.
      writeShippingYaml(
        fx.shippingYamlPath,
        [
          "approvals:",
          `  - carrier_slug: "${TEST_SLUG}"`,
          `    mdx_path: "reviews/${TEST_SLUG}"`,
          `    mdx_sha256: "${shaBefore}"`,
          '    approved_by: "integration-test"',
          '    approved_at: "2026-04-22"',
          '    notes: "case-3-mdx-missing"',
          "",
        ].join("\n"),
      );

      const out = await runPipeline({
        projectRoot: fx.projectRoot,
        pipelineRoot: fx.pipelineRoot,
        runMode: "test",
        previewOnly: true,
      });

      // Documented limitation (see long comment above): the "could not
      // be computed" branch is not reachable from a black-box integration
      // test in the current architecture (loadMdxReviews + orchestrator
      // sha-loop are sequential inside runPipeline, both read from disk;
      // if the file is absent before runPipeline, the record is absent
      // from the corpus, and applyShippingSha256Downgrade never tries
      // to hash it). The integration-observable claim here is:
      //
      //   An approval targeting a slug whose MDX is not on disk
      //   produces NO sidecar for that slug AND does not crash the
      //   pipeline. The existing phase5.test.ts:128-147 direct-call
      //   test covers the "could not be computed" note emission via
      //   the normalize layer in isolation.
      const sidecar = out.normalize.reviews.find((r) => r.slug === TEST_SLUG);
      expect(sidecar).toBeUndefined();
      // And the run completed (didn't throw).
      expect(out.runId).toBeDefined();
    },
    30_000,
  );

  it(
    "case 4 — empty approvals + pilot-status carrier: pass-through, not_live/pilot_carrier, no sha note",
    async () => {
      const fx = buildFixture();

      // Leave the carrier at its real status: "pilot" (no promotion).
      // Write an explicitly-empty approvals list.
      writeShippingYaml(fx.shippingYamlPath, "approvals: []\n");

      const out = await runPipeline({
        projectRoot: fx.projectRoot,
        pipelineRoot: fx.pipelineRoot,
        runMode: "test",
        previewOnly: true,
      });

      const sidecar = out.normalize.reviews.find((r) => r.slug === TEST_SLUG);
      expect(sidecar).toBeDefined();
      // Pilot → not_live/pilot_carrier per deriveReviewLiveness precedence.
      expect(sidecar!.status).toBe("not_live");
      expect(sidecar!.not_live_cause).toBe("pilot_carrier");
      // No sha-related downgrade note for this slug.
      expect(
        out.normalize.notes.some(
          (n) => n.includes(TEST_SLUG) && /sha256|does not match|could not be computed/i.test(n),
        ),
      ).toBe(false);
    },
    30_000,
  );

  // ─── Bonus: manual path resolution verification ─────────────────────
  //
  // Per reviewer directive: "Confirm by manual path-resolution that
  // carrierReviewMdxPath(projectRoot, 'new-york-life') returns
  // .../src/content/reviews/new-york-life.mdx (not .../reviews/
  // new-york-life as the broken orchestrator currently does)."

  it("carrierReviewMdxPath resolves to src/content/reviews/<slug>.mdx, not the Astro collection id form", () => {
    const p = carrierReviewMdxPath(realProjectRoot, "new-york-life");
    expect(p).toBe(resolve(realProjectRoot, "src/content/reviews/new-york-life.mdx"));
    // Negative check — the BROKEN form the orchestrator used to compute.
    expect(p).not.toBe(resolve(realProjectRoot, "reviews/new-york-life"));
  });
});
