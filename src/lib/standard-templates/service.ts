import "server-only";
import { DraftError, commandId, ensure, record } from "../stage-builder/contracts";
import { createDraft } from "../stage-builder/service";
import { validateBlueprint } from "./contracts";
import { packagingBlueprint } from "./packaging";

export async function createPackagingDraft(raw: unknown) {
  const input = record(raw, ["commandId", "blueprintRevision", "scopeAcknowledged"]);
  commandId(input.commandId);
  const blueprint = packagingBlueprint();
  ensure(input.blueprintRevision === blueprint.revision, "BLUEPRINT_REVISION_CHANGED", 409);
  ensure(input.scopeAcknowledged === true, "ACKNOWLEDGE_INTERNAL_CANDIDATE_SCOPE");
  const issues = validateBlueprint(blueprint);
  if (issues.length) throw new DraftError("BLUEPRINT_INCOMPLETE", 400, issues);
  // Existing service resolves the real session, authorizes, validates, records the
  // creator and appends revision/event/outbox atomically. No Prisma write here.
  return createDraft({ commandId: input.commandId, definition: blueprint.definition });
}
