import { createHash } from "node:crypto";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "../project-workflow";

/** Compatibility designation of the existing native workflow, never a published
 * V2 template. Changing this definition invalidates prior approval references. */
export const legacyArtworkPreset = {
  key: "legacy-artwork-seven-stages",
  version: 1,
  label: "Existing Artwork workflow (legacy preset)",
  stages: PROJECT_WORKFLOW_STAGE_DEFINITIONS,
  configuration: ["name", "description", "tags", "ownerId", "coOwnerIds", "executorIds", "executionType"],
};
export function governanceHash(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (item instanceof Date) return item.toISOString();
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return item;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export const legacyArtworkPresetHash = governanceHash(legacyArtworkPreset);
