#!/usr/bin/env tsx
// [Phase 6.0a-step-4] CI gate: enforces the shipping-review rendering
// contract against BUILT OUTPUT (dist/), not against MDX frontmatter.
//
// Why built-output, not frontmatter? Because a renderer bug that strips
// shipping status to pilot chrome would pass a frontmatter check but
// must fail this one. This is the whole reason F1-C exists (PHASE6_KICKOFF.md
// §3, ratified 2026-04-22).
//
// Contract source of truth: PHASE5_CLOSEOUT.md §3 invariants table,
// row "Shipping-review rendering contract".
//
// ─── Assertions (per 6.0a-step-4 flag-and-stop #4 ratification) ──────────
//
// For each MDX with status: "shipping" (and not retired):
//   (S1)  No pilot chip in dist/reviews/<slug>/index.html.
//         Identifier: data-testid="not-live-chip" (NOT_LIVE_CHIP_TESTID
//         from src/lib/ui/liveness.ts).
//   (S2)  No noindex/nofollow in any robots meta tag.
//   (S3a) Exactly one <link rel="canonical" href="..."> in <head>, with
//         href equal to https://rankmyannuity.pro/reviews/<slug> (exact,
//         no trailing slash, per astro.config.mjs trailingSlash: "never").
//   (S3b) Indexable meta robots — restated framing of S2; collapsed into
//         a single check here because the positive/negative conditions
//         are logically identical (the tag's content has no noindex and
//         no nofollow).
//
// For each MDX with status: "pilot" (and not retired):
//   (P1) Pilot chip present (data-testid="not-live-chip" appears ≥1×).
//   (P2) noindex AND nofollow both appear in some robots meta content
//        (case-insensitive substring; order-independent).
//
// For each MDX with status: "retired" OR sidecar not_live_cause
// "retired_carrier":
//   Excluded from both S and P series. Empty set in current corpus is
//   expected and is NOT a flag-and-stop.
//
// ─── Failure mode ────────────────────────────────────────────────────────
//
// Exit code 2 on any assertion failure (distinct from source-linter gates
// which use exit 1; the distinction is intentional — see step-4 flag-and-
// stop #4 disposition (i)).
//
// Per-review error blocks list: (a) slug, (b) status, (c) failing
// assertion id, (d) ~20 lines of HTML context, (e) remediation hint.
// Failures are collected across all reviews before exit (no short-circuit).
//
// ─── dist/ precondition ──────────────────────────────────────────────────
//
// This gate requires dist/ to exist. It does NOT invoke `astro build` —
// the aggregator (scripts/ci/ci-check.ts) stays source-only; this gate
// enforces its own precondition. Missing dist/ → exit 2 with message
// directing the reviewer to `npm run build` first.
//
// Ordering in CI: `npm run build && npm run ci:check`, OR build then
// check as separate steps. Documented in PHASE5_CLOSEOUT.md §3 invariants
// row and PHASE6_KICKOFF.md F1-C reference as an Amendment-2-style
// post-approval append.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import matter from "gray-matter";
import { NOT_LIVE_CHIP_TESTID } from "../../src/lib/ui/liveness.ts";

const projectRoot = process.cwd();
const reviewsDir = resolve(projectRoot, "src/content/reviews");
const distReviewsDir = resolve(projectRoot, "dist/reviews");
const distDir = resolve(projectRoot, "dist");

// Canonical origin — must match astro.config.mjs `site` exactly.
// trailingSlash: "never" in that config → canonical hrefs have no trailing
// slash. If the config ever diverges, per flag-and-stop #4 disposition (iv),
// the gate should flag-and-stop rather than silently accommodate; here we
// enforce the exact expected string and any divergence surfaces as an S3a
// failure, which is the right signal.
const CANONICAL_ORIGIN = "https://rankmyannuity.pro";

// Sidecar directory + shape (narrow to just the fields F1-C inspects).
const sidecarsDir = resolve(projectRoot, "src/generated/reviews");
type SidecarNotLiveCause =
  | "pilot_carrier"
  | "degraded_benchmark"
  | "empty_benchmark"
  | "retired_carrier"
  | null;
interface SidecarSlim {
  not_live_cause: SidecarNotLiveCause;
}

function readSidecar(slug: string): SidecarSlim | undefined {
  const p = join(sidecarsDir, `${slug}.json`);
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as {
      not_live_cause?: SidecarNotLiveCause;
    };
    return { not_live_cause: parsed.not_live_cause ?? null };
  } catch {
    // Malformed sidecar shouldn't block F1-C — treat as absent. The data
    // pipeline has its own validation; we don't duplicate that surface here.
    return undefined;
  }
}

// ─── HTML reading ───────────────────────────────────────────────────────

function readRenderedHtml(slug: string): string | null {
  // Astro build.format: "directory" + trailingSlash: "never" → each route
  // /reviews/<slug> emits dist/reviews/<slug>/index.html.
  const htmlPath = join(distReviewsDir, slug, "index.html");
  if (!existsSync(htmlPath)) return null;
  return readFileSync(htmlPath, "utf-8");
}

// ─── Assertion primitives ───────────────────────────────────────────────

function hasPilotChip(html: string): boolean {
  // data-testid may be double-quoted or single-quoted depending on
  // minification; Astro emits double by default but we tolerate both.
  const needle1 = `data-testid="${NOT_LIVE_CHIP_TESTID}"`;
  const needle2 = `data-testid='${NOT_LIVE_CHIP_TESTID}'`;
  return html.includes(needle1) || html.includes(needle2);
}

interface RobotsTag {
  fullTag: string;
  content: string;
  index: number; // offset into HTML, for context extraction
}

function extractRobotsTags(html: string): RobotsTag[] {
  // Match <meta name="robots" ... content="..."> and the same with
  // attribute order swapped. Also match name="googlebot" — per
  // liveness.ts notLiveMetaTags(), both are emitted on not-live pages
  // and both are in scope of the "noindex robots meta" contract.
  const out: RobotsTag[] = [];
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0];
    const nameMatch = /\bname\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!nameMatch) continue;
    const name = nameMatch[1].toLowerCase();
    if (name !== "robots" && name !== "googlebot") continue;
    const contentMatch = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag);
    const content = contentMatch ? contentMatch[1] : "";
    out.push({ fullTag: tag, content, index: m.index });
  }
  return out;
}

function robotsContainsNoindexOrNofollow(tags: RobotsTag[]): {
  hit: RobotsTag | null;
  which: "noindex" | "nofollow" | null;
} {
  for (const t of tags) {
    const c = t.content.toLowerCase();
    if (c.includes("noindex")) return { hit: t, which: "noindex" };
    if (c.includes("nofollow")) return { hit: t, which: "nofollow" };
  }
  return { hit: null, which: null };
}

function robotsHasBothNoindexAndNofollow(tags: RobotsTag[]): boolean {
  // P2: noindex AND nofollow both appear in SOME robots meta (not
  // necessarily the same one). Evaluate content union.
  let sawNoindex = false;
  let sawNofollow = false;
  for (const t of tags) {
    const c = t.content.toLowerCase();
    if (c.includes("noindex")) sawNoindex = true;
    if (c.includes("nofollow")) sawNofollow = true;
  }
  return sawNoindex && sawNofollow;
}

interface CanonicalTag {
  fullTag: string;
  href: string;
  index: number;
}

function extractCanonicalLinks(html: string): CanonicalTag[] {
  // Scope to <head>...</head> to avoid matching any stray <link> in body
  // (which would be invalid HTML but defensive parsing is cheap).
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const scope = headMatch ? headMatch[1] : html;
  const scopeOffset = headMatch ? headMatch.index + headMatch[0].indexOf(headMatch[1]) : 0;

  const out: CanonicalTag[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(scope)) !== null) {
    const tag = m[0];
    const relMatch = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!relMatch) continue;
    if (relMatch[1].toLowerCase().trim() !== "canonical") continue;
    const hrefMatch = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag);
    const href = hrefMatch ? hrefMatch[1] : "";
    out.push({ fullTag: tag, href, index: scopeOffset + m.index });
  }
  return out;
}

// ─── Error reporting ────────────────────────────────────────────────────

interface Failure {
  slug: string;
  status: string;
  assertion: "S1" | "S2" | "S3a" | "S3b" | "P1" | "P2";
  message: string;
  hint: string;
  contextIndex: number | null; // byte offset into the HTML for context window
  html: string;
}

function formatContext(html: string, index: number | null): string {
  if (index === null) return "(no HTML context available)";
  // Find ~10 lines before and after the index for ~20-line context.
  const lines = html.split(/\r?\n/);
  // Compute the line number for index.
  let running = 0;
  let lineNo = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length + 1; // +1 for the newline
    if (running + len > index) {
      lineNo = i;
      break;
    }
    running += len;
  }
  const start = Math.max(0, lineNo - 10);
  const end = Math.min(lines.length, lineNo + 11);
  const width = String(end).length;
  const slice: string[] = [];
  for (let i = start; i < end; i++) {
    const marker = i === lineNo ? ">" : " ";
    const n = String(i + 1).padStart(width, " ");
    slice.push(`      ${marker} ${n}  ${lines[i]}`);
  }
  return slice.join("\n");
}

function printFailure(f: Failure): void {
  console.error(
    `  - [${f.assertion}] ${f.slug} (status=${f.status}): ${f.message}`,
  );
  console.error(`      hint: ${f.hint}`);
  console.error(formatContext(f.html, f.contextIndex));
}

// ─── Main ───────────────────────────────────────────────────────────────

interface ReviewRecord {
  slug: string;
  file: string;
  status: string; // raw frontmatter value
  notLiveCause: SidecarNotLiveCause;
}

function collectReviews(): ReviewRecord[] {
  if (!existsSync(reviewsDir)) {
    throw new Error(`reviews directory missing at ${reviewsDir}`);
  }
  const out: ReviewRecord[] = [];
  const files = readdirSync(reviewsDir).filter((f) => f.endsWith(".mdx"));
  for (const file of files) {
    const full = join(reviewsDir, file);
    const raw = readFileSync(full, "utf-8");
    const { data: fm } = matter(raw);
    const status = typeof fm.status === "string" ? fm.status : "";
    // Slug resolution mirrors [...slug].astro line 81 and the data pipeline:
    // prefer frontmatter `slug` if present, else derive from filename.
    const slug =
      typeof fm.slug === "string" && fm.slug.length > 0
        ? fm.slug
        : file.replace(/\.mdx$/, "");
    const sidecar = readSidecar(slug);
    out.push({
      slug,
      file,
      status,
      notLiveCause: sidecar?.not_live_cause ?? null,
    });
  }
  return out;
}

function isRetired(r: ReviewRecord): boolean {
  // Per flag-and-stop #4 disposition (iii): retired if frontmatter
  // status === "retired" OR sidecar not_live_cause === "retired_carrier".
  return r.status === "retired" || r.notLiveCause === "retired_carrier";
}

function assertShipping(r: ReviewRecord, html: string): Failure[] {
  const failures: Failure[] = [];

  // S1 — no pilot chip.
  if (hasPilotChip(html)) {
    const idx = html.indexOf(`data-testid="${NOT_LIVE_CHIP_TESTID}"`);
    const fallbackIdx = idx >= 0 ? idx : html.indexOf(`data-testid='${NOT_LIVE_CHIP_TESTID}'`);
    failures.push({
      slug: r.slug,
      status: r.status,
      assertion: "S1",
      message: `pilot chip present (data-testid="${NOT_LIVE_CHIP_TESTID}") on a shipping review`,
      hint:
        `A shipping review must not render the pilot chip. Likely cause: ` +
        `sidecar status is not "live" — check that the mdx_sha256 in ` +
        `carriers.shipping.yml matches the current MDX bytes and that ` +
        `the pipeline has been re-published (refresh-data → publish-data).`,
      contextIndex: fallbackIdx >= 0 ? fallbackIdx : null,
      html,
    });
  }

  // S2 / S3b collapsed — no noindex or nofollow in any robots meta.
  const robots = extractRobotsTags(html);
  const violation = robotsContainsNoindexOrNofollow(robots);
  if (violation.hit) {
    failures.push({
      slug: r.slug,
      status: r.status,
      assertion: "S2",
      message: `robots meta contains "${violation.which}" on a shipping review (content="${violation.hit.content}")`,
      hint:
        `Shipping reviews must be indexable. Likely cause: sidecar not_live_cause ` +
        `triggered notLiveMetaTags() emission. Verify sidecar.status === "live" ` +
        `and no_live_cause === null for this slug in src/generated/reviews/.`,
      contextIndex: violation.hit.index,
      html,
    });
  }

  // S3a — exactly one canonical with exact href.
  const expectedHref = `${CANONICAL_ORIGIN}/reviews/${r.slug}`;
  const canonicals = extractCanonicalLinks(html);
  if (canonicals.length === 0) {
    failures.push({
      slug: r.slug,
      status: r.status,
      assertion: "S3a",
      message: `no <link rel="canonical"> tag in <head>`,
      hint:
        `Expected exactly one canonical link with href="${expectedHref}". ` +
        `BaseLayout.astro emits canonical from canonicalPath; verify the ` +
        `layout chain is intact.`,
      contextIndex: null,
      html,
    });
  } else if (canonicals.length > 1) {
    failures.push({
      slug: r.slug,
      status: r.status,
      assertion: "S3a",
      message: `found ${canonicals.length} <link rel="canonical"> tags in <head> (expected exactly 1)`,
      hint:
        `Multiple canonicals confuse crawlers. Expected exactly one with ` +
        `href="${expectedHref}". Inspect layout chain for duplicate emission.`,
      contextIndex: canonicals[0].index,
      html,
    });
  } else if (canonicals[0].href !== expectedHref) {
    failures.push({
      slug: r.slug,
      status: r.status,
      assertion: "S3a",
      message: `canonical href mismatch: got "${canonicals[0].href}", expected "${expectedHref}"`,
      hint:
        `Per flag-and-stop #4 disposition (iv): canonical href must be the ` +
        `exact string "${expectedHref}" (no trailing slash, per ` +
        `astro.config.mjs trailingSlash: "never"). If astro.config.mjs ever ` +
        `changes host/protocol/trailingSlash, treat as a canonical-contract ` +
        `violation and flag-and-stop rather than accommodating silently.`,
      contextIndex: canonicals[0].index,
      html,
    });
  }

  return failures;
}

function assertPilot(r: ReviewRecord, html: string): Failure[] {
  const failures: Failure[] = [];

  // P1 — pilot chip present.
  if (!hasPilotChip(html)) {
    failures.push({
      slug: r.slug,
      status: r.status,
      assertion: "P1",
      message: `pilot chip missing (expected data-testid="${NOT_LIVE_CHIP_TESTID}")`,
      hint:
        `A pilot review must render the NotLiveChip. Likely cause: sidecar ` +
        `status is "live" for a review whose MDX says status="pilot" — ` +
        `check that the pipeline has NOT ingested an approval entry for ` +
        `this carrier.`,
      contextIndex: null,
      html,
    });
  }

  // P2 — robots meta contains noindex AND nofollow.
  const robots = extractRobotsTags(html);
  if (!robotsHasBothNoindexAndNofollow(robots)) {
    const sawAny = robots.length > 0;
    failures.push({
      slug: r.slug,
      status: r.status,
      assertion: "P2",
      message: sawAny
        ? `robots meta does not contain both "noindex" and "nofollow" (found ${robots.length} robots tag(s))`
        : `no robots meta tag on a pilot review`,
      hint:
        `Pilot reviews must emit noindex+nofollow to keep crawlers out. ` +
        `notLiveMetaTags() in src/lib/ui/liveness.ts is the source of truth; ` +
        `verify the layout emits both <meta name="robots"> and ` +
        `<meta name="googlebot"> with content="noindex, nofollow".`,
      contextIndex: robots[0]?.index ?? null,
      html,
    });
  }

  return failures;
}

function main(): number {
  // Precondition: dist/ must exist.
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error(
      `[ci:shipping-renders-canonical] FAIL: dist/ not found. ` +
        `Run \`npm run build\` before \`npm run ci:check\`, or run ` +
        `\`npm run build && npm run ci:check\` as a combined invocation in CI.`,
    );
    return 2;
  }
  if (!existsSync(distReviewsDir)) {
    console.error(
      `[ci:shipping-renders-canonical] FAIL: dist/reviews/ not found under dist/. ` +
        `The build completed but emitted no review pages. This is almost ` +
        `certainly a build error — re-run \`npm run build\` and inspect output.`,
    );
    return 2;
  }

  let reviews: ReviewRecord[];
  try {
    reviews = collectReviews();
  } catch (err) {
    console.error(
      `[ci:shipping-renders-canonical] FAIL: ${(err as Error).message}`,
    );
    return 2;
  }

  const shipping: ReviewRecord[] = [];
  const pilot: ReviewRecord[] = [];
  const retired: ReviewRecord[] = [];
  const other: ReviewRecord[] = [];

  for (const r of reviews) {
    if (isRetired(r)) {
      retired.push(r);
      continue;
    }
    if (r.status === "shipping") shipping.push(r);
    else if (r.status === "pilot") pilot.push(r);
    else other.push(r);
  }

  const failures: Failure[] = [];
  const missingHtml: string[] = [];

  for (const r of shipping) {
    const html = readRenderedHtml(r.slug);
    if (html === null) {
      missingHtml.push(`${r.slug} (shipping)`);
      continue;
    }
    failures.push(...assertShipping(r, html));
  }

  for (const r of pilot) {
    const html = readRenderedHtml(r.slug);
    if (html === null) {
      missingHtml.push(`${r.slug} (pilot)`);
      continue;
    }
    failures.push(...assertPilot(r, html));
  }

  // Missing HTML for a reachable review is a contract failure — the build
  // should have emitted it. Count these as F1-C failures so silent drops
  // don't sneak past.
  if (missingHtml.length > 0) {
    console.error(
      `[ci:shipping-renders-canonical] FAIL: ${missingHtml.length} review(s) have MDX but no rendered HTML in dist/reviews/:`,
    );
    for (const m of missingHtml) console.error(`  - ${m}`);
    console.error();
  }

  if (failures.length === 0 && missingHtml.length === 0) {
    console.log(
      `[ci:shipping-renders-canonical] OK — shipping=${shipping.length}, pilot=${pilot.length}, retired=${retired.length}.`,
    );
    if (shipping.length > 0) {
      console.log(
        `  shipping slugs: ${shipping.map((r) => r.slug).join(", ")}`,
      );
    }
    if (pilot.length > 0) {
      console.log(`  pilot slugs: ${pilot.map((r) => r.slug).join(", ")}`);
    }
    if (retired.length > 0) {
      console.log(`  retired slugs: ${retired.map((r) => r.slug).join(", ")}`);
    }
    if (other.length > 0) {
      // A review whose status is not one of the three known values is a
      // schema violation that would already be caught upstream, but
      // surface it here for visibility rather than silently excluding.
      console.log(
        `  (note) ${other.length} review(s) with unrecognized status: ${other
          .map((r) => `${r.slug}(${r.status || "<empty>"})`)
          .join(", ")}`,
      );
    }
    return 0;
  }

  if (failures.length > 0) {
    console.error(
      `[ci:shipping-renders-canonical] FAIL: ${failures.length} rendering-contract violation(s):`,
    );
    for (const f of failures) printFailure(f);
    console.error();
  }
  console.error(
    `Summary: shipping=${shipping.length} pilot=${pilot.length} retired=${retired.length} ` +
      `failures=${failures.length} missing-html=${missingHtml.length}.`,
  );
  return 2;
}

process.exit(main());
