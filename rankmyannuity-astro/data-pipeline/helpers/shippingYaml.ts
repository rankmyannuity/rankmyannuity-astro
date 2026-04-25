// [Phase 5] Reader for data-pipeline/sources/carriers.shipping.yml.
//
// Missing file is treated as an empty approval list (valid pilot state).
// Malformed YAML or schema violation is a hard error.

import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  ShippingApprovalsFileSchema,
  type ShippingApprovalsFile,
  type ShippingApproval,
} from "../schemas/shipping.ts";

export function readShippingYaml(filePath: string): ShippingApprovalsFile {
  if (!existsSync(filePath)) {
    return { approvals: [] };
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  const normalized = parsed ?? { approvals: [] };
  return ShippingApprovalsFileSchema.parse(normalized);
}

/**
 * Find the shipping approval entry for a given carrier slug.
 * Returns undefined if the carrier has no approval (i.e. is not authorized
 * to ship).
 */
export function findShippingApproval(
  approvals: ShippingApproval[] | ShippingApprovalsFile,
  carrierSlug: string,
): ShippingApproval | undefined {
  const list = Array.isArray(approvals) ? approvals : approvals.approvals;
  return list.find((a) => a.carrier_slug === carrierSlug);
}
