"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  acceptStageFiveChecklistRequest,
  declineStageFiveChecklistRequest,
  submitStageFiveChecklistResponse,
  type StageFiveChecklistValue,
} from "@/lib/stage-five";

export async function acceptStageFiveChecklistRequestAction(requestId: string) {
  const user = await requireUser(`/requests/checklist/${requestId}`);
  const result = await acceptStageFiveChecklistRequest(user, requestId);
  revalidatePath(`/requests/checklist/${requestId}`);
  return result;
}

export async function declineStageFiveChecklistRequestAction(input: {
  requestId: string;
  reason: string;
}) {
  const user = await requireUser(`/requests/checklist/${input.requestId}`);
  const result = await declineStageFiveChecklistRequest(user, input);
  revalidatePath(`/requests/checklist/${input.requestId}`);
  if (!("error" in result)) {
    revalidatePath(`/projects/${result.projectId}/stages/5`);
  }
  return result;
}

export async function submitStageFiveChecklistResponseAction(input: {
  requestId: string;
  value: StageFiveChecklistValue;
  attachmentIds: string[];
}) {
  const user = await requireUser(`/requests/checklist/${input.requestId}`);
  const result = await submitStageFiveChecklistResponse(user, input);
  revalidatePath(`/requests/checklist/${input.requestId}`);
  if (!("error" in result)) {
    revalidatePath(`/projects/${result.projectId}/stages/5`);
  }
  return result;
}
