// emit-data — writes src/data/benchmarks.generated.ts, the generated
// module that src/data/benchmarks.ts re-exports from. The generated file
// is TypeScript (not JSON) so the calculator code can keep importing a
// typed benchmarkRates array unchanged.
//
// The file is emitted with a DO-NOT-EDIT banner and a provenance header
// listing the adapters and their as_of dates. Re-running on unchanged
// inputs produces byte-identical output.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizeOutput } from "../normalize/index.js";
import { PIPELINE_VERSION } from "../schemas/manifest.js";

export function emitBenchmarksGenerated(
  out: NormalizeOutput,
  projectRoot: string,
): string {
  const path = resolve(projectRoot, "src/data/benchmarks.generated.ts");

  const header = [
    `// ──────────────────────────────────────────────────────────────────`,
    `// GENERATED FILE — DO NOT HAND-EDIT`,
    `//`,
    `// Produced by data-pipeline/publish/emit-data.ts`,
    `// Pipeline version: ${PIPELINE_VERSION}`,
    `// To regenerate: npm run refresh-data && npm run publish-data`,
    `//`,
    `// Provenance:`,
    ...(["top_myga_5yr", "treasury_10yr", "cd_5yr_national_avg", "sp500_historical"] as const).map((k) => {
      const s = out.benchmarkPanel[k];
      return `//   - ${s.label}: ${(s.rate * 100).toFixed(2)}% as of ${s.as_of} (adapter: ${s.adapter_id})`;
    }),
    `// ──────────────────────────────────────────────────────────────────`,
    ``,
  ].join("\n");

  // Emit the SAME shape that src/data/benchmarks.ts exports today, now
  // extended with a liveness `status` field. The calculator island uses
  // `status` to render em-dash + chip when a benchmark is not live,
  // instead of collapsing a 0.00% rate into the UI.
  const body =
    `export type BenchmarkStatus = "live" | "pilot_empty" | "degraded";\n\n` +
    `export interface BenchmarkRate {\n` +
    `  label: string;\n` +
    `  rate: number;\n` +
    `  source: string;\n` +
    `  status: BenchmarkStatus;\n` +
    `}\n\n` +
    `export const benchmarkRates: readonly BenchmarkRate[] = ` +
    JSON.stringify(out.legacyBenchmarkRates, null, 2) +
    ` as const;\n`;

  writeFileSync(path, header + body);
  return path;
}
