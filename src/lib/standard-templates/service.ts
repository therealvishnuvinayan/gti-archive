import "server-only";
import { DraftError, commandId, ensure, record } from "../stage-builder/contracts";
import { createDraft } from "../stage-builder/service";
import { validateBlueprint } from "./contracts";
import { getBlueprint } from "./registry";

export async function createBlueprintDraft(blueprintId: string, raw: unknown) {
  const input = record(raw, ["commandId", "blueprintRevision", "scopeAcknowledged"]);
  commandId(input.commandId);
  const blueprint = getBlueprint(blueprintId);
  ensure(input.blueprintRevision === blueprint.revision, "BLUEPRINT_REVISION_CHANGED", 409);
  ensure(input.scopeAcknowledged === true, "ACKNOWLEDGE_INTERNAL_CANDIDATE_SCOPE");
  const issues = validateBlueprint(blueprint);
  if (issues.length) throw new DraftError("BLUEPRINT_INCOMPLETE", 400, issues);
  // Existing service resolves the real session, authorizes, validates, records the
  // creator and appends revision/event/outbox atomically. No Prisma write here.
  return createDraft({ commandId: input.commandId, definition: blueprint.definition });
}

// Compatibility entry point: same identity, payload, definition and createDraft path.
export const createPackagingDraft = (raw: unknown) => createBlueprintDraft("gti-packaging-artwork", raw);
