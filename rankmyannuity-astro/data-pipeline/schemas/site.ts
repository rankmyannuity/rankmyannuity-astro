// [Phase 5] Schema for data-pipeline/sources/site.yml.
//
// See sources/site.yml for field-level documentation. Any unknown key
// fails the build (.strict()) so a typo in a feature flag can't silently
// default to false and be misread as intentional.

import { z } from "zod";

export const SiteConfigSchema = z
  .object({
    // CI-gated: true requires a non-empty qualifying 5-year MYGA corpus.
    top_myga_public: z.boolean(),
  })
  .strict();

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
