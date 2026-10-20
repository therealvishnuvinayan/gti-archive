"use server";

import { getCurrentActor } from "@/lib/auth";
import { administration } from "@/lib/authorization/administration";
import { AuthorizationMutationError, inputRecord, requireCondition, type AssignmentMutationResult } from "@/lib/authorization/assignment-transaction";
import type { AdministrationChange, AdministrationDomain, AdministrationHistory, AdministrationResult } from "@/lib/authorization/administration-types";

function failure(error: unknown): { ok: false; code: string; message: string } {
  const code = error instanceof AuthorizationMutationError ? error.code : "OPERATION_FAILED";
  const messages: Record<string, string> = {
    STALE_VERSION: "This account changed after you opened it. Refresh and review the latest assignment before trying again.",
    STALE_SESSION: "Your access changed. Sign in again before continuing.",
    UNAUTHENTICATED: "Your session has ended. Sign in again.",
    ACTOR_NOT_ACTIVE: "Your account is not active. Sign in again or contact an administrator.",
    BUSINESS_AUTHORITY_REQUIRED: "This operation requires the current Business Director.",
    TECHNICAL_AUTHORITY_REQUIRED: "This operation requires Technical Administrator authority. Business authority alone cannot grant technical access or change a technically privileged account's shared status.",
    DIRECTOR_TRANSFER_REQUIRED: "The current Director cannot be demoted or suspended here. Use the protected Director transfer.",
    USE_DIRECTOR_OPERATION: "Appoint a Director through the protected Director transfer.",
    SUSPENDED_DIRECTOR_TARGET: "Reactivate the recipient through the appropriate authority before transferring Director.",
    CONFIRMATION_REQUIRED: "Review the consequences and confirm the requested change.",
    INVALID_REASON: "A reason of 1–2000 characters is required.",
    INVALID_INPUT: "The request is invalid. Refresh and try again.",
    INVALID_BUSINESS_ROLE: "Choose a supported business role. Director requires the separate transfer workflow.",
    INVALID_TECHNICAL_PRIVILEGES: "Only the supported Technical Administrator privilege can be changed here.",
    INVALID_ACCOUNT_STATUS: "Choose Active or Suspended.",
    INVALID_TRANSFER: "Choose a different active account to receive Director authority.",
    USER_NOT_FOUND: "This account no longer exists. Refresh the directory.",
  };
  return { ok: false, code, message: messages[code] ?? "The change could not be confirmed. Refresh the directory and history before retrying; no automatic retry was performed." };
}

async function change(raw: unknown, keys: string[], confirmation: string,
  perform: (input: Record<string, unknown>) => Promise<AssignmentMutationResult>,
): Promise<AdministrationResult<AdministrationChange>> {
  try {
    const input = inputRecord(raw, [...keys, "confirmation"]);
    requireCondition(input.confirmation === confirmation, "CONFIRMATION_REQUIRED");
    const { confirmation: acknowledged, ...command } = input;
    void acknowledged;
    // Used only for the reauthentication response, never as mutation authority.
    const actor = await getCurrentActor();
    requireCondition(actor, "UNAUTHENTICATED");
    const result = await perform(command); // re-resolves real session under assignment/session locks
    return { ok: true, data: { status: result.status,
      ...(result.status === "APPLIED" ? { changeId: result.changeId } : {}),
      signInRequired: result.status === "APPLIED" && result.assignments.some(row => row.userId === actor.userId),
    } };
  } catch (error) { return failure(error); }
}

export async function changeBusinessRoleAction(raw: unknown) {
  return change(raw, ["userId", "expectedVersion", "reason", "businessRole"], "CHANGE BUSINESS ROLE", administration.assignBusinessRole);
}
export async function changeBusinessStatusAction(raw: unknown) {
  return change(raw, ["userId", "expectedVersion", "reason", "accountStatus"], "CHANGE ACCOUNT STATUS",
    input => administration.setAuthorizationStatus(input, "business"));
}
export async function changeTechnicalPrivilegesAction(raw: unknown) {
  return change(raw, ["userId", "expectedVersion", "reason", "technicalPrivileges"], "CHANGE TECHNICAL PRIVILEGES", administration.setTechnicalPrivileges);
}
export async function transferDirectorAction(raw: unknown) {
  return change(raw, ["toUserId", "fromExpectedVersion", "toExpectedVersion", "outgoingBusinessRole", "reason"], "TRANSFER DIRECTOR", administration.transferDirector);
}
export async function loadAdministrationHistoryAction(domain: AdministrationDomain, raw: unknown): Promise<AdministrationResult<AdministrationHistory>> {
  try { return { ok: true, data: await administration.getAdministrationHistory(domain, raw) }; }
  catch (error) { return failure(error); }
}
