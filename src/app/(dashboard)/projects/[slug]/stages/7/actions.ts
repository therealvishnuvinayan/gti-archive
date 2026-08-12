"use server";

import { revalidatePath } from "next/cache";
import type {
  PhysicalSampleDecision,
  ProductionApprovalRecipientType,
  ProductionHandoverRoute,
  ProductionSampleRoundType,
} from "@prisma/client";

import { requireUser } from "@/lib/auth";
import {
  closeStageSevenProject,
  createProductionSampleRound,
  decidePhysicalSampleRound,
  retryProductionSampleRequestEmail,
  StageSevenWorkflowError,
} from "@/lib/stage-seven";

function revalidateStageSeven(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/stages/7`);
}

async function stageSevenAction<T>(projectId: string, operation: () => Promise<T>) {
  try {
    const result = await operation();
    revalidateStageSeven(projectId);
    return result;
  } catch (error) {
    if (error instanceof StageSevenWorkflowError) {
      return { error: error.message } as const;
    }
    console.error("[stage-seven] action failed", error);
    return { error: "Unable to save the Stage 7 change right now." } as const;
  }
}

export async function createProductionSampleRoundAction(input: {
  projectId: string;
  productionUnitId: string;
  clientRequestId: string;
  name: string;
  type: ProductionSampleRoundType;
  customTypeName?: string | null;
  deadline: string;
  recipientRoute: ProductionHandoverRoute;
  recipientType: ProductionApprovalRecipientType;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientCompany?: string | null;
  recipientPhone?: string | null;
  requestNote?: string | null;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => createProductionSampleRound(user, input));
}

export async function retryProductionSampleRequestEmailAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () =>
    retryProductionSampleRequestEmail(user, input),
  );
}

export async function decidePhysicalSampleRoundAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  decision: PhysicalSampleDecision;
  decisionNote?: string | null;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => decidePhysicalSampleRound(user, input));
}

export async function closeStageSevenProjectAction(input: { projectId: string }) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => closeStageSevenProject(user, input));
}
