import {
  AttachmentAssetType,
  AttachmentStatus,
  NotificationEntityType,
  NotificationType,
  Prisma,
  ProductionApprovalRecipientType,
  ProductionDispatchStatus,
  ProductionHandoverRoute,
  ProductionSampleCriterion,
  ProductionSampleDecision,
  ProductionSampleRoundStatus,
  ProductionSampleRoundType,
  ProductionSupervisionStatus,
  ProjectProductionUnitStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import { sendResendEmail } from "@/lib/email/resend";
import {
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  getProjectStageAccessRecordById,
  type ProjectStageAccessRecord,
} from "@/lib/project-stage-data";
import { createPresignedPreviewUrl } from "@/lib/storage/s3";
import { canOpenImplementedWorkflowStage } from "@/lib/workflow-stage-access";

type StageProject = ProjectStageAccessRecord;
type EmailSender = typeof sendResendEmail;

export const STAGE_SEVEN_CRITERIA = [
  ProductionSampleCriterion.MATERIAL_QUALITY,
  ProductionSampleCriterion.GRAPHIC_REPRODUCTION,
  ProductionSampleCriterion.SIZE,
  ProductionSampleCriterion.CONSTRUCTION,
  ProductionSampleCriterion.GRAPHIC_ELEMENTS,
  ProductionSampleCriterion.FUNCTIONALITY,
  ProductionSampleCriterion.FINISHES,
] as const;

export type StageSevenMilestone =
  | "SUBMISSION"
  | "REVIEW"
  | "REVISION_SIGNOFF"
  | "DELIVERY";

export type StageSevenParticipant = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
};

export type StageSevenWorkspaceData = {
  canManage: boolean;
  stageCompleted: boolean;
  projectClosedAt: string | null;
  participants: StageSevenParticipant[];
  selectedUnitId: string | null;
  selectedRoundId: string | null;
  units: Array<{
    id: string;
    name: string;
    sourceAttachmentId: string;
    sourceMimeType: string;
    status: ProductionSupervisionStatus;
    signedOffAt: string | null;
    rounds: Array<{
      id: string;
      sequence: number;
      type: ProductionSampleRoundType;
      customTypeName: string | null;
      status: ProductionSampleRoundStatus;
      overallDecision: ProductionSampleDecision | null;
      overallNotes: string | null;
      deadlines: Array<{
        milestone: StageSevenMilestone;
        dueAt: string;
        completedAt: string | null;
        overdue: boolean;
      }>;
      participants: StageSevenParticipant[];
      evaluations: Array<{
        criterion: ProductionSampleCriterion;
        decision: ProductionSampleDecision | null;
        comment: string | null;
      }>;
      evidence: Array<{
        id: string;
        attachmentId: string;
        name: string;
        mimeType: string;
        size: number;
        criterion: ProductionSampleCriterion | null;
        previewPath: string;
      }>;
      completedAt: string | null;
    }>;
  }>;
  summary: {
    totalUnits: number;
    activeRounds: number;
    overdueMilestones: number;
    signedOffUnits: number;
  };
};

export class StageSevenWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageSevenWorkflowError";
  }
}

function stageStatus(project: StageProject) {
  return project.workflowStages.find(
    (stage) =>
      stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
  )?.status;
}

export function canManageStageSeven(
  user: PermissionUser,
  project: StageProject,
) {
  return (
    user.role === UserRole.SUPER_ADMIN ||
    project.ownerId === user.id ||
    project.coOwners.some((coOwner) => coOwner.userId === user.id)
  );
}

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function getParticipants(project: StageProject): StageSevenParticipant[] {
  const candidates = [
    ...(project.owner ? [{ user: project.owner, role: "Project Owner" }] : []),
    ...project.coOwners.map(({ user }) => ({ user, role: "Project Co-Owner" })),
    ...project.executors.map(({ user }) => ({ user, role: "Project Executor" })),
    ...project.collaborators.map(({ user }) => ({
      user,
      role: "Project Collaborator",
    })),
  ];
  const unique = new Map<string, StageSevenParticipant>();
  for (const { user, role } of candidates) {
    if (!unique.has(user.id)) {
      unique.set(user.id, {
        id: user.id,
        name: displayName(user),
        email: user.email,
        avatarUrl: user.avatarUrl,
        role,
      });
    }
  }
  return [...unique.values()];
}

function isProjectParticipant(project: StageProject, userId: string) {
  return getParticipants(project).some((participant) => participant.id === userId);
}

function validClientRequestId(value: string) {
  return /^[a-zA-Z0-9_-]{16,120}$/.test(value);
}

function normalizeOptionalText(value: string | null | undefined, max: number) {
  const text = value?.trim() || null;
  if (text && text.length > max) {
    throw new StageSevenWorkflowError(`Text must be ${max} characters or fewer.`);
  }
  return text;
}

function parseDate(value: string | Date, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new StageSevenWorkflowError(`${label} is not a valid date.`);
  }
  return date;
}

function milestoneFields(milestone: StageSevenMilestone) {
  switch (milestone) {
    case "SUBMISSION":
      return { due: "submissionDueAt", actual: "submittedAt" } as const;
    case "REVIEW":
      return { due: "reviewDueAt", actual: "reviewedAt" } as const;
    case "REVISION_SIGNOFF":
      return { due: "revisionSignoffDueAt", actual: "revisionSignedOffAt" } as const;
    case "DELIVERY":
      return { due: "deliveryDueAt", actual: "deliveredAt" } as const;
  }
}

function roundDeadlines(
  round: {
    submissionDueAt: Date;
    submittedAt: Date | null;
    reviewDueAt: Date;
    reviewedAt: Date | null;
    revisionSignoffDueAt: Date;
    revisionSignedOffAt: Date | null;
    deliveryDueAt: Date;
    deliveredAt: Date | null;
  },
  now: Date,
) {
  return ([
    ["SUBMISSION", round.submissionDueAt, round.submittedAt],
    ["REVIEW", round.reviewDueAt, round.reviewedAt],
    ["REVISION_SIGNOFF", round.revisionSignoffDueAt, round.revisionSignedOffAt],
    ["DELIVERY", round.deliveryDueAt, round.deliveredAt],
  ] as const).map(([milestone, dueAt, completedAt]) => ({
    milestone,
    dueAt: dueAt.toISOString(),
    completedAt: completedAt?.toISOString() ?? null,
    overdue: !completedAt && dueAt.getTime() < now.getTime(),
  }));
}

async function getAuthorizedStageSevenProject(
  user: PermissionUser,
  projectId: string,
) {
  const project = await getProjectStageAccessRecordById(projectId);
  if (!project || !hasProjectPermission(user, project, "project.view")) return null;
  if (
    !canOpenImplementedWorkflowStage({
      user,
      stageKey: ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
      status: stageStatus(project),
    })
  ) {
    return null;
  }
  return project;
}

async function getManagerProject(user: PermissionUser, projectId: string) {
  const project = await getAuthorizedStageSevenProject(user, projectId);
  if (!project || !canManageStageSeven(user, project)) {
    throw new StageSevenWorkflowError(
      "Only the project owner, a project co-owner, or a Super Admin can manage Stage 7.",
    );
  }
  if (project.archivedAt) {
    throw new StageSevenWorkflowError("Archived projects are read-only.");
  }
  if (project.completedAt || stageStatus(project) === ProjectWorkflowStageStatus.COMPLETED) {
    throw new StageSevenWorkflowError("Stage 7 is complete and is now read-only.");
  }
  if (stageStatus(project) !== ProjectWorkflowStageStatus.AVAILABLE) {
    throw new StageSevenWorkflowError("Stage 7 is not currently available.");
  }
  return project;
}

const roundInclude = {
  evaluations: { orderBy: { criterion: "asc" as const } },
  participants: {
    orderBy: { addedAt: "asc" as const },
    include: { user: true },
  },
  evidence: {
    orderBy: { createdAt: "asc" as const },
    include: { attachment: true },
  },
} satisfies Prisma.ProductionSampleRoundInclude;

export async function getStageSevenWorkspaceData(
  user: PermissionUser,
  projectId: string,
  selectedUnitId?: string | null,
  selectedRoundId?: string | null,
): Promise<StageSevenWorkspaceData | null> {
  const project = await getAuthorizedStageSevenProject(user, projectId);
  if (!project) return null;

  const [units, closure] = await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectProductionUnit.findMany({
        where: { projectId, status: ProjectProductionUnitStatus.HANDED_OVER },
        orderBy: [{ handedOverAt: "asc" }, { id: "asc" }],
        include: {
          sourceAttachment: true,
          supervision: {
            include: {
              sampleRounds: {
                orderBy: [{ sequence: "asc" }, { id: "asc" }],
                include: roundInclude,
              },
            },
          },
        },
      }),
      prisma.projectClosure.findUnique({ where: { projectId } }),
    ]),
  );
  const now = new Date();
  const participantById = new Map(
    getParticipants(project).map((participant) => [participant.id, participant]),
  );
  const mappedUnits: StageSevenWorkspaceData["units"] = units.map((unit) => ({
    id: unit.id,
    name: unit.sourceAttachment.originalFileName,
    sourceAttachmentId: unit.sourceAttachmentId,
    sourceMimeType: unit.sourceAttachment.mimeType,
    status: unit.supervision?.status ?? ProductionSupervisionStatus.NOT_STARTED,
    signedOffAt: unit.supervision?.signedOffAt?.toISOString() ?? null,
    rounds:
      unit.supervision?.sampleRounds.map((round) => ({
        id: round.id,
        sequence: round.sequence,
        type: round.type,
        customTypeName: round.customTypeName,
        status: round.status,
        overallDecision: round.overallDecision,
        overallNotes: round.overallNotes,
        deadlines: roundDeadlines(round, now),
        participants: round.participants.map(({ user: participant }) =>
          participantById.get(participant.id) ?? {
            id: participant.id,
            name: displayName(participant),
            email: participant.email,
            avatarUrl: participant.avatarUrl,
            role: "Project Participant",
          },
        ),
        evaluations: round.evaluations.map((evaluation) => ({
          criterion: evaluation.criterion,
          decision: evaluation.decision,
          comment: evaluation.comment,
        })),
        evidence: round.evidence.map((evidence) => ({
          id: evidence.id,
          attachmentId: evidence.attachmentId,
          name: evidence.attachment.originalFileName,
          mimeType: evidence.attachment.mimeType,
          size: evidence.attachment.fileSize,
          criterion: evidence.criterion,
          previewPath: `/api/project-assets/${evidence.attachmentId}/preview`,
        })),
        completedAt: round.completedAt?.toISOString() ?? null,
      })) ?? [],
  }));
  const resolvedUnitId = mappedUnits.some((unit) => unit.id === selectedUnitId)
    ? selectedUnitId!
    : mappedUnits[0]?.id ?? null;
  const selectedUnit = mappedUnits.find((unit) => unit.id === resolvedUnitId);
  const resolvedRoundId = selectedUnit?.rounds.some(
    (round) => round.id === selectedRoundId,
  )
    ? selectedRoundId!
    : selectedUnit?.rounds.at(-1)?.id ?? null;
  const allRounds = mappedUnits.flatMap((unit) => unit.rounds);

  return {
    canManage: canManageStageSeven(user, project),
    stageCompleted: stageStatus(project) === ProjectWorkflowStageStatus.COMPLETED,
    projectClosedAt: closure?.closedAt.toISOString() ?? null,
    participants: [...participantById.values()],
    selectedUnitId: resolvedUnitId,
    selectedRoundId: resolvedRoundId,
    units: mappedUnits,
    summary: {
      totalUnits: mappedUnits.length,
      activeRounds: allRounds.filter(
        (round) => round.status !== ProductionSampleRoundStatus.COMPLETED,
      ).length,
      overdueMilestones: allRounds.reduce(
        (count, round) =>
          count + round.deadlines.filter((deadline) => deadline.overdue).length,
        0,
      ),
      signedOffUnits: mappedUnits.filter(
        (unit) => unit.status === ProductionSupervisionStatus.SIGNED_OFF,
      ).length,
    },
  };
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await withPrismaRetry(() =>
        prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
      );
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002");
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new StageSevenWorkflowError("Unable to save after multiple attempts.");
}

async function assertStageSevenActive(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  const project = await tx.project.findFirst({
    where: {
      id: projectId,
      archivedAt: null,
      completedAt: null,
      closure: null,
      workflowStages: {
        some: {
          stageKey: ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
          status: ProjectWorkflowStageStatus.AVAILABLE,
        },
      },
    },
    select: { id: true },
  });
  if (!project) {
    throw new StageSevenWorkflowError("Stage 7 is complete or no longer editable.");
  }
}

async function assertMutableRound(
  tx: Prisma.TransactionClient,
  input: { projectId: string; productionUnitId: string; sampleRoundId: string },
) {
  await assertStageSevenActive(tx, input.projectId);
  const round = await tx.productionSampleRound.findFirst({
    where: {
      id: input.sampleRoundId,
      projectId: input.projectId,
      supervision: {
        productionUnitId: input.productionUnitId,
        productionUnit: {
          projectId: input.projectId,
          status: ProjectProductionUnitStatus.HANDED_OVER,
        },
      },
    },
    include: {
      supervision: true,
      evaluations: true,
      participants: true,
      evidence: { include: { attachment: true } },
    },
  });
  if (!round) {
    throw new StageSevenWorkflowError(
      "The sample round does not belong to this handed-over Production Unit.",
    );
  }
  if (round.supervision.status === ProductionSupervisionStatus.SIGNED_OFF) {
    throw new StageSevenWorkflowError("Signed-off Production Units are read-only.");
  }
  if (round.status === ProductionSampleRoundStatus.COMPLETED) {
    throw new StageSevenWorkflowError("Completed sample rounds are read-only.");
  }
  return round;
}

export async function createProductionSampleRound(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    clientRequestId: string;
    type: ProductionSampleRoundType;
    customTypeName?: string | null;
    initialNotes?: string | null;
    submissionDueAt: string | Date;
    reviewDueAt: string | Date;
    revisionSignoffDueAt: string | Date;
    deliveryDueAt: string | Date;
  },
) {
  await getManagerProject(user, input.projectId);
  if (!validClientRequestId(input.clientRequestId)) {
    throw new StageSevenWorkflowError("The request identifier is invalid.");
  }
  if (!Object.values(ProductionSampleRoundType).includes(input.type)) {
    throw new StageSevenWorkflowError("Select a valid sample round type.");
  }
  const customTypeName = normalizeOptionalText(input.customTypeName, 120);
  const initialNotes = normalizeOptionalText(input.initialNotes, 8_000);
  if (input.type === ProductionSampleRoundType.CUSTOM && !customTypeName) {
    throw new StageSevenWorkflowError("Enter a name for the custom sample round.");
  }
  if (input.type !== ProductionSampleRoundType.CUSTOM && customTypeName) {
    throw new StageSevenWorkflowError(
      "A custom name can only be used with a custom sample round.",
    );
  }
  const submissionDueAt = parseDate(input.submissionDueAt, "Submission deadline");
  const reviewDueAt = parseDate(input.reviewDueAt, "Review deadline");
  const revisionSignoffDueAt = parseDate(
    input.revisionSignoffDueAt,
    "Revision / sign-off deadline",
  );
  const deliveryDueAt = parseDate(input.deliveryDueAt, "Delivery deadline");
  if (
    submissionDueAt > reviewDueAt ||
    reviewDueAt > revisionSignoffDueAt ||
    revisionSignoffDueAt > deliveryDueAt
  ) {
    throw new StageSevenWorkflowError(
      "Deadlines must follow submission, review, revision / sign-off, then delivery order.",
    );
  }

  return serializable(async (tx) => {
    await assertStageSevenActive(tx, input.projectId);
    const duplicate = await tx.productionSampleRound.findUnique({
      where: { clientRequestId: input.clientRequestId },
      select: {
        id: true,
        projectId: true,
        supervision: { select: { productionUnitId: true } },
      },
    });
    if (duplicate) {
      if (
        duplicate.projectId !== input.projectId ||
        duplicate.supervision.productionUnitId !== input.productionUnitId
      ) {
        throw new StageSevenWorkflowError("The request identifier is already in use.");
      }
      return { id: duplicate.id, duplicate: true } as const;
    }

    const unit = await tx.projectProductionUnit.findFirst({
      where: {
        id: input.productionUnitId,
        projectId: input.projectId,
        status: ProjectProductionUnitStatus.HANDED_OVER,
      },
      select: { id: true, supervision: { select: { id: true, status: true } } },
    });
    if (!unit) {
      throw new StageSevenWorkflowError(
        "Only handed-over Stage 6 Production Units can enter Stage 7.",
      );
    }
    if (unit.supervision?.status === ProductionSupervisionStatus.SIGNED_OFF) {
      throw new StageSevenWorkflowError("Signed-off Production Units are read-only.");
    }
    const supervision = unit.supervision
      ? await tx.projectProductionSupervision.update({
          where: { id: unit.supervision.id },
          data: { status: ProductionSupervisionStatus.IN_REVIEW },
        })
      : await tx.projectProductionSupervision.create({
          data: {
            projectId: input.projectId,
            productionUnitId: input.productionUnitId,
            status: ProductionSupervisionStatus.IN_REVIEW,
          },
        });
    const latest = await tx.productionSampleRound.aggregate({
      where: { supervisionId: supervision.id },
      _max: { sequence: true },
    });
    const created = await tx.productionSampleRound.create({
      data: {
        clientRequestId: input.clientRequestId,
        projectId: input.projectId,
        supervisionId: supervision.id,
        sequence: (latest._max.sequence ?? 0) + 1,
        type: input.type,
        customTypeName,
        overallNotes: initialNotes,
        submissionDueAt,
        reviewDueAt,
        revisionSignoffDueAt,
        deliveryDueAt,
        createdById: user.id,
        evaluations: {
          create: STAGE_SEVEN_CRITERIA.map((criterion) => ({ criterion })),
        },
      },
      select: { id: true },
    });
    return { id: created.id, duplicate: false } as const;
  });
}

export async function completeProductionSampleMilestone(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    milestone: StageSevenMilestone;
  },
) {
  await getManagerProject(user, input.projectId);
  if (!["SUBMISSION", "REVIEW", "REVISION_SIGNOFF", "DELIVERY"].includes(input.milestone)) {
    throw new StageSevenWorkflowError("Select a valid milestone.");
  }
  return serializable(async (tx) => {
    const round = await assertMutableRound(tx, input);
    const fields = milestoneFields(input.milestone);
    if (round[fields.actual]) {
      return { duplicate: true } as const;
    }
    const missingPrevious =
      (input.milestone === "REVIEW" && !round.submittedAt) ||
      (input.milestone === "REVISION_SIGNOFF" && !round.reviewedAt) ||
      (input.milestone === "DELIVERY" && !round.revisionSignedOffAt);
    if (missingPrevious) {
      throw new StageSevenWorkflowError(
        "Complete the preceding milestone before recording this one.",
      );
    }
    await tx.productionSampleRound.update({
      where: { id: round.id },
      data: {
        [fields.actual]: new Date(),
        ...(input.milestone === "SUBMISSION"
          ? { status: ProductionSampleRoundStatus.UNDER_REVIEW }
          : {}),
      },
    });
    return { duplicate: false } as const;
  });
}

export async function updateProductionSampleEvaluation(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    criterion: ProductionSampleCriterion;
    decision: ProductionSampleDecision | null;
    comment?: string | null;
  },
) {
  await getManagerProject(user, input.projectId);
  if (!Object.values(ProductionSampleCriterion).includes(input.criterion)) {
    throw new StageSevenWorkflowError("Select a valid evaluation criterion.");
  }
  if (
    input.decision !== null &&
    !Object.values(ProductionSampleDecision).includes(input.decision)
  ) {
    throw new StageSevenWorkflowError("Select a valid evaluation decision.");
  }
  const comment = normalizeOptionalText(input.comment, 4_000);
  return serializable(async (tx) => {
    await assertMutableRound(tx, input);
    await tx.productionSampleEvaluation.update({
      where: {
        sampleRoundId_criterion: {
          sampleRoundId: input.sampleRoundId,
          criterion: input.criterion,
        },
      },
      data: { decision: input.decision, comment },
    });
    return { success: true } as const;
  });
}

export async function updateProductionSampleRoundDecision(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    decision: ProductionSampleDecision | null;
    notes?: string | null;
  },
) {
  await getManagerProject(user, input.projectId);
  if (
    input.decision !== null &&
    !Object.values(ProductionSampleDecision).includes(input.decision)
  ) {
    throw new StageSevenWorkflowError("Select a valid overall decision.");
  }
  const overallNotes = normalizeOptionalText(input.notes, 8_000);
  return serializable(async (tx) => {
    await assertMutableRound(tx, input);
    await tx.productionSampleRound.update({
      where: { id: input.sampleRoundId },
      data: { overallDecision: input.decision, overallNotes },
    });
    return { success: true } as const;
  });
}

export async function addProductionSampleParticipant(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    participantUserId: string;
  },
) {
  const project = await getManagerProject(user, input.projectId);
  if (!isProjectParticipant(project, input.participantUserId)) {
    throw new StageSevenWorkflowError(
      "Only a current project participant can be added to a sample round.",
    );
  }
  return serializable(async (tx) => {
    const round = await assertMutableRound(tx, input);
    if (round.participants.some((participant) => participant.userId === input.participantUserId)) {
      throw new StageSevenWorkflowError("That participant is already assigned to this round.");
    }
    await tx.productionSampleRoundParticipant.create({
      data: {
        sampleRoundId: input.sampleRoundId,
        userId: input.participantUserId,
        addedById: user.id,
      },
    });
    return { success: true } as const;
  });
}

export async function removeProductionSampleParticipant(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    participantUserId: string;
  },
) {
  await getManagerProject(user, input.projectId);
  return serializable(async (tx) => {
    await assertMutableRound(tx, input);
    const removed = await tx.productionSampleRoundParticipant.deleteMany({
      where: {
        sampleRoundId: input.sampleRoundId,
        userId: input.participantUserId,
      },
    });
    if (!removed.count) {
      throw new StageSevenWorkflowError("That participant is not assigned to this round.");
    }
    return { success: true } as const;
  });
}

export async function addProductionSampleEvidence(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    attachmentId: string;
    criterion?: ProductionSampleCriterion | null;
  },
) {
  await getManagerProject(user, input.projectId);
  if (
    input.criterion &&
    !Object.values(ProductionSampleCriterion).includes(input.criterion)
  ) {
    throw new StageSevenWorkflowError("Select a valid evidence criterion.");
  }
  return serializable(async (tx) => {
    const round = await assertMutableRound(tx, input);
    const attachment = await tx.projectAttachment.findFirst({
      where: {
        id: input.attachmentId,
        projectId: input.projectId,
        assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE,
        status: AttachmentStatus.READY,
      },
      select: { id: true, mimeType: true, sampleRoundEvidence: { select: { id: true } } },
    });
    if (!attachment || !/^(image|video)\//i.test(attachment.mimeType)) {
      throw new StageSevenWorkflowError(
        "Evidence must be a ready image or video uploaded to this project.",
      );
    }
    if (attachment.sampleRoundEvidence) {
      if (round.evidence.some((item) => item.attachmentId === attachment.id)) {
        return { duplicate: true } as const;
      }
      throw new StageSevenWorkflowError("That evidence file is already assigned elsewhere.");
    }
    await tx.productionSampleRoundEvidence.create({
      data: {
        sampleRoundId: input.sampleRoundId,
        attachmentId: input.attachmentId,
        criterion: input.criterion ?? null,
        addedById: user.id,
      },
    });
    return { duplicate: false } as const;
  });
}

export async function removeProductionSampleEvidence(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    evidenceId: string;
  },
) {
  await getManagerProject(user, input.projectId);
  return serializable(async (tx) => {
    await assertMutableRound(tx, input);
    const removed = await tx.productionSampleRoundEvidence.deleteMany({
      where: { id: input.evidenceId, sampleRoundId: input.sampleRoundId },
    });
    if (!removed.count) {
      throw new StageSevenWorkflowError("Evidence was not found in this sample round.");
    }
    return { success: true } as const;
  });
}

export async function completeProductionSampleRound(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
  },
) {
  await getManagerProject(user, input.projectId);
  return serializable(async (tx) => {
    await assertStageSevenActive(tx, input.projectId);
    const existing = await tx.productionSampleRound.findFirst({
      where: {
        id: input.sampleRoundId,
        projectId: input.projectId,
        supervision: {
          productionUnitId: input.productionUnitId,
          productionUnit: {
            projectId: input.projectId,
            status: ProjectProductionUnitStatus.HANDED_OVER,
          },
        },
      },
      include: { evaluations: true, participants: true, supervision: true },
    });
    if (!existing) throw new StageSevenWorkflowError("Sample round not found.");
    if (existing.status === ProductionSampleRoundStatus.COMPLETED) {
      return { duplicate: true } as const;
    }
    if (existing.supervision.status === ProductionSupervisionStatus.SIGNED_OFF) {
      throw new StageSevenWorkflowError("Signed-off Production Units are read-only.");
    }
    const allMilestonesComplete =
      existing.submittedAt &&
      existing.reviewedAt &&
      existing.revisionSignedOffAt &&
      existing.deliveredAt;
    if (!allMilestonesComplete) {
      throw new StageSevenWorkflowError(
        "Complete submission, review, revision / sign-off, and delivery first.",
      );
    }
    if (
      existing.evaluations.length !== STAGE_SEVEN_CRITERIA.length ||
      existing.evaluations.some((evaluation) => !evaluation.decision)
    ) {
      throw new StageSevenWorkflowError("Complete every evaluation criterion first.");
    }
    if (!existing.participants.length) {
      throw new StageSevenWorkflowError("Assign at least one participant first.");
    }
    if (!existing.overallDecision) {
      throw new StageSevenWorkflowError("Select an overall decision first.");
    }
    const completedAt = new Date();
    const updated = await tx.productionSampleRound.updateMany({
      where: {
        id: existing.id,
        status: { not: ProductionSampleRoundStatus.COMPLETED },
      },
      data: {
        status: ProductionSampleRoundStatus.COMPLETED,
        completedById: user.id,
        completedAt,
      },
    });
    if (!updated.count) return { duplicate: true } as const;
    await tx.projectProductionSupervision.update({
      where: { id: existing.supervisionId },
      data: {
        status:
          existing.overallDecision === ProductionSampleDecision.PASS
            ? ProductionSupervisionStatus.IN_REVIEW
            : ProductionSupervisionStatus.REVISIONS_NEEDED,
      },
    });
    return { duplicate: false } as const;
  });
}

export async function signOffProductionUnit(
  user: PermissionUser,
  input: { projectId: string; productionUnitId: string },
) {
  await getManagerProject(user, input.projectId);
  return serializable(async (tx) => {
    await assertStageSevenActive(tx, input.projectId);
    const unit = await tx.projectProductionUnit.findFirst({
      where: {
        id: input.productionUnitId,
        projectId: input.projectId,
        status: ProjectProductionUnitStatus.HANDED_OVER,
      },
      include: {
        supervision: {
          include: {
            sampleRounds: { orderBy: { sequence: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!unit?.supervision) {
      throw new StageSevenWorkflowError("Create and complete a sample round first.");
    }
    if (unit.supervision.status === ProductionSupervisionStatus.SIGNED_OFF) {
      return { duplicate: true } as const;
    }
    const latest = unit.supervision.sampleRounds[0];
    if (
      !latest ||
      latest.status !== ProductionSampleRoundStatus.COMPLETED ||
      latest.overallDecision !== ProductionSampleDecision.PASS
    ) {
      throw new StageSevenWorkflowError(
        "The latest sample round must be completed with an overall Pass decision.",
      );
    }
    await tx.projectProductionSupervision.update({
      where: { id: unit.supervision.id },
      data: {
        status: ProductionSupervisionStatus.SIGNED_OFF,
        signedOffById: user.id,
        signedOffAt: new Date(),
      },
    });
    return { duplicate: false } as const;
  });
}

export async function closeStageSevenProject(
  user: PermissionUser,
  input: { projectId: string },
) {
  const project = await getAuthorizedStageSevenProject(user, input.projectId);
  if (!project || !canManageStageSeven(user, project)) {
    throw new StageSevenWorkflowError(
      "Only the project owner, a project co-owner, or a Super Admin can close the project.",
    );
  }
  if (project.archivedAt) throw new StageSevenWorkflowError("Archived projects are read-only.");

  return serializable(async (tx) => {
    const existing = await tx.projectClosure.findUnique({
      where: { projectId: input.projectId },
    });
    if (existing) {
      return { duplicate: true, closedAt: existing.closedAt.toISOString() } as const;
    }
    const stage = await tx.projectWorkflowStage.findUnique({
      where: {
        projectId_stageKey: {
          projectId: input.projectId,
          stageKey: ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
        },
      },
    });
    if (!stage || stage.status !== ProjectWorkflowStageStatus.AVAILABLE) {
      throw new StageSevenWorkflowError("Stage 7 is not currently available.");
    }
    const units = await tx.projectProductionUnit.findMany({
      where: {
        projectId: input.projectId,
        status: ProjectProductionUnitStatus.HANDED_OVER,
      },
      include: {
        supervision: {
          include: {
            sampleRounds: {
              where: {
                status: {
                  in: [
                    ProductionSampleRoundStatus.PENDING,
                    ProductionSampleRoundStatus.UNDER_REVIEW,
                  ],
                },
              },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!units.length) {
      throw new StageSevenWorkflowError("No handed-over Production Units are available.");
    }
    if (
      units.some(
        (unit) =>
          unit.supervision?.status !== ProductionSupervisionStatus.SIGNED_OFF ||
          unit.supervision.sampleRounds.length > 0,
      )
    ) {
      throw new StageSevenWorkflowError(
        "Every Production Unit must be signed off with no active sample rounds.",
      );
    }
    const now = new Date();
    const closure = await tx.projectClosure.create({
      data: { projectId: input.projectId, closedById: user.id, closedAt: now },
    });
    await tx.projectWorkflowStage.update({
      where: { id: stage.id },
      data: { status: ProjectWorkflowStageStatus.COMPLETED, completedAt: now },
    });
    await tx.project.update({
      where: { id: input.projectId },
      data: { completedAt: now },
    });
    return { duplicate: false, closedAt: closure.closedAt.toISOString() } as const;
  });
}

const overdueMilestones = [
  { key: "SUBMISSION", due: "submissionDueAt", actual: "submittedAt", label: "submission" },
  { key: "REVIEW", due: "reviewDueAt", actual: "reviewedAt", label: "review" },
  {
    key: "REVISION_SIGNOFF",
    due: "revisionSignoffDueAt",
    actual: "revisionSignedOffAt",
    label: "revision / sign-off",
  },
  { key: "DELIVERY", due: "deliveryDueAt", actual: "deliveredAt", label: "delivery" },
] as const;

export async function processStageSevenOverdueDeadlines(now = new Date()) {
  const rounds = await withPrismaRetry(() =>
    prisma.productionSampleRound.findMany({
      where: {
        status: { not: ProductionSampleRoundStatus.COMPLETED },
        supervision: { status: { not: ProductionSupervisionStatus.SIGNED_OFF } },
        project: {
          completedAt: null,
          archivedAt: null,
          workflowStages: {
            some: {
              stageKey: ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
              status: ProjectWorkflowStageStatus.AVAILABLE,
            },
          },
        },
        OR: overdueMilestones.map((milestone) => ({
          [milestone.due]: { lt: now },
          [milestone.actual]: null,
        })),
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            coOwners: { select: { userId: true } },
          },
        },
        supervision: {
          include: {
            productionUnit: { include: { sourceAttachment: true } },
          },
        },
      },
    }),
  );
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  for (const round of rounds) {
    for (const milestone of overdueMilestones) {
      if (round[milestone.actual] || round[milestone.due].getTime() >= now.getTime()) continue;
      const recipients = Array.from(
        new Set([
          round.project.ownerId,
          ...round.project.coOwners.map((coOwner) => coOwner.userId),
        ]),
      ).filter((userId): userId is string => Boolean(userId));
      for (const userId of recipients) {
        notifications.push({
          userId,
          type: NotificationType.STAGE_SEVEN_OVERDUE,
          title: `Stage 7 ${milestone.label} overdue`,
          message: `${round.supervision.productionUnit.sourceAttachment.originalFileName}, round ${round.sequence}, has an overdue ${milestone.label} milestone.`,
          entityType: NotificationEntityType.SAMPLE_ROUND,
          entityId: round.id,
          projectId: round.projectId,
          url: `/projects/${round.projectId}/stages/7?unit=${round.supervision.productionUnitId}&round=${round.id}`,
          dedupeKey: `stage7-overdue:${round.id}:${milestone.key}:${userId}`,
        });
      }
    }
  }
  if (notifications.length) {
    await withPrismaRetry(() =>
      prisma.notification.createMany({ data: notifications, skipDuplicates: true }),
    );
  }
  return { scannedRounds: rounds.length, attemptedNotifications: notifications.length };
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLocaleLowerCase("en-US") ?? "";
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function humanizeEnum(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase("en-US") + part.slice(1))
    .join(" ");
}

async function getFeedbackRound(input: {
  projectId: string;
  productionUnitId: string;
  sampleRoundId: string;
}) {
  const round = await withPrismaRetry(() =>
    prisma.productionSampleRound.findFirst({
      where: {
        id: input.sampleRoundId,
        projectId: input.projectId,
        supervision: { productionUnitId: input.productionUnitId },
      },
      include: {
        project: { select: { id: true, name: true } },
        supervision: {
          include: {
            productionUnit: {
              include: { sourceAttachment: true, handover: true },
            },
          },
        },
        evaluations: { orderBy: { criterion: "asc" } },
        participants: {
          orderBy: { addedAt: "asc" },
          include: { user: { select: { name: true, email: true } } },
        },
        evidence: {
          orderBy: { createdAt: "asc" },
          include: { attachment: true },
        },
      },
    }),
  );
  if (!round) {
    throw new StageSevenWorkflowError("Sample round not found for this Production Unit.");
  }
  return round;
}

async function resolveFeedbackRecipient(
  project: StageProject,
  input: {
    recipientType: ProductionApprovalRecipientType;
    recipientUserId?: string | null;
    recipientName?: string | null;
    recipientEmail?: string | null;
  },
) {
  if (input.recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR) {
    const participant = getParticipants(project).find(
      (candidate) => candidate.id === input.recipientUserId,
    );
    if (!participant) {
      throw new StageSevenWorkflowError("Select a current project participant.");
    }
    return {
      recipientType: input.recipientType,
      recipientUserId: participant.id,
      recipientName: participant.name,
      recipientEmail: participant.email,
    };
  }
  if (input.recipientType !== ProductionApprovalRecipientType.EXTERNAL_EMAIL) {
    throw new StageSevenWorkflowError("Select a valid feedback recipient type.");
  }
  const recipientName = normalizeOptionalText(input.recipientName, 160);
  const recipientEmail = normalizeEmail(input.recipientEmail);
  if (!recipientName || !recipientEmail) {
    throw new StageSevenWorkflowError("Enter a valid recipient name and email address.");
  }
  return {
    recipientType: input.recipientType,
    recipientUserId: null,
    recipientName,
    recipientEmail,
  };
}

export async function getStageSevenFeedbackDraft(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    sampleRoundId: string;
    selectedEvidenceIds?: string[];
    intro?: string | null;
  },
) {
  await getManagerProject(user, input.projectId);
  const round = await getFeedbackRound(input);
  const selectedIds = new Set(input.selectedEvidenceIds ?? round.evidence.map((item) => item.id));
  if (selectedIds.size !== (input.selectedEvidenceIds ?? []).length && input.selectedEvidenceIds) {
    throw new StageSevenWorkflowError("The evidence selection contains duplicates.");
  }
  const selectedEvidence = round.evidence.filter((item) => selectedIds.has(item.id));
  if (selectedEvidence.length !== selectedIds.size) {
    throw new StageSevenWorkflowError("One or more selected evidence files are invalid.");
  }
  const evidenceLinks = await Promise.all(
    selectedEvidence.map(async (item) => ({
      id: item.id,
      name: item.attachment.originalFileName,
      url: await createPresignedPreviewUrl({
        bucket: item.attachment.bucket,
        storageKey: item.attachment.storageKey,
        fileName: item.attachment.originalFileName,
        mimeType: item.attachment.mimeType,
        expiresInSeconds: 60 * 60 * 24 * 7,
      }),
    })),
  );
  const roundName =
    round.type === ProductionSampleRoundType.CUSTOM
      ? round.customTypeName || "Custom sample"
      : humanizeEnum(round.type);
  const subject = `${round.project.name}: ${roundName} feedback — ${round.supervision.productionUnit.sourceAttachment.originalFileName}`;
  const intro = normalizeOptionalText(input.intro, 2_000);
  const decision = round.overallDecision
    ? humanizeEnum(round.overallDecision)
    : "Pending";
  const criteriaLines = round.evaluations.map(
    (evaluation) =>
      `- ${humanizeEnum(evaluation.criterion)}: ${evaluation.decision ? humanizeEnum(evaluation.decision) : "Pending"}${evaluation.comment ? ` — ${evaluation.comment}` : ""}`,
  );
  const participantNames = round.participants.map(({ user: participant }) =>
    displayName(participant),
  );
  const milestoneLines = roundDeadlines(round, new Date()).map((milestone) => {
    const label = humanizeEnum(milestone.milestone);
    return `- ${label}: due ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(milestone.dueAt))}${milestone.completedAt ? `; completed ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(milestone.completedAt))}` : milestone.overdue ? "; overdue" : "; pending"}`;
  });
  const text = [
    `Production sample feedback for ${round.supervision.productionUnit.sourceAttachment.originalFileName}`,
    `Project: ${round.project.name}`,
    `Round ${round.sequence}: ${roundName}`,
    `Overall decision: ${decision}`,
    `Review participants: ${participantNames.join(", ") || "None selected"}`,
    ...(intro ? ["", intro] : []),
    ...(round.overallNotes ? ["", `Overall notes: ${round.overallNotes}`] : []),
    "",
    "Evaluation criteria:",
    ...criteriaLines,
    "",
    "Milestones:",
    ...milestoneLines,
    ...(evidenceLinks.length
      ? [
          "",
          "Secure evidence links (expire in 7 days):",
          ...evidenceLinks.map((item) => `- ${item.name}: ${item.url}`),
        ]
      : []),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#18221b;line-height:1.55">
      <h2>${escapeHtml(subject)}</h2>
      <p><strong>Overall decision:</strong> ${escapeHtml(decision)}</p>
      <p><strong>Review participants:</strong> ${escapeHtml(participantNames.join(", ") || "None selected")}</p>
      ${intro ? `<p>${escapeHtml(intro).replaceAll("\n", "<br>")}</p>` : ""}
      ${round.overallNotes ? `<p><strong>Overall notes:</strong> ${escapeHtml(round.overallNotes)}</p>` : ""}
      <h3>Evaluation criteria</h3>
      <ul>${round.evaluations
        .map(
          (evaluation) =>
            `<li><strong>${escapeHtml(humanizeEnum(evaluation.criterion))}:</strong> ${escapeHtml(evaluation.decision ? humanizeEnum(evaluation.decision) : "Pending")}${evaluation.comment ? ` — ${escapeHtml(evaluation.comment)}` : ""}</li>`,
        )
        .join("")}</ul>
      <h3>Milestones</h3>
      <ul>${milestoneLines.map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`).join("")}</ul>
      ${
        evidenceLinks.length
          ? `<h3>Evidence</h3><p>These secure links expire in 7 days.</p><ul>${evidenceLinks
              .map(
                (item) =>
                  `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a></li>`,
              )
              .join("")}</ul>`
          : ""
      }
    </div>`;
  const handover = round.supervision.productionUnit.handover;
  return {
    subject,
    text,
    html,
    evidenceLinks,
    suggestedRecipient:
      handover?.route === ProductionHandoverRoute.PURCHASE_DEPARTMENT
        ? {
            name: handover.recipientName,
            email: handover.recipientEmail,
          }
        : null,
  };
}

export async function sendStageSevenFeedback(
  user: PermissionUser,
  input: {
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
  },
  options: { sendEmail?: EmailSender } = {},
) {
  const project = await getManagerProject(user, input.projectId);
  if (!validClientRequestId(input.clientRequestId)) {
    throw new StageSevenWorkflowError("The request identifier is invalid.");
  }
  const recipient = await resolveFeedbackRecipient(project, input);
  const draft = await getStageSevenFeedbackDraft(user, input);
  const subject = normalizeOptionalText(input.subject, 300) ?? draft.subject;
  const message = normalizeOptionalText(input.message, 20_000) ?? draft.text;
  const html = input.message
    ? `<div style="font-family:Arial,sans-serif;color:#18221b;line-height:1.55;white-space:pre-wrap">${escapeHtml(message)}</div>`
    : draft.html;
  let shouldSend = false;
  const feedback = await serializable(async (tx) => {
    const existing = await tx.productionSampleFeedback.findUnique({
      where: { clientRequestId: input.clientRequestId },
    });
    if (existing) {
      if (
        existing.sampleRoundId !== input.sampleRoundId ||
        existing.recipientEmail !== recipient.recipientEmail
      ) {
        throw new StageSevenWorkflowError("The request identifier is already in use.");
      }
      if (existing.status === ProductionDispatchStatus.SENT) return existing;
      if (existing.status === ProductionDispatchStatus.PENDING) {
        throw new StageSevenWorkflowError("This feedback email is already being sent.");
      }
      const claimed = await tx.productionSampleFeedback.updateMany({
        where: { id: existing.id, status: ProductionDispatchStatus.FAILED },
        data: {
          status: ProductionDispatchStatus.PENDING,
          failedAt: null,
          error: null,
          subject,
          messageSnapshot: message,
        },
      });
      shouldSend = claimed.count === 1;
      return tx.productionSampleFeedback.findUniqueOrThrow({ where: { id: existing.id } });
    }
    shouldSend = true;
    return tx.productionSampleFeedback.create({
      data: {
        clientRequestId: input.clientRequestId,
        sampleRoundId: input.sampleRoundId,
        ...recipient,
        subject,
        messageSnapshot: message,
        status: ProductionDispatchStatus.PENDING,
        sentById: user.id,
      },
    });
  });
  if (feedback.status === ProductionDispatchStatus.SENT) {
    return { duplicate: true, feedbackId: feedback.id } as const;
  }
  if (!shouldSend) {
    throw new StageSevenWorkflowError("This feedback email could not be claimed for retry.");
  }
  const result = await (options.sendEmail ?? sendResendEmail)({
    to: recipient.recipientEmail,
    subject,
    html,
    text: message,
  });
  if (!result.ok) {
    await withPrismaRetry(() =>
      prisma.productionSampleFeedback.update({
        where: { id: feedback.id },
        data: {
          status: ProductionDispatchStatus.FAILED,
          failedAt: new Date(),
          error: result.error.slice(0, 4_000),
        },
      }),
    );
    throw new StageSevenWorkflowError(`Feedback email failed: ${result.error}`);
  }
  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.productionSampleFeedback.update({
        where: { id: feedback.id },
        data: {
          status: ProductionDispatchStatus.SENT,
          providerMessageId: result.id ?? null,
          sentAt: new Date(),
          error: null,
        },
      });
      if (recipient.recipientUserId) {
        await tx.notification.createMany({
          data: [
            {
              userId: recipient.recipientUserId,
              type: NotificationType.PRODUCTION_SAMPLE_FEEDBACK,
              title: "Production sample feedback",
              message: subject,
              entityType: NotificationEntityType.SAMPLE_ROUND,
              entityId: input.sampleRoundId,
              projectId: input.projectId,
              url: `/projects/${input.projectId}/stages/7?unit=${input.productionUnitId}&round=${input.sampleRoundId}`,
              dedupeKey: `stage7-feedback:${feedback.id}:${recipient.recipientUserId}`,
            },
          ],
          skipDuplicates: true,
        });
      }
    }),
  );
  return { duplicate: false, feedbackId: feedback.id } as const;
}
