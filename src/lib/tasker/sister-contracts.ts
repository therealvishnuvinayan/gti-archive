// Shared input/confirmation contract; authorization stays in server services.
import { approvalHash } from "../approvals/contracts";
import { ensure, expectedVersion, id, ids, object, sistersEnabled } from "./contracts";

export function sisterCommand(raw: unknown) {
  ensure(sistersEnabled(), "SISTERS_DISABLED", 404);
  const s = object(raw, ["sourceTaskId", "sourceVersion", "mode", "evidenceVersionIds", "confirmed", "confirmation"]);
  ensure(s.mode === "KEEP" || s.mode === "MODIFY", "INVALID_SISTER_MODE");
  return { sourceTaskId: id(s.sourceTaskId), sourceVersion: expectedVersion(s.sourceVersion), mode: s.mode,
    evidenceVersionIds: ids(s.evidenceVersionIds), confirmed: s.confirmed === true, confirmation: s.confirmation };
}
export function confirmationHash(actorId: string, proposal: Record<string, unknown>) {
  const s = sisterCommand(proposal.sister);
  return approvalHash({ actorId, ...proposal, sister: { ...s, confirmed: false, confirmation: null } });
}
