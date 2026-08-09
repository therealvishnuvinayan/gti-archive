"use server";

import { revalidatePath } from "next/cache";
import {
  type ProjectFileChecklistField,
  type ProjectFileChecklistRequestChannel,
} from "@prisma/client";

import { requireUser } from "@/lib/auth";
import {
  cancelStageFiveChecklistRequest,
  completeStageFive,
  requestStageFiveChecklistInformation,
  resendStageFiveExternalChecklistRequest,
  saveStageFiveChecklist,
  type StageFiveChecklistValue,
} from "@/lib/stage-five";

export async function completeStageFiveAction(input: { projectId: string }) {
  const user = await requireUser();
  try {
    const result = await completeStageFive(user, input);
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath(`/projects/${input.projectId}/stages/5`);
    revalidatePath(`/projects/${input.projectId}/stages/6`);
    return result;
  } catch (error) {
    console.error("[stage-five] completion failed", error);
    return { error: "Unable to complete Stage 5 right now." } as const;
  }
}

export async function saveStageFiveChecklistAction(input: {
  projectId: string;
  handoffId: string;
  items: Array<{
    fieldKey: ProjectFileChecklistField;
    value: StageFiveChecklistValue;
    attachmentIds: string[];
  }>;
}) {
  const user = await requireUser();
  const result = await saveStageFiveChecklist(user, input);
  if (!("error" in result)) revalidatePath(`/projects/${input.projectId}/stages/5`);
  return result;
}

export async function requestStageFiveChecklistInformationAction(input: {
  clientRequestId: string;
  projectId: string;
  handoffId: string;
  fieldKey: ProjectFileChecklistField;
  channel: ProjectFileChecklistRequestChannel;
  recipientUserId?: string;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
}) {
  const user = await requireUser();
  const result = await requestStageFiveChecklistInformation(user, input);
  revalidatePath(`/projects/${input.projectId}/stages/5`);
  return result;
}

export async function resendStageFiveExternalChecklistRequestAction(input: {
  projectId: string;
  requestId: string;
}) {
  const user = await requireUser();
  const result = await resendStageFiveExternalChecklistRequest(user, input.requestId);
  revalidatePath(`/projects/${input.projectId}/stages/5`);
  return result;
}

export async function cancelStageFiveChecklistRequestAction(input: {
  projectId: string;
  requestId: string;
}) {
  const user = await requireUser();
  const result = await cancelStageFiveChecklistRequest(user, input.requestId);
  revalidatePath(`/projects/${input.projectId}/stages/5`);
  return result;
}
