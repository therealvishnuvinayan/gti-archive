"use server";

import { revalidatePath } from "next/cache";
import type {
  ProductionApprovalRecipientType,
  ProductionSampleCriterion,
  ProductionSampleDecision,
  ProductionSampleRoundType,
} from "@prisma/client";

import { requireUser } from "@/lib/auth";
import {
  addProductionSampleEvidence,
  addProductionSampleParticipant,
  closeStageSevenProject,
  completeProductionSampleMilestone,
  completeProductionSampleRound,
  createProductionSampleRound,
  getStageSevenFeedbackDraft,
  removeProductionSampleEvidence,
  removeProductionSampleParticipant,
  sendStageSevenFeedback,
  signOffProductionUnit,
  StageSevenWorkflowError,
  type StageSevenMilestone,
  updateProductionSampleEvaluation,
  updateProductionSampleRoundDecision,
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
  type: ProductionSampleRoundType;
  customTypeName?: string | null;
  initialNotes?: string | null;
  submissionDueAt: string;
  reviewDueAt: string;
  revisionSignoffDueAt: string;
  deliveryDueAt: string;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => createProductionSampleRound(user, input));
}

export async function completeProductionSampleMilestoneAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  milestone: StageSevenMilestone;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () =>
    completeProductionSampleMilestone(user, input),
  );
}

export async function updateProductionSampleEvaluationAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  criterion: ProductionSampleCriterion;
  decision: ProductionSampleDecision | null;
  comment?: string | null;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () =>
    updateProductionSampleEvaluation(user, input),
  );
}

export async function updateProductionSampleRoundDecisionAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  decision: ProductionSampleDecision | null;
  notes?: string | null;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () =>
    updateProductionSampleRoundDecision(user, input),
  );
}

export async function addProductionSampleParticipantAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  participantUserId: string;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () =>
    addProductionSampleParticipant(user, input),
  );
}

export async function removeProductionSampleParticipantAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  participantUserId: string;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () =>
    removeProductionSampleParticipant(user, input),
  );
}

export async function addProductionSampleEvidenceAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  attachmentId: string;
  criterion?: ProductionSampleCriterion | null;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => addProductionSampleEvidence(user, input));
}

export async function removeProductionSampleEvidenceAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  evidenceId: string;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () =>
    removeProductionSampleEvidence(user, input),
  );
}

export async function completeProductionSampleRoundAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => completeProductionSampleRound(user, input));
}

export async function signOffProductionUnitAction(input: {
  projectId: string;
  productionUnitId: string;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => signOffProductionUnit(user, input));
}

export async function getStageSevenFeedbackDraftAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  selectedEvidenceIds?: string[];
  intro?: string | null;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => getStageSevenFeedbackDraft(user, input));
}

export async function sendStageSevenFeedbackAction(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
  clientRequestId: string;
  recipientType: ProductionApprovalRecipientType;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  selectedEvidenceIds?: string[];
  intro?: string | null;
  subject?: string | null;
  message?: string | null;
}) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => sendStageSevenFeedback(user, input));
}

export async function closeStageSevenProjectAction(input: { projectId: string }) {
  const user = await requireUser();
  return stageSevenAction(input.projectId, () => closeStageSevenProject(user, input));
}
