"use server";

import { revalidatePath } from "next/cache";
import type {
  ProductionApprovalRecipientType,
  ProductionHandoverRoute,
  ProjectFileChecklistField,
} from "@prisma/client";

import { requireUser } from "@/lib/auth";
import {
  addProductionApprover,
  addProductionUnitFile,
  completeStageSix,
  configureMarketingDirector,
  handoverProductionUnit,
  removeProductionApprover,
  removeProductionUnitFile,
  retryProductionApprovalDispatch,
} from "@/lib/stage-six";

function revalidateStageSix(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/stages/5`);
  revalidatePath(`/projects/${projectId}/stages/6`);
  revalidatePath(`/projects/${projectId}/stages/7`);
}

type ApproverInput = {
  clientRequestId: string;
  projectId: string;
  productionUnitId: string;
  recipientType: ProductionApprovalRecipientType;
  recipientUserId?: string;
  recipientName?: string;
  recipientEmail?: string;
  sharedFieldKeys: ProjectFileChecklistField[];
  selectedFileIds: string[];
  message?: string;
};

export async function configureMarketingDirectorAction(input: ApproverInput) {
  const user = await requireUser();
  const result = await configureMarketingDirector(user, input);
  revalidateStageSix(input.projectId);
  return result;
}

export async function addProductionApproverAction(input: ApproverInput) {
  const user = await requireUser();
  const result = await addProductionApprover(user, input);
  revalidateStageSix(input.projectId);
  return result;
}

export async function removeProductionApproverAction(input: {
  projectId: string;
  productionUnitId: string;
  stepId: string;
}) {
  const user = await requireUser();
  const result = await removeProductionApprover(user, input);
  revalidateStageSix(input.projectId);
  return result;
}

export async function retryProductionApprovalDispatchAction(input: {
  projectId: string;
  stepId: string;
}) {
  const user = await requireUser();
  const result = await retryProductionApprovalDispatch(user, input);
  revalidateStageSix(input.projectId);
  return result;
}

export async function addProductionUnitFileAction(input: {
  projectId: string;
  productionUnitId: string;
  attachmentId: string;
}) {
  const user = await requireUser();
  const result = await addProductionUnitFile(user, input);
  revalidateStageSix(input.projectId);
  return result;
}

export async function removeProductionUnitFileAction(input: {
  projectId: string;
  productionUnitId: string;
  attachmentId: string;
}) {
  const user = await requireUser();
  const result = await removeProductionUnitFile(user, input);
  revalidateStageSix(input.projectId);
  return result;
}

export async function handoverProductionUnitAction(input: {
  clientRequestId: string;
  projectId: string;
  productionUnitId: string;
  route: ProductionHandoverRoute;
  recipientType: ProductionApprovalRecipientType;
  recipientUserId?: string;
  recipientName?: string;
  recipientEmail?: string;
  sharedFieldKeys: ProjectFileChecklistField[];
  selectedFileIds: string[];
  note?: string;
}) {
  const user = await requireUser();
  const result = await handoverProductionUnit(user, input);
  revalidateStageSix(input.projectId);
  return result;
}

export async function completeStageSixAction(input: { projectId: string }) {
  const user = await requireUser();
  try {
    const result = await completeStageSix(user, input);
    revalidateStageSix(input.projectId);
    return result;
  } catch (error) {
    console.error("[stage-six] completion failed", error);
    return { error: "Unable to complete Stage 6 right now." } as const;
  }
}
