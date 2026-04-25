// mdx adapter — reads /src/content/reviews/*.mdx and returns validated
// frontmatter. Per Phase 4 brief (user verbatim):
//   "Yes — use MDX as the source of truth for carrier/product facts in
//    Phase 4. Frontmatter is authoritative for: carrier name, product name;
//    product type, line of business; core specs and constraints; verdict,
//    grade, watchouts, sources."
//
// This adapter does NOT duplicate MDX fields into a second source. It reads
// frontmatter via gray-matter, validates it against the Phase 4 schemas,
// and emits a structured record per file. If validation fails, the file is
// reported in the errors array and the orchestrator blocks the run.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { CarrierFrontmatterSchema, type CarrierFrontmatter } from "../schemas/carrier.js";
import { ProductFrontmatterSchema, type ProductFrontmatter } from "../schemas/product.js";
import {
  type AdapterResult,
  type AdapterProvenance,
  sha256Hex,
  now,
} from "./types.js";

export interface MdxReviewRecord {
  slug: string;                               // file basename (no extension)
  mdx_path: string;                           // "reviews/<slug>" — Astro collection id
  kind: "carrier" | "product";
  frontmatter: CarrierFrontmatter | ProductFrontmatter;
  body: string;                               // raw MDX body (unrendered)
  file_sha256: string;                        // for idempotency hashing
  file_path: string;                          // absolute path (for error messages)
}

export interface MdxCorpus {
  carriers: MdxReviewRecord[];
  products: MdxReviewRecord[];
}

// Reads every *.mdx file under src/content/reviews/. Validates each against
// the discriminated schema based on `kind`. Returns a corpus sorted by slug
// (for deterministic output) plus provenance.
export function loadMdxReviews(projectRoot?: string): AdapterResult<MdxCorpus> {
  const root = projectRoot ?? process.cwd();
  const reviewsDir = resolve(root, "src/content/reviews");
  const fetched_at = now();
  const notes: string[] = [];
  const errors: string[] = [];

  if (!existsSync(reviewsDir)) {
    return {
      status: "failed",
      data: null,
      provenance: emptyProv(fetched_at),
      notes,
      errors: [`reviews directory not found at ${reviewsDir}`],
    };
  }

  // Collect files deterministically (sorted by name).
  const files = readdirSync(reviewsDir)
    .filter((f) => f.endsWith(".mdx"))
    .sort();

  const carriers: MdxReviewRecord[] = [];
  const products: MdxReviewRecord[] = [];
  const hashInputs: string[] = [];

  for (const filename of files) {
    const filePath = join(reviewsDir, filename);
    const slug = filename.replace(/\.mdx$/, "");
    const raw = readFileSync(filePath, "utf8");
    const file_sha256 = sha256Hex(raw);
    hashInputs.push(file_sha256);

    // Use gray-matter only to split frontmatter from body; parse the
    // frontmatter ourselves via the `yaml` package with string-preserving
    // defaults. Otherwise js-yaml (gray-matter's default) auto-coerces ISO
    // date strings like 2026-03-05 into JS Date objects, which then fail
    // our zod string schemas. We want exactly the raw YAML scalar value
    // that the MDX author typed — MDX is authoritative, full stop.
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw, {
        engines: {
          yaml: (s: string) => parseYaml(s) as object,
        },
      });
    } catch (e) {
      errors.push(`${filename}: frontmatter parse error: ${(e as Error).message}`);
      continue;
    }

    const fm = parsed.data as { kind?: unknown };
    if (fm.kind === "carrier") {
      const result = CarrierFrontmatterSchema.safeParse(fm);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(`${filename}: ${issue.path.join(".") || "<root>"}: ${issue.message}`);
        }
        continue;
      }
      carriers.push({
        slug,
        mdx_path: `reviews/${slug}`,
        kind: "carrier",
        frontmatter: result.data,
        body: parsed.content,
        file_sha256,
        file_path: filePath,
      });
    } else if (fm.kind === "product") {
      const result = ProductFrontmatterSchema.safeParse(fm);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(`${filename}: ${issue.path.join(".") || "<root>"}: ${issue.message}`);
        }
        continue;
      }
      products.push({
        slug,
        mdx_path: `reviews/${slug}`,
        kind: "product",
        frontmatter: result.data,
        body: parsed.content,
        file_sha256,
        file_path: filePath,
      });
    } else {
      errors.push(
        `${filename}: frontmatter.kind must be "carrier" or "product" (got ${JSON.stringify(fm.kind)})`,
      );
    }
  }

  const record_count = carriers.length + products.length;
  // Combined hash: concatenate all individual file hashes in sorted order.
  // This gives a single corpus-level sha256 for the manifest.
  const corpus_sha = sha256Hex(hashInputs.join("\n"));

  const provenance: AdapterProvenance = {
    adapter_id: "mdx",
    fetched_at,
    http_status: null,
    record_count,
    sha256: corpus_sha,
    cached: false,
  };

  // Sort outputs deterministically for idempotent downstream emission.
  carriers.sort((a, b) => a.slug.localeCompare(b.slug));
  products.sort((a, b) => a.slug.localeCompare(b.slug));

  const status = errors.length > 0 ? "failed" : "ok";
  if (carriers.length === 0 && products.length === 0 && errors.length === 0) {
    notes.push("No MDX reviews found in src/content/reviews/ — pipeline will produce 0 sidecars.");
  }

  return {
    status,
    data: status === "failed" ? null : { carriers, products },
    provenance,
    notes,
    errors,
  };
}

function emptyProv(fetched_at: string): AdapterProvenance {
  return {
    adapter_id: "mdx",
    fetched_at,
    http_status: null,
    record_count: 0,
    sha256: sha256Hex(""),
    cached: false,
  };
}

// Utility: ensure the MDX frontmatter schema matches the Phase 2 content
// config `src/content/config.ts`. Not called at runtime — it exists so a
// future check script can statically cross-reference the two. (Phase 2's
// config.ts is still the canonical Astro content collection schema; the
// pipeline schemas above intentionally mirror its shape with .strict() so
// that drift fails the pipeline build, not a runtime page render.)
export const PHASE2_CONFIG_REFERENCE = "src/content/config.ts";
