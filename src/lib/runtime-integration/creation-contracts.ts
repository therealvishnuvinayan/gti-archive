import { parseCreate, text } from "../stage-runtime/contracts";
import { commandId, ensure, identifier, record } from "../stage-builder/contracts";

export function parseCreationRequest(raw: unknown) {
  const input = record(raw, ["creation", "reason"]);
  text(input.reason, 2000, true);
  return { creation: parseCreate(input.creation), reason: input.reason.trim() };
}
export function parseCreationDecision(raw: unknown) {
  const input = record(raw, ["commandId", "requestId", "snapshotHash", "outcome", "reason", "confirmed"]);
  commandId(input.commandId); identifier(input.requestId);
  ensure(typeof input.snapshotHash === "string" && /^[a-f0-9]{64}$/.test(input.snapshotHash), "INVALID_HASH");
  ensure(input.outcome === "APPROVE" || input.outcome === "REJECT", "INVALID_DECISION");
  ensure(input.confirmed === true, "CONFIRM_DECISION"); text(input.reason, 2000, true);
  return { commandId: input.commandId, requestId: input.requestId, snapshotHash: input.snapshotHash,
    outcome: input.outcome, reason: input.reason.trim(), confirmed: true };
}
