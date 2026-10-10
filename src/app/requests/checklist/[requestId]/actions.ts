"use server";

import { afterTaskMutation } from "@/lib/tasker/http";
import { reviewChecklistResponse, type ChecklistReviewInput } from "@/lib/tasker/checklist-review";


import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { publishProjectActivityUpdatedAfterResponse } from "@/lib/realtime/server";
import {
  acceptStageFiveChecklistRequest,
  declineStageFiveChecklistRequest,
  submitStageFiveChecklistResponse,
  type StageFiveChecklistValue,
} from "@/lib/stage-five";

export async function acceptStageFiveChecklistRequestAction(requestId: string) {
  const user = await requireUser(`/requests/checklist/${requestId}`);
  const result = await acceptStageFiveChecklistRequest(user, requestId);
  afterTaskMutation();
  revalidatePath(`/requests/checklist/${requestId}`);
  return result;
}

export async function declineStageFiveChecklistRequestAction(input: {
  requestId: string;
  reason: string;
}) {
  const user = await requireUser(`/requests/checklist/${input.requestId}`);
  const result = await declineStageFiveChecklistRequest(user, input);
  afterTaskMutation();
  revalidatePath(`/requests/checklist/${input.requestId}`);
  if (!("error" in result)) {
    revalidatePath(`/projects/${result.projectId}`);
    revalidatePath(`/projects/${result.projectId}/stages/5`);
    publishProjectActivityUpdatedAfterResponse({
      projectId: result.projectId,
      stageId: null,
      eventType: "timeline_updated",
      changedEntityId: input.requestId,
      actorId: user.id,
    });
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
  afterTaskMutation();
  revalidatePath(`/requests/checklist/${input.requestId}`);
  if (!("error" in result)) {
    revalidatePath(`/projects/${result.projectId}`);
    revalidatePath(`/projects/${result.projectId}/stages/5`);
    publishProjectActivityUpdatedAfterResponse({
      projectId: result.projectId,
      stageId: null,
      eventType: "timeline_updated",
      changedEntityId: input.requestId,
      actorId: user.id,
    });
  }
  return result;
}

export async function reviewStageFiveChecklistResponseAction(input: ChecklistReviewInput) {
  const user = await requireUser(`/requests/checklist/${input.requestId}`);
  const result = await reviewChecklistResponse(user, input);
  if (!("error" in result)) {
    afterTaskMutation();
    revalidatePath(`/requests/checklist/${input.requestId}`);
  }
  return result;
}
