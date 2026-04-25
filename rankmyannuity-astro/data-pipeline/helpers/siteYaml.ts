// [Phase 5] Reader for data-pipeline/sources/site.yml.
//
// Missing file is treated as a HARD ERROR — site.yml drives public-facing
// feature flags and a missing file should never be silently defaulted.
// Malformed or schema-violating content is also a hard error.

import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { SiteConfigSchema, type SiteConfig } from "../schemas/site.ts";

export function readSiteYaml(filePath: string): SiteConfig {
  if (!existsSync(filePath)) {
    throw new Error(
      `site.yml not found at ${filePath}. This file is required; create it with at least { top_myga_public: false }.`,
    );
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  return SiteConfigSchema.parse(parsed);
}
