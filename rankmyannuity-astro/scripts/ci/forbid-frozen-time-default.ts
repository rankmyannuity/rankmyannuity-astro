#!/usr/bin/env tsx
// [Phase 5] CI gate: forbid any persistent workflow from setting
// PIPELINE_FROZEN_TIME or PIPELINE_ALLOW_FROZEN_PUBLISH as a default.
//
// Rationale: PIPELINE_FROZEN_TIME pins `now()` to a deterministic value
// for the idempotency test harness only. If a persistent workflow (an
// npm script in package.json, a GitHub Actions workflow, a Dockerfile,
// a Makefile, etc.) were to export it by default, we'd commit manifests
// whose run_id is a hardcoded test timestamp rather than real wall-clock —
// silently defeating the wall-clock regression gate in publish-data.
//
// Same reasoning for PIPELINE_ALLOW_FROZEN_PUBLISH=1: that escape hatch
// is meant to be set only inline, by the idempotency test, for a single
// invocation.
//
// Exceptions:
//   - data-pipeline/__tests__/**        (test fixtures set it via process.env)
//   - scripts/ci/forbid-frozen-time-default.ts (this file — references)
//   - node_modules/**                    (never scanned)
//
// Detection rule: a line that assigns/exports these env vars in a
// persistent config file. We search for matches in well-known locations
// rather than walking the entire repo, to avoid false positives.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const projectRoot = process.cwd();

// Files/dirs checked for persistent env assignments. Tests and *.test.ts
// are NOT in this list — they're allowed to set PIPELINE_FROZEN_TIME at
// runtime via process.env.
const CHECK_TARGETS: string[] = [
  "package.json",
  "Makefile",
  "Dockerfile",
  ".github/workflows",
  ".gitlab-ci.yml",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".env",
  ".env.production",
  ".env.ci",
];

const FORBIDDEN_VARS = [
  "PIPELINE_FROZEN_TIME",
  "PIPELINE_ALLOW_FROZEN_PUBLISH",
] as const;

// Match an assignment in shell / package.json script / workflow yaml /
// Dockerfile ENV / .env style. Intentionally broad — any occurrence in
// a persistent config file is suspect.
function lineAssignsForbiddenVar(line: string): string | null {
  for (const name of FORBIDDEN_VARS) {
    // Patterns:
    //   KEY=value              (.env, shell, package.json inline)
    //   KEY: value             (YAML env maps)
    //   ENV KEY value          (Dockerfile)
    //   ENV KEY=value          (Dockerfile)
    //   "env": { "KEY": ... }  (workflow)
    const patterns = [
      new RegExp(`\\b${name}\\s*[:=]`),
      new RegExp(`ENV\\s+${name}\\b`),
      new RegExp(`"${name}"\\s*:`),
    ];
    for (const p of patterns) {
      if (p.test(line)) return name;
    }
  }
  return null;
}

function scanFile(filePath: string): Array<{ line: number; name: string; text: string }> {
  const hits: Array<{ line: number; name: string; text: string }> = [];
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const name = lineAssignsForbiddenVar(lines[i]);
    if (name) hits.push({ line: i + 1, name, text: lines[i].trim() });
  }
  return hits;
}

function scanPath(abs: string): Array<{ file: string; line: number; name: string; text: string }> {
  const out: Array<{ file: string; line: number; name: string; text: string }> = [];
  if (!existsSync(abs)) return out;

  const stat = statSync(abs);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(abs)) {
      out.push(...scanPath(join(abs, entry)));
    }
  } else {
    for (const h of scanFile(abs)) {
      out.push({ file: abs, ...h });
    }
  }
  return out;
}

function main(): number {
  const hits: Array<{ file: string; line: number; name: string; text: string }> = [];
  for (const t of CHECK_TARGETS) {
    hits.push(...scanPath(resolve(projectRoot, t)));
  }

  if (hits.length === 0) {
    console.log(
      `[ci:forbid-frozen-time-default] OK — no persistent config sets PIPELINE_FROZEN_TIME / PIPELINE_ALLOW_FROZEN_PUBLISH.`,
    );
    return 0;
  }

  console.error(
    `[ci:forbid-frozen-time-default] FAIL: ${hits.length} forbidden assignment(s) found:`,
  );
  for (const h of hits) {
    const rel = h.file.replace(projectRoot + "/", "");
    console.error(`  - ${rel}:${h.line}  ${h.name}    ${h.text}`);
  }
  console.error();
  console.error(
    `PIPELINE_FROZEN_TIME is a test-only env var. Set it inline for a single invocation`,
  );
  console.error(
    `(e.g. "PIPELINE_FROZEN_TIME=... vitest run") — never as a persistent default.`,
  );
  return 1;
}

process.exit(main());
