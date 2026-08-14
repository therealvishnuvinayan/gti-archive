import {
  AttachmentAssetType,
  AttachmentStatus,
  Prisma,
  ProductionApprovalRecipientType,
  ProductionApprovalStepStatus,
  ProductionDispatchStatus,
  ProductionHandoverDeliveryStatus,
  ProductionHandoverRoute,
  ProjectFileChecklistField,
  ProjectFileChecklistRequestWorkflowStatus,
  ProjectProductionUnitStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import {
  buildProductionApprovalEmail,
  buildProductionHandoverEmail,
} from "@/lib/email/production-workflow";
import { sendResendEmail } from "@/lib/email/resend";
import {
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { normalizeInternationalPhone } from "@/lib/project-contact-validation";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";
import {
  buildExternalProductionApprovalUrl,
  buildExternalProductionHandoverUrl,
  createProductionApprovalToken,
  createProductionHandoverToken,
  hashProductionExternalToken,
} from "@/lib/production-external-token";
import {
  getProjectStageAccessRecordById,
  type ProjectStageAccessRecord,
} from "@/lib/project-stage-data";
import { getWorkflowStageCompletionMode } from "@/lib/project-workflow";
import {
  STAGE_FIVE_FIELD_KEYS,
  STAGE_FIVE_FIELD_LABELS,
} from "@/lib/stage-five-fields";
import {
  STAGE_SIX_EMAIL_DELIVERY_ADDRESS,
  STAGE_SIX_FIRST_APPROVER,
} from "@/lib/stage-six-constants";
import {
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
} from "@/lib/storage/s3";
import {
  ACCESSIBLE_WORKFLOW_STAGE_STATUSES,
  canOpenImplementedWorkflowStage,
} from "@/lib/workflow-stage-access";

type EmailSender = typeof sendResendEmail;
type StageProject = ProjectStageAccessRecord;

const accessibleStageSixProjectWhere = {
  workflowStages: {
    some: {
      stageKey: ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
      status: { in: [...ACCESSIBLE_WORKFLOW_STAGE_STATUSES] },
    },
  },
} satisfies Prisma.ProjectWhereInput;

class StageSixWorkflowError extends Error {}

export type ProductionFileRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isSource: boolean;
};

export type ProductionSharedFieldSnapshot = {
  key: ProjectFileChecklistField;
  label: string;
  value: Prisma.JsonValue | null;
  attachments: Array<Omit<ProductionFileRecord, "isSource">>;
};

export type ProductionSharedSnapshot = {
  version: 1;
  capturedAt: string;
  fields: ProductionSharedFieldSnapshot[];
  files: ProductionFileRecord[];
};

export type StageSixApprovalStepRecord = {
  id: string;
  reviewHref: string | null;
  sequence: number;
  isMarketingDirectorRequired: boolean;
  isConfigured: boolean;
  recipientType: ProductionApprovalRecipientType | null;
  recipientName: string;
  recipientEmail: string | null;
  sharedFieldKeys: ProjectFileChecklistField[];
  selectedFileIds: string[];
  message: string | null;
  status: ProductionApprovalStepStatus;
  dispatchStatus: ProductionDispatchStatus;
  activatedAt: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  failureMessage: string | null;
};

export type StageSixUnitRecord = {
  id: string;
  name: string;
  status: ProjectProductionUnitStatus;
  sourceHandoffId: string;
  sourceChecklistId: string;
  sourceFile: ProductionFileRecord;
  productionFiles: ProductionFileRecord[];
  checklist: Array<{
    key: ProjectFileChecklistField;
    label: string;
    value: Prisma.JsonValue | null;
    attachments: Array<Omit<ProductionFileRecord, "isSource">>;
  }>;
  approvalSteps: StageSixApprovalStepRecord[];
  handover: {
    route: ProductionHandoverRoute;
    recipientName: string;
    recipientEmail: string;
    recipientCompany: string | null;
    recipientPhone: string | null;
    deliveryStatus: ProductionHandoverDeliveryStatus;
    sentAt: string | null;
    failureMessage: string | null;
  } | null;
  approvedAt: string | null;
  handedOverAt: string | null;
};

export type StageSixWorkspaceData = {
  units: StageSixUnitRecord[];
  participants: Array<{ id: string; name: string; email: string; role: string }>;
  canManage: boolean;
  stageCompleted: boolean;
  summary: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    handedOver: number;
  };
};

export type ProductionApprovalData =
  | { state: "invalid" | "expired" | "unavailable" | "locked" }
  | {
      state: "completed";
      decision: "APPROVED" | "REJECTED";
      projectName: string;
      unitName: string;
      decidedAt: string | null;
    }
  | {
      state: "active" | "approved" | "rejected";
      stepId: string;
      project: { id: string; name: string };
      unit: { id: string; name: string };
      stepLabel: string;
      requestedBy: string;
      message: string | null;
      snapshot: ProductionSharedSnapshot;
      decisionComment: string | null;
      decidedAt: string | null;
    };

export type ProductionHandoverData =
  | { state: "invalid" | "expired" | "unavailable" }
  | {
      state: "active";
      project: { id: string; name: string };
      unit: { id: string; name: string };
      sender: string;
      route: ProductionHandoverRoute;
      note: string | null;
      snapshot: ProductionSharedSnapshot;
      sentAt: string;
    };

const attachmentSelect = {
  id: true,
  originalFileName: true,
  mimeType: true,
  fileSize: true,
  bucket: true,
  storageKey: true,
  status: true,
  projectId: true,
} satisfies Prisma.ProjectAttachmentSelect;

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLocaleLowerCase("en-US");
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

function validClientRequestId(value: string) {
  return /^[a-zA-Z0-9_-]{16,120}$/.test(value);
}

function stageStatus(project: StageProject, key: ProjectWorkflowStageKey) {
  return project.workflowStages.find((stage) => stage.stageKey === key)?.status;
}

export function canManageStageSix(user: PermissionUser, project: StageProject) {
  return (
    user.role === UserRole.SUPER_ADMIN ||
    project.ownerId === user.id ||
    project.coOwners.some((coOwner) => coOwner.userId === user.id)
  );
}

function isProjectParticipant(project: StageProject, userId: string) {
  return (
    project.ownerId === userId ||
    project.coOwners.some((entry) => entry.userId === userId) ||
    project.executors.some((entry) => entry.userId === userId) ||
    project.collaborators.some((entry) => entry.userId === userId)
  );
}

function getParticipants(project: StageProject) {
  const candidates = [
    ...(project.owner ? [{ user: project.owner, role: "Project Owner" }] : []),
    ...project.coOwners.map(({ user }) => ({ user, role: "Project Co-Owner" })),
    ...project.executors.map(({ user }) => ({ user, role: "Project Executor" })),
    ...project.collaborators.map(({ user }) => ({ user, role: "Project Collaborator" })),
  ];
  const unique = new Map<string, { id: string; name: string; email: string; role: string }>();
  for (const { user, role } of candidates) {
    if (!unique.has(user.id)) {
      unique.set(user.id, {
        id: user.id,
        name: displayName(user),
        email: user.email,
        role,
      });
    }
  }
  return [...unique.values()];
}

function mapFile(
  attachment: {
    id: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
  },
  isSource: boolean,
): ProductionFileRecord {
  return {
    id: attachment.id,
    name: attachment.originalFileName,
    mimeType: attachment.mimeType,
    size: attachment.fileSize,
    isSource,
  };
}

function parseSnapshot(value: Prisma.JsonValue | null): ProductionSharedSnapshot | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const snapshot = value as unknown as ProductionSharedSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.fields) || !Array.isArray(snapshot.files)) {
    return null;
  }
  return snapshot;
}

function uniqueAllowedFieldKeys(values: ProjectFileChecklistField[]) {
  const keys = Array.from(new Set(values));
  return keys.length === values.length &&
    keys.every((key) => STAGE_FIVE_FIELD_KEYS.includes(key))
    ? keys
    : null;
}

async function getAuthorizedStageSixProject(user: PermissionUser, projectId: string) {
  const project = await getProjectStageAccessRecordById(projectId);
  if (!project || !hasProjectPermission(user, project, "project.view")) return null;
  if (
    !canOpenImplementedWorkflowStage({
      stageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
      status: stageStatus(project, ProjectWorkflowStageKey.FINAL_LAYOUT),
    })
  ) {
    return null;
  }
  if (
    !canOpenImplementedWorkflowStage({
      stageKey: ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
      status: stageStatus(project, ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER),
    })
  ) {
    return null;
  }
  return project;
}

async function getStageSixManagerProject(user: PermissionUser, projectId: string) {
  const project = await getAuthorizedStageSixProject(user, projectId);
  return project && canManageStageSix(user, project) ? project : null;
}

function createDedupeNotificationData(input: {
  userIds: Array<string | null | undefined>;
  actorId?: string;
  dedupePrefix: string;
  type:
    | "NEXT_STAGE_ACTIVATED"
    | "PRODUCTION_APPROVAL_REQUESTED"
    | "PRODUCTION_APPROVAL_APPROVED"
    | "PRODUCTION_APPROVAL_REJECTED"
    | "PRODUCTION_HANDOVER_COMPLETED";
  title: string;
  message: string;
  entityType: "PROJECT" | "PRODUCTION_UNIT" | "PRODUCTION_APPROVAL";
  entityId: string;
  projectId: string;
  url: string;
}) {
  return Array.from(new Set(input.userIds.filter((id): id is string => Boolean(id))))
    .filter((id) => id !== input.actorId)
    .map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId,
      url: input.url,
      dedupeKey: `${input.dedupePrefix}:${userId}`,
    }));
}

async function createNotifications(
  tx: Prisma.TransactionClient,
  data: ReturnType<typeof createDedupeNotificationData>,
) {
  if (!data.length) return;
  await tx.notification.createMany({ data, skipDuplicates: true });
}

async function buildSharedSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    productionUnitId: string;
    fieldKeys: ProjectFileChecklistField[];
    selectedFileIds: string[];
    now?: Date;
  },
) {
  const fieldKeys = uniqueAllowedFieldKeys(input.fieldKeys);
  const selectedFileIds = Array.from(
    new Set(input.selectedFileIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (!fieldKeys || selectedFileIds.length !== input.selectedFileIds.length) {
    return { error: "The shared-information selection is invalid." } as const;
  }

  const unit = await tx.projectProductionUnit.findUnique({
    where: { id: input.productionUnitId },
    select: {
      id: true,
      projectId: true,
      sourceAttachment: { select: attachmentSelect },
      files: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { attachment: { select: attachmentSelect } },
      },
      sourceChecklist: {
        select: {
          items: {
            where: { fieldKey: { in: fieldKeys } },
            select: {
              fieldKey: true,
              value: true,
              attachments: {
                orderBy: { createdAt: "asc" },
                select: { attachment: { select: attachmentSelect } },
              },
            },
          },
        },
      },
    },
  });
  if (!unit) return { error: "Production Unit not found." } as const;

  const allowedFiles = [
    unit.sourceAttachment,
    ...unit.files.map(({ attachment }) => attachment),
  ].filter(
    (attachment) =>
      attachment.projectId === unit.projectId && attachment.status === AttachmentStatus.READY,
  );
  const allowedFileById = new Map(allowedFiles.map((file) => [file.id, file]));
  if (selectedFileIds.some((id) => !allowedFileById.has(id))) {
    return {
      error: "One or more selected production files are invalid or belong to another project.",
    } as const;
  }
  if (!fieldKeys.length && !selectedFileIds.length) {
    return { error: "Select at least one production file or shared detail." } as const;
  }

  const itemByKey = new Map(
    unit.sourceChecklist.items.map((item) => [item.fieldKey, item]),
  );
  for (const item of unit.sourceChecklist.items) {
    if (
      item.attachments.some(
        ({ attachment }) =>
          attachment.projectId !== unit.projectId || attachment.status !== AttachmentStatus.READY,
      )
    ) {
      return { error: "A selected checklist attachment is missing or invalid." } as const;
    }
  }

  const snapshot: ProductionSharedSnapshot = {
    version: 1,
    capturedAt: (input.now ?? new Date()).toISOString(),
    fields: fieldKeys.map((key) => {
      const item = itemByKey.get(key);
      return {
        key,
        label: STAGE_FIVE_FIELD_LABELS[key],
        value: item?.value ?? null,
        attachments:
          item?.attachments.map(({ attachment }) => ({
            id: attachment.id,
            name: attachment.originalFileName,
            mimeType: attachment.mimeType,
            size: attachment.fileSize,
          })) ?? [],
      };
    }),
    files: selectedFileIds.map((id) => {
      const file = allowedFileById.get(id)!;
      return mapFile(file, file.id === unit.sourceAttachment.id);
    }),
  };
  return { snapshot } as const;
}

const workspaceUnitSelect = {
  id: true,
  status: true,
  sourceHandoffId: true,
  sourceChecklistId: true,
  sourceAttachment: { select: attachmentSelect },
  sourceChecklist: {
    select: {
      items: {
        orderBy: { fieldKey: "asc" as const },
        select: {
          fieldKey: true,
          value: true,
          attachments: {
            orderBy: { createdAt: "asc" as const },
            select: { attachment: { select: attachmentSelect } },
          },
        },
      },
    },
  },
  files: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: { attachment: { select: attachmentSelect } },
  },
  approvalSteps: {
    orderBy: [{ sequence: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      clientRequestId: true,
      sequence: true,
      isMarketingDirectorRequired: true,
      recipientType: true,
      recipientUserId: true,
      recipientName: true,
      recipientEmail: true,
      sharedFieldKeys: true,
      selectedFileIds: true,
      message: true,
      status: true,
      dispatchStatus: true,
      activatedAt: true,
      sentAt: true,
      decidedAt: true,
      decisionComment: true,
      failureMessage: true,
    },
  },
  handover: {
    select: {
      route: true,
      recipientName: true,
      recipientEmail: true,
      recipientCompany: true,
      recipientPhone: true,
      deliveryStatus: true,
      sentAt: true,
      failureMessage: true,
    },
  },
  approvedAt: true,
  handedOverAt: true,
} satisfies Prisma.ProjectProductionUnitSelect;

export async function getStageSixWorkspaceData(
  user: PermissionUser,
  projectId: string,
): Promise<StageSixWorkspaceData | null> {
  const project = await getAuthorizedStageSixProject(user, projectId);
  if (!project) return null;
  const records = await withPrismaRetry(() =>
    prisma.projectProductionUnit.findMany({
      where: { projectId },
      relationLoadStrategy: "join",
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: workspaceUnitSelect,
    }),
  );
  const units: StageSixUnitRecord[] = records.map((unit) => {
    const itemByKey = new Map(
      unit.sourceChecklist.items.map((item) => [item.fieldKey, item]),
    );
    return {
      id: unit.id,
      name: unit.sourceAttachment.originalFileName,
      status: unit.status,
      sourceHandoffId: unit.sourceHandoffId,
      sourceChecklistId: unit.sourceChecklistId,
      sourceFile: mapFile(unit.sourceAttachment, true),
      productionFiles: unit.files.map(({ attachment }) => mapFile(attachment, false)),
      checklist: STAGE_FIVE_FIELD_KEYS.map((key) => {
        const item = itemByKey.get(key);
        return {
          key,
          label: STAGE_FIVE_FIELD_LABELS[key],
          value: item?.value ?? null,
          attachments:
            item?.attachments.map(({ attachment }) => ({
              id: attachment.id,
              name: attachment.originalFileName,
              mimeType: attachment.mimeType,
              size: attachment.fileSize,
            })) ?? [],
        };
      }),
      approvalSteps: unit.approvalSteps.map((step) => {
        const { recipientUserId, clientRequestId, ...visibleStep } = step;
        const isUnconfiguredFirstApprover =
          step.isMarketingDirectorRequired &&
          step.sequence === 1 &&
          !step.clientRequestId;
        return {
          ...visibleStep,
          isConfigured: Boolean(clientRequestId),
          reviewHref:
            recipientUserId === user.id &&
            step.status === ProductionApprovalStepStatus.ACTIVE &&
            step.dispatchStatus === ProductionDispatchStatus.SENT
              ? `/production-approvals/${step.id}`
              : null,
          recipientType: isUnconfiguredFirstApprover
            ? ProductionApprovalRecipientType.EXTERNAL_EMAIL
            : step.recipientType,
          recipientName: isUnconfiguredFirstApprover
            ? STAGE_SIX_FIRST_APPROVER.name
            : step.recipientName?.trim() || "Not assigned",
          recipientEmail: isUnconfiguredFirstApprover
            ? STAGE_SIX_FIRST_APPROVER.email
            : step.recipientEmail,
          activatedAt: step.activatedAt?.toISOString() ?? null,
          sentAt: step.sentAt?.toISOString() ?? null,
          decidedAt: step.decidedAt?.toISOString() ?? null,
        };
      }),
      handover: unit.handover
        ? {
            ...unit.handover,
            sentAt: unit.handover.sentAt?.toISOString() ?? null,
          }
        : null,
      approvedAt: unit.approvedAt?.toISOString() ?? null,
      handedOverAt: unit.handedOverAt?.toISOString() ?? null,
    };
  });
  return {
    units,
    participants: getParticipants(project),
    canManage: canManageStageSix(user, project),
    stageCompleted:
      stageStatus(project, ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER) ===
      ProjectWorkflowStageStatus.COMPLETED,
    summary: {
      total: units.length,
      approved: units.filter(
        (unit) =>
          unit.status === ProjectProductionUnitStatus.HANDOVER_READY ||
          unit.status === ProjectProductionUnitStatus.HANDED_OVER,
      ).length,
      pending: units.filter(
        (unit) =>
          unit.status === ProjectProductionUnitStatus.PREPARATION ||
          unit.status === ProjectProductionUnitStatus.APPROVAL_PENDING,
      ).length,
      rejected: units.filter((unit) => unit.status === ProjectProductionUnitStatus.REJECTED).length,
      handedOver: units.filter((unit) => unit.status === ProjectProductionUnitStatus.HANDED_OVER).length,
    },
  };
}

export async function getStageFiveCompletionState(
  user: PermissionUser,
  projectId: string,
) {
  const project = await getProjectStageAccessRecordById(projectId);
  if (!project || !hasProjectPermission(user, project, "project.view")) return null;
  const [handoffCount, pendingRequestCount] = await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectStageFileHandoff.count({
        where: {
          projectId,
          sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
        },
      }),
      prisma.projectFileChecklistRequest.count({
        where: {
          projectId,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
      }),
    ]),
  );
  return {
    canComplete: canManageStageSix(user, project),
    completed:
      stageStatus(project, ProjectWorkflowStageKey.FINAL_LAYOUT) ===
      ProjectWorkflowStageStatus.COMPLETED,
    handoffCount,
    pendingRequestCount,
  };
}

export async function completeStageFive(
  user: PermissionUser,
  input: { projectId: string },
  conflictRetryCount = 0,
) {
  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const project = await tx.project.findUnique({
            where: { id: input.projectId },
            select: {
              id: true,
              name: true,
              ownerId: true,
              coOwners: { select: { userId: true } },
              workflowStages: {
                select: {
                  id: true,
                  stageKey: true,
                  status: true,
                  unlockedAt: true,
                  completedAt: true,
                },
              },
              stageFileHandoffs: {
                where: {
                  sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                  targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
                },
                orderBy: [{ handedOffAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  projectId: true,
                  sourceAttachmentId: true,
                  sourceAttachment: { select: attachmentSelect },
                  checklist: {
                    select: {
                      id: true,
                      projectId: true,
                      handoffId: true,
                      sourceAttachmentId: true,
                      items: {
                        select: {
                          checklistId: true,
                          attachments: {
                            select: { attachment: { select: attachmentSelect } },
                          },
                        },
                      },
                    },
                  },
                },
              },
              fileChecklistRequests: {
                where: {
                  workflowStatus: {
                    in: [
                      ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
                      ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
                    ],
                  },
                },
                select: { id: true },
              },
            },
          });
          if (!project) return { error: "Project not found." } as const;
          const manager =
            user.role === UserRole.SUPER_ADMIN ||
            project.ownerId === user.id ||
            project.coOwners.some((entry) => entry.userId === user.id);
          if (!manager) {
            return { error: "You do not have permission to complete Stage 5." } as const;
          }
          const stageFive = project.workflowStages.find(
            (stage) => stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT,
          );
          const stageSix = project.workflowStages.find(
            (stage) => stage.stageKey === ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
          );
          const stageSeven = project.workflowStages.find(
            (stage) => stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
          );
          if (!stageFive || !stageSix || !stageSeven) {
            return { error: "Stage 5, Stage 6, and Stage 7 workflow records are required." } as const;
          }
          const completionMode = getWorkflowStageCompletionMode(
            project.workflowStages,
            ProjectWorkflowStageKey.FINAL_LAYOUT,
          );
          if (completionMode === "UNAVAILABLE") {
            return { error: "Stage 5 is not currently available." } as const;
          }
          if (!project.stageFileHandoffs.length) {
            return { error: "At least one Stage 5 final file is required before completion." } as const;
          }
          for (const handoff of project.stageFileHandoffs) {
            const checklist = handoff.checklist;
            if (
              handoff.projectId !== project.id ||
              handoff.sourceAttachment.projectId !== project.id ||
              handoff.sourceAttachment.status !== AttachmentStatus.READY
            ) {
              return { error: "A Stage 5 source handoff is missing or corrupt." } as const;
            }
            if (
              !checklist ||
              checklist.projectId !== project.id ||
              checklist.handoffId !== handoff.id ||
              checklist.sourceAttachmentId !== handoff.sourceAttachmentId ||
              checklist.items.some((item) => item.checklistId !== checklist.id)
            ) {
              return { error: "A Stage 5 checklist reference is invalid." } as const;
            }
            if (
              checklist.items.some((item) =>
                item.attachments.some(
                  ({ attachment }) =>
                    attachment.projectId !== project.id ||
                    attachment.status !== AttachmentStatus.READY,
                ),
              )
            ) {
              return { error: "A Stage 5 checklist attachment is missing or invalid." } as const;
            }
          }

          const transitioned = completionMode === "TRANSITION";
          if (transitioned && stageSeven.status !== ProjectWorkflowStageStatus.LOCKED) {
            return { error: "Stage 7 must remain locked while Stage 5 is completed." } as const;
          }
          const units: Array<{ id: string; sourceHandoffId: string }> = [];
          for (const handoff of project.stageFileHandoffs) {
            const checklist = handoff.checklist!;
            const unit = await tx.projectProductionUnit.upsert({
              where: { sourceHandoffId: handoff.id },
              update: {},
              create: {
                projectId: project.id,
                sourceHandoffId: handoff.id,
                sourceChecklistId: checklist.id,
                sourceAttachmentId: handoff.sourceAttachmentId,
                createdById: user.id,
              },
              select: {
                id: true,
                projectId: true,
                sourceHandoffId: true,
                sourceChecklistId: true,
                sourceAttachmentId: true,
              },
            });
            if (
              unit.projectId !== project.id ||
              unit.sourceChecklistId !== checklist.id ||
              unit.sourceAttachmentId !== handoff.sourceAttachmentId
            ) {
              return { error: "An existing Production Unit conflicts with Stage 5 lineage." } as const;
            }
            const requiredStep = await tx.productionApprovalStep.upsert({
              where: {
                productionUnitId_sequence: {
                  productionUnitId: unit.id,
                  sequence: 1,
                },
              },
              update: {},
              create: {
                productionUnitId: unit.id,
                sequence: 1,
                isMarketingDirectorRequired: true,
                recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL,
                recipientName: STAGE_SIX_FIRST_APPROVER.name,
                recipientEmail: STAGE_SIX_FIRST_APPROVER.email,
              },
              select: { isMarketingDirectorRequired: true },
            });
            if (!requiredStep.isMarketingDirectorRequired) {
              return { error: "Production approval Step 1 is invalid." } as const;
            }
            units.push({ id: unit.id, sourceHandoffId: handoff.id });
          }
          const now = new Date();
          if (transitioned) {
            const completed = await tx.projectWorkflowStage.updateMany({
              where: {
                id: stageFive.id,
                status: ProjectWorkflowStageStatus.AVAILABLE,
              },
              data: {
                status: ProjectWorkflowStageStatus.COMPLETED,
                completedAt: now,
              },
            });

            if (completed.count === 1) {
              await tx.projectWorkflowStage.updateMany({
                where: {
                  id: stageSix.id,
                  status: ProjectWorkflowStageStatus.LOCKED,
                },
                data: {
                  status: ProjectWorkflowStageStatus.AVAILABLE,
                  unlockedAt: now,
                },
              });
            }
          }
          if (transitioned) {
            await createNotifications(
              tx,
              createDedupeNotificationData({
                userIds: [project.ownerId, ...project.coOwners.map((entry) => entry.userId)],
                actorId: user.id,
                dedupePrefix: `stage-six-activated:${project.id}`,
                type: "NEXT_STAGE_ACTIVATED",
                title: "Stage 6 available",
                message: `${units.length} Production Unit${units.length === 1 ? " is" : "s are"} ready in ${project.name}.`,
                entityType: "PROJECT",
                entityId: project.id,
                projectId: project.id,
                url: `/projects/${project.id}/stages/6`,
              }),
            );
          }
          return {
            transitioned,
            productionUnitCount: units.length,
            pendingRequestCount: project.fileChecklistRequests.length,
            warning:
              project.fileChecklistRequests.length > 0
                ? "Some checklist information requests are still pending."
                : null,
            units,
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034") &&
      conflictRetryCount < 1
    ) {
      return completeStageFive(user, input, conflictRetryCount + 1);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return { error: "Stage 5 changed at the same time. Please try again." } as const;
    }
    throw error;
  }
}

async function resolveRecipient(
  project: StageProject,
  input: {
    recipientType: ProductionApprovalRecipientType;
    recipientUserId?: string;
    recipientName?: string;
    recipientEmail?: string;
    recipientCompany?: string;
    recipientPhone?: string;
  },
) {
  if (input.recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR) {
    const recipientUserId = input.recipientUserId?.trim();
    if (!recipientUserId || !isProjectParticipant(project, recipientUserId)) {
      return { ok: false, error: "Select a current project collaborator." } as const;
    }
    const participant = getParticipants(project).find((entry) => entry.id === recipientUserId);
    if (!participant) return { ok: false, error: "The selected collaborator is unavailable." } as const;
    return {
      ok: true,
      recipientType: input.recipientType,
      recipientUserId,
      recipientName: participant.name,
      recipientEmail: participant.email,
    } as const;
  }
  const recipientEmail = normalizeEmail(input.recipientEmail ?? "");
  if (!recipientEmail) return { ok: false, error: "Enter a valid recipient email address." } as const;
  const recipientName = input.recipientName?.trim() || recipientEmail;
  if (recipientName.length > 160) return { ok: false, error: "Recipient name is too long." } as const;
  return {
    ok: true,
    recipientType: input.recipientType,
    recipientUserId: null,
    recipientName,
    recipientEmail,
  } as const;
}

function validateApproverInput(input: {
  clientRequestId: string;
  sharedFieldKeys: ProjectFileChecklistField[];
  selectedFileIds: string[];
  message?: string;
}) {
  if (!validClientRequestId(input.clientRequestId)) return "Invalid request identifier.";
  if (!uniqueAllowedFieldKeys(input.sharedFieldKeys)) return "Unknown shared-information field.";
  if (input.message && richTextToPlainText(input.message).length > 5_000) return "The approver message is too long.";
  return null;
}

async function sendExternalApproval(
  input: { stepId: string; rawToken: string; tokenHash: string },
  sendEmail: EmailSender,
) {
  const step = await withPrismaRetry(() =>
    prisma.productionApprovalStep.findFirst({
      where: {
        id: input.stepId,
        status: ProductionApprovalStepStatus.ACTIVE,
        dispatchStatus: ProductionDispatchStatus.PENDING,
        externalTokenHash: input.tokenHash,
        recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL,
      },
      select: {
        id: true,
        sequence: true,
        isMarketingDirectorRequired: true,
        recipientName: true,
        recipientEmail: true,
        message: true,
        requestedBy: { select: { name: true, email: true } },
        productionUnit: {
          select: {
            sourceAttachment: { select: { originalFileName: true } },
            project: { select: { name: true } },
          },
        },
      },
    }),
  );
  if (!step?.recipientEmail || !step.requestedBy) {
    return { error: "This approval dispatch is unavailable." } as const;
  }
  const email = buildProductionApprovalEmail({
    recipientName: step.recipientName?.trim() || step.recipientEmail,
    requesterName: displayName(step.requestedBy),
    projectName: step.productionUnit.project.name,
    unitName: step.productionUnit.sourceAttachment.originalFileName,
    stepLabel: step.isMarketingDirectorRequired
      ? "Marketing Director — Required"
      : `Step ${step.sequence}`,
    message: step.message,
    approvalUrl: buildExternalProductionApprovalUrl(input.rawToken),
  });
  let result: Awaited<ReturnType<EmailSender>>;
  try {
    result = await sendEmail({
      to: STAGE_SIX_EMAIL_DELIVERY_ADDRESS,
      ...email,
      replyTo: step.requestedBy.email,
    });
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : "The email provider could not be reached.",
    };
  }
  const now = new Date();
  if (!result.ok) {
    await withPrismaRetry(() =>
      prisma.productionApprovalStep.updateMany({
        where: {
          id: step.id,
          dispatchStatus: ProductionDispatchStatus.PENDING,
          externalTokenHash: input.tokenHash,
        },
        data: {
          dispatchStatus: ProductionDispatchStatus.FAILED,
          failedAt: now,
          failureMessage: result.error.slice(0, 5_000),
          externalTokenRevokedAt: now,
        },
      }),
    );
    return { error: `The approval email could not be sent: ${result.error}` } as const;
  }
  await withPrismaRetry(() =>
    prisma.productionApprovalStep.updateMany({
      where: {
        id: step.id,
        dispatchStatus: ProductionDispatchStatus.PENDING,
        externalTokenHash: input.tokenHash,
      },
      data: {
        dispatchStatus: ProductionDispatchStatus.SENT,
        sentAt: now,
        failedAt: null,
        failureMessage: null,
      },
    }),
  );
  return { sent: true } as const;
}

export async function configureMarketingDirector(
  user: PermissionUser,
  input: {
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
  },
  options: { sendEmail?: EmailSender } = {},
) {
  const validationError = validateApproverInput(input);
  if (validationError) return { error: validationError } as const;
  if (!input.selectedFileIds.length) {
    return { error: "Marketing Director approval must include at least one production file." } as const;
  }
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;
  const recipientData = {
    recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL,
    recipientUserId: null,
    recipientName: STAGE_SIX_FIRST_APPROVER.name,
    recipientEmail: STAGE_SIX_FIRST_APPROVER.email,
  };
  const message = sanitizeRichText(input.message) || null;
  const access = createProductionApprovalToken();
  let prepared;
  try {
    prepared = await withPrismaRetry(() =>
      prisma.$transaction(
      async (tx) => {
        const existingRequest = await tx.productionApprovalStep.findUnique({
          where: { clientRequestId: input.clientRequestId },
          select: { id: true, productionUnitId: true, status: true, dispatchStatus: true },
        });
        if (existingRequest) {
          return existingRequest.productionUnitId === input.productionUnitId
            ? ({ duplicate: true, step: existingRequest } as const)
            : ({ error: "This request identifier is already in use." } as const);
        }
        const unit = await tx.projectProductionUnit.findFirst({
          where: {
            id: input.productionUnitId,
            projectId: input.projectId,
            status: {
              in: [
                ProjectProductionUnitStatus.PREPARATION,
                ProjectProductionUnitStatus.APPROVAL_PENDING,
              ],
            },
          },
          select: { id: true },
        });
        if (!unit) return { error: "This Production Unit is no longer in preparation." } as const;
        const snapshot = await buildSharedSnapshot(tx, {
          productionUnitId: unit.id,
          fieldKeys: input.sharedFieldKeys,
          selectedFileIds: input.selectedFileIds,
        });
        if ("error" in snapshot) return { error: snapshot.error } as const;
        const updated = await tx.productionApprovalStep.updateMany({
          where: {
            productionUnitId: unit.id,
            sequence: 1,
            isMarketingDirectorRequired: true,
            clientRequestId: null,
            status: ProductionApprovalStepStatus.WAITING,
          },
          data: {
            clientRequestId: input.clientRequestId,
            ...recipientData,
            requestedById: user.id,
            sharedFieldKeys: input.sharedFieldKeys,
            selectedFileIds: input.selectedFileIds,
            sharedSnapshot: snapshot.snapshot as unknown as Prisma.InputJsonValue,
            message,
            status: ProductionApprovalStepStatus.ACTIVE,
            dispatchStatus: access
              ? ProductionDispatchStatus.PENDING
              : ProductionDispatchStatus.SENT,
            activatedAt: new Date(),
            sentAt: access ? null : new Date(),
            externalTokenHash: access?.tokenHash ?? null,
            externalTokenCreatedAt: access?.createdAt ?? null,
            externalTokenExpiresAt: access?.expiresAt ?? null,
          },
        });
        if (updated.count !== 1) {
          return { error: "The Marketing Director step has already been assigned." } as const;
        }
        await tx.projectProductionUnit.update({
          where: { id: unit.id },
          data: { status: ProjectProductionUnitStatus.APPROVAL_PENDING },
        });
        const step = await tx.productionApprovalStep.findUniqueOrThrow({
          where: {
            productionUnitId_sequence: { productionUnitId: unit.id, sequence: 1 },
          },
          select: { id: true, status: true, dispatchStatus: true },
        });
        return { duplicate: false, step } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const existing = await withPrismaRetry(() =>
        prisma.productionApprovalStep.findUnique({
          where: { clientRequestId: input.clientRequestId },
          select: { id: true, productionUnitId: true, status: true, dispatchStatus: true },
        }),
      );
      return existing?.productionUnitId === input.productionUnitId
        ? ({ duplicate: true, step: existing } as const)
        : ({ error: "The approval chain changed at the same time. Please try again." } as const);
    }
    throw error;
  }
  if ("error" in prepared || prepared.duplicate || !access) return prepared;
  const dispatch = await sendExternalApproval(
    { stepId: prepared.step.id, rawToken: access.token, tokenHash: access.tokenHash },
    options.sendEmail ?? sendResendEmail,
  );
  return "error" in dispatch
    ? ({ ...dispatch, step: prepared.step } as const)
    : prepared;
}

export async function addProductionApprover(
  user: PermissionUser,
  input: {
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
  },
) {
  const validationError = validateApproverInput(input);
  if (validationError) return { error: validationError } as const;
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;
  const recipient = await resolveRecipient(project, input);
  if (!recipient.ok) return { error: recipient.error } as const;
  const recipientData = {
    recipientType: recipient.recipientType,
    recipientUserId: recipient.recipientUserId,
    recipientName: recipient.recipientName,
    recipientEmail: recipient.recipientEmail,
  };
  const message = sanitizeRichText(input.message) || null;
  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
      async (tx) => {
        const existing = await tx.productionApprovalStep.findUnique({
          where: { clientRequestId: input.clientRequestId },
          select: { id: true, productionUnitId: true, sequence: true },
        });
        if (existing) {
          return existing.productionUnitId === input.productionUnitId
            ? ({ step: existing, duplicate: true } as const)
            : ({ error: "This request identifier is already in use." } as const);
        }
        const unit = await tx.projectProductionUnit.findFirst({
          where: {
            id: input.productionUnitId,
            projectId: input.projectId,
            status: {
              in: [
                ProjectProductionUnitStatus.PREPARATION,
                ProjectProductionUnitStatus.APPROVAL_PENDING,
              ],
            },
          },
          select: {
            id: true,
            approvalSteps: {
              orderBy: { sequence: "desc" },
              take: 1,
              select: { sequence: true },
            },
          },
        });
        if (!unit) {
          return {
            error: "Approvers can be added only while this approval chain is active.",
          } as const;
        }
        const snapshotValidation = await buildSharedSnapshot(tx, {
          productionUnitId: unit.id,
          fieldKeys: input.sharedFieldKeys,
          selectedFileIds: input.selectedFileIds,
        });
        if ("error" in snapshotValidation) {
          return { error: snapshotValidation.error } as const;
        }
        const sequence = (unit.approvalSteps[0]?.sequence ?? 1) + 1;
        const step = await tx.productionApprovalStep.create({
          data: {
            clientRequestId: input.clientRequestId,
            productionUnitId: unit.id,
            sequence,
            ...recipientData,
            requestedById: user.id,
            sharedFieldKeys: input.sharedFieldKeys,
            selectedFileIds: input.selectedFileIds,
            message,
          },
          select: { id: true, productionUnitId: true, sequence: true },
        });
        return { step, duplicate: false } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const existing = await withPrismaRetry(() =>
        prisma.productionApprovalStep.findUnique({
          where: { clientRequestId: input.clientRequestId },
          select: { id: true, productionUnitId: true, sequence: true },
        }),
      );
      return existing?.productionUnitId === input.productionUnitId
        ? ({ step: existing, duplicate: true } as const)
        : ({ error: "The approval chain changed at the same time. Please try again." } as const);
    }
    throw error;
  }
}

export async function removeProductionApprover(
  user: PermissionUser,
  input: { projectId: string; productionUnitId: string; stepId: string },
  options: { sendEmail?: EmailSender } = {},
) {
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;
  const outcome = await withPrismaRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const unit = await tx.projectProductionUnit.findFirst({
          where: {
            id: input.productionUnitId,
            projectId: input.projectId,
            status: {
              in: [
                ProjectProductionUnitStatus.PREPARATION,
                ProjectProductionUnitStatus.APPROVAL_PENDING,
              ],
            },
          },
          select: {
            id: true,
            project: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                coOwners: { select: { userId: true } },
              },
            },
            sourceAttachment: { select: { originalFileName: true } },
          },
        });
        if (!unit) return { error: "This approval chain can no longer be changed." } as const;
        const step = await tx.productionApprovalStep.findFirst({
          where: { id: input.stepId, productionUnitId: unit.id },
          select: {
            id: true,
            sequence: true,
            requestedById: true,
            isMarketingDirectorRequired: true,
            status: true,
          },
        });
        if (!step) return { error: "Approval step not found." } as const;
        if (step.isMarketingDirectorRequired || step.sequence === 1) {
          return { error: "Marketing Director — Required cannot be removed." } as const;
        }
        if (
          step.status !== ProductionApprovalStepStatus.WAITING &&
          step.status !== ProductionApprovalStepStatus.ACTIVE
        ) {
          return { error: "Completed approval steps cannot be removed." } as const;
        }
        const wasActive = step.status === ProductionApprovalStepStatus.ACTIVE;
        const laterSteps = await tx.productionApprovalStep.findMany({
          where: { productionUnitId: unit.id, sequence: { gt: step.sequence } },
          orderBy: { sequence: "asc" },
          select: { id: true, sequence: true },
        });
        await tx.notification.deleteMany({
          where: { entityType: "PRODUCTION_APPROVAL", entityId: step.id },
        });
        await tx.productionApprovalStep.delete({ where: { id: step.id } });
        for (const later of laterSteps) {
          await tx.productionApprovalStep.update({
            where: { id: later.id },
            data: { sequence: later.sequence - 1 },
          });
        }
        if (!wasActive) return { removed: true, next: null } as const;

        const next = await tx.productionApprovalStep.findFirst({
          where: {
            productionUnitId: unit.id,
            status: ProductionApprovalStepStatus.WAITING,
          },
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            productionUnitId: true,
            recipientType: true,
            recipientUserId: true,
            recipientName: true,
            sequence: true,
            sharedFieldKeys: true,
            selectedFileIds: true,
          },
        });
        if (next) {
          const activation = await activateNextStep(tx, next, unit.project);
          if ("error" in activation) throw new StageSixWorkflowError(activation.error);
          return {
            removed: true,
            next: activation.access
              ? {
                  stepId: next.id,
                  rawToken: activation.access.token,
                  tokenHash: activation.access.tokenHash,
                }
              : null,
          } as const;
        }

        await tx.projectProductionUnit.update({
          where: { id: unit.id },
          data: {
            status: ProjectProductionUnitStatus.HANDOVER_READY,
            approvedAt: new Date(),
          },
        });
        await createNotifications(
          tx,
          createDedupeNotificationData({
            userIds: [
              unit.project.ownerId,
              ...unit.project.coOwners.map((entry) => entry.userId),
              step.requestedById,
            ],
            actorId: user.id,
            dedupePrefix: `production-approval-chain-completed:${unit.id}`,
            type: "PRODUCTION_APPROVAL_APPROVED",
            title: "Production approval chain completed",
            message: `${unit.sourceAttachment.originalFileName} is ready for handover.`,
            entityType: "PRODUCTION_UNIT",
            entityId: unit.id,
            projectId: unit.project.id,
            url: `/projects/${unit.project.id}/stages/6?unit=${unit.id}`,
          }),
        );
        return { removed: true, next: null } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  if ("error" in outcome || !outcome.next) return outcome;
  const dispatch = await sendExternalApproval(
    outcome.next,
    options.sendEmail ?? sendResendEmail,
  );
  return "error" in dispatch
    ? ({ removed: true, next: null, dispatchError: dispatch.error } as const)
    : ({ removed: true, next: null } as const);
}

export async function reorderProductionApprover(
  user: PermissionUser,
  input: {
    projectId: string;
    productionUnitId: string;
    stepId: string;
    direction: "UP" | "DOWN";
  },
) {
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;

  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const unit = await tx.projectProductionUnit.findFirst({
            where: {
              id: input.productionUnitId,
              projectId: input.projectId,
              status: {
                in: [
                  ProjectProductionUnitStatus.PREPARATION,
                  ProjectProductionUnitStatus.APPROVAL_PENDING,
                ],
              },
            },
            select: {
              id: true,
              approvalSteps: {
                orderBy: [{ sequence: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  sequence: true,
                  isMarketingDirectorRequired: true,
                  status: true,
                },
              },
            },
          });
          if (!unit) return { error: "This approval chain can no longer be reordered." } as const;

          const waitingSteps = unit.approvalSteps.filter(
            (step) =>
              step.sequence > 1 &&
              !step.isMarketingDirectorRequired &&
              step.status === ProductionApprovalStepStatus.WAITING,
          );
          const currentIndex = waitingSteps.findIndex((step) => step.id === input.stepId);
          if (currentIndex < 0) {
            return { error: "Only waiting approval steps can be reordered." } as const;
          }
          const targetIndex = input.direction === "UP" ? currentIndex - 1 : currentIndex + 1;
          const current = waitingSteps[currentIndex];
          const target = waitingSteps[targetIndex];
          if (!target) return { moved: false } as const;

          const temporarySequence =
            Math.max(...unit.approvalSteps.map((step) => step.sequence)) + 1;
          await tx.productionApprovalStep.update({
            where: { id: current.id },
            data: { sequence: temporarySequence },
          });
          await tx.productionApprovalStep.update({
            where: { id: target.id },
            data: { sequence: current.sequence },
          });
          await tx.productionApprovalStep.update({
            where: { id: current.id },
            data: { sequence: target.sequence },
          });
          return { moved: true } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return { error: "The approval order changed at the same time. Please try again." } as const;
    }
    throw error;
  }
}

export async function retryProductionApprovalDispatch(
  user: PermissionUser,
  input: { projectId: string; stepId: string },
  options: { sendEmail?: EmailSender } = {},
) {
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;
  const access = createProductionApprovalToken();
  const updated = await withPrismaRetry(() =>
    prisma.productionApprovalStep.updateMany({
      where: {
        id: input.stepId,
        productionUnit: { projectId: input.projectId },
        status: ProductionApprovalStepStatus.ACTIVE,
        dispatchStatus: ProductionDispatchStatus.FAILED,
        recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL,
      },
      data: {
        dispatchStatus: ProductionDispatchStatus.PENDING,
        externalTokenHash: access.tokenHash,
        externalTokenCreatedAt: access.createdAt,
        externalTokenExpiresAt: access.expiresAt,
        externalTokenRevokedAt: null,
        failedAt: null,
        failureMessage: null,
      },
    }),
  );
  if (updated.count !== 1) return { error: "This approval email cannot be retried." } as const;
  return sendExternalApproval(
    { stepId: input.stepId, rawToken: access.token, tokenHash: access.tokenHash },
    options.sendEmail ?? sendResendEmail,
  );
}

async function activateNextStep(
  tx: Prisma.TransactionClient,
  step: {
    id: string;
    productionUnitId: string;
    recipientType: ProductionApprovalRecipientType | null;
    recipientUserId: string | null;
    recipientName: string | null;
    sequence: number;
    sharedFieldKeys: ProjectFileChecklistField[];
    selectedFileIds: string[];
  },
  project: { id: string; name: string },
) {
  if (!step.recipientType || !step.recipientName) {
    return { error: "The next approval step has no recipient." } as const;
  }
  const snapshot = await buildSharedSnapshot(tx, {
    productionUnitId: step.productionUnitId,
    fieldKeys: step.sharedFieldKeys,
    selectedFileIds: step.selectedFileIds,
  });
  if ("error" in snapshot) return { error: snapshot.error } as const;
  const access =
    step.recipientType === ProductionApprovalRecipientType.EXTERNAL_EMAIL
      ? createProductionApprovalToken()
      : null;
  const activatedAt = new Date();
  const updated = await tx.productionApprovalStep.updateMany({
    where: { id: step.id, status: ProductionApprovalStepStatus.WAITING },
    data: {
      status: ProductionApprovalStepStatus.ACTIVE,
      dispatchStatus: access
        ? ProductionDispatchStatus.PENDING
        : ProductionDispatchStatus.SENT,
      activatedAt,
      sentAt: access ? null : activatedAt,
      sharedSnapshot: snapshot.snapshot as unknown as Prisma.InputJsonValue,
      externalTokenHash: access?.tokenHash ?? null,
      externalTokenCreatedAt: access?.createdAt ?? null,
      externalTokenExpiresAt: access?.expiresAt ?? null,
    },
  });
  if (updated.count !== 1) return { error: "The next approval step changed." } as const;
  if (step.recipientUserId) {
    await createNotifications(
      tx,
      createDedupeNotificationData({
        userIds: [step.recipientUserId],
        dedupePrefix: `production-approval-requested:${step.id}`,
        type: "PRODUCTION_APPROVAL_REQUESTED",
        title: "Production approval requested",
        message: `Approval Step ${step.sequence} is ready for ${project.name}.`,
        entityType: "PRODUCTION_APPROVAL",
        entityId: step.id,
        projectId: project.id,
        url: `/production-approvals/${step.id}`,
      }),
    );
  }
  return { access } as const;
}

type ApprovalDecisionScope =
  | { kind: "authenticated"; user: PermissionUser; stepId: string }
  | { kind: "external"; token: string };

export async function decideProductionApproval(
  scope: ApprovalDecisionScope,
  input: {
    decision: "APPROVE" | "REJECT";
    comment?: string;
    confirmed?: boolean;
  },
  options: { sendEmail?: EmailSender } = {},
) {
  if (input.confirmed !== true) {
    return { error: "Confirm Approve or Reject before recording this decision." } as const;
  }
  const comment = sanitizeRichText(input.comment) || null;
  if (comment && richTextToPlainText(comment).length > 5_000) return { error: "The decision comment is too long." } as const;
  const tokenHash = scope.kind === "external" ? hashProductionExternalToken(scope.token) : null;
  if (scope.kind === "external" && !tokenHash) {
    return { error: "This approval link is unavailable." } as const;
  }
  let outcome;
  try {
    outcome = await withPrismaRetry(() =>
      prisma.$transaction(
      async (tx) => {
        const step = await tx.productionApprovalStep.findFirst({
          where:
            scope.kind === "authenticated"
              ? {
                  id: scope.stepId,
                  recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR,
                  recipientUserId: scope.user.id,
                  productionUnit: { project: accessibleStageSixProjectWhere },
                }
              : {
                  externalTokenHash: tokenHash!,
                  recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL,
                  externalTokenRevokedAt: null,
                  externalTokenExpiresAt: { gt: new Date() },
                },
          select: {
            id: true,
            sequence: true,
            productionUnitId: true,
            requestedById: true,
            status: true,
            dispatchStatus: true,
            productionUnit: {
              select: {
                status: true,
                sourceAttachment: { select: { originalFileName: true } },
                project: {
                  select: {
                    id: true,
                    name: true,
                    ownerId: true,
                    coOwners: { select: { userId: true } },
                  },
                },
              },
            },
          },
        });
        if (
          !step ||
          step.status !== ProductionApprovalStepStatus.ACTIVE ||
          step.dispatchStatus !== ProductionDispatchStatus.SENT ||
          step.productionUnit.status !== ProjectProductionUnitStatus.APPROVAL_PENDING
        ) {
          return { error: "This approval step is not active." } as const;
        }
        const decidedAt = new Date();
        const decidedByUserId = scope.kind === "authenticated" ? scope.user.id : null;
        const updated = await tx.productionApprovalStep.updateMany({
          where: {
            id: step.id,
            status: ProductionApprovalStepStatus.ACTIVE,
            dispatchStatus: ProductionDispatchStatus.SENT,
          },
          data: {
            status:
              input.decision === "APPROVE"
                ? ProductionApprovalStepStatus.APPROVED
                : ProductionApprovalStepStatus.REJECTED,
            decisionComment: comment,
            decidedAt,
            decidedByUserId,
            externalTokenRevokedAt: scope.kind === "external" ? decidedAt : undefined,
          },
        });
        if (updated.count !== 1) return { error: "This approval was already decided." } as const;
        const managerIds = [
          step.productionUnit.project.ownerId,
          ...step.productionUnit.project.coOwners.map((entry) => entry.userId),
          step.requestedById,
        ];
        if (input.decision === "REJECT") {
          await tx.projectProductionUnit.updateMany({
            where: {
              id: step.productionUnitId,
              status: ProjectProductionUnitStatus.APPROVAL_PENDING,
            },
            data: { status: ProjectProductionUnitStatus.REJECTED },
          });
          await createNotifications(
            tx,
            createDedupeNotificationData({
              userIds: managerIds,
              actorId: decidedByUserId ?? undefined,
              dedupePrefix: `production-approval-rejected:${step.id}`,
              type: "PRODUCTION_APPROVAL_REJECTED",
              title: "Production approval rejected",
              message: `${step.productionUnit.sourceAttachment.originalFileName} was rejected at Step ${step.sequence}.${comment ? ` ${comment}` : ""}`.slice(0, 500),
              entityType: "PRODUCTION_APPROVAL",
              entityId: step.id,
              projectId: step.productionUnit.project.id,
              url: `/projects/${step.productionUnit.project.id}/stages/6?unit=${step.productionUnitId}`,
            }),
          );
          return {
            decision: "REJECTED" as const,
            next: null,
            projectId: step.productionUnit.project.id,
            productionUnitId: step.productionUnitId,
          };
        }
        const next = await tx.productionApprovalStep.findFirst({
          where: {
            productionUnitId: step.productionUnitId,
            sequence: { gt: step.sequence },
            status: ProductionApprovalStepStatus.WAITING,
          },
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            productionUnitId: true,
            recipientType: true,
            recipientUserId: true,
            recipientName: true,
            sequence: true,
            sharedFieldKeys: true,
            selectedFileIds: true,
          },
        });
        if (!next) {
          await tx.projectProductionUnit.updateMany({
            where: {
              id: step.productionUnitId,
              status: ProjectProductionUnitStatus.APPROVAL_PENDING,
            },
            data: {
              status: ProjectProductionUnitStatus.HANDOVER_READY,
              approvedAt: decidedAt,
            },
          });
          await createNotifications(
            tx,
            createDedupeNotificationData({
              userIds: managerIds,
              actorId: decidedByUserId ?? undefined,
              dedupePrefix: `production-approval-chain-completed:${step.productionUnitId}`,
              type: "PRODUCTION_APPROVAL_APPROVED",
              title: "Production approval chain completed",
              message: `${step.productionUnit.sourceAttachment.originalFileName} is ready for handover.`,
              entityType: "PRODUCTION_UNIT",
              entityId: step.productionUnitId,
              projectId: step.productionUnit.project.id,
              url: `/projects/${step.productionUnit.project.id}/stages/6?unit=${step.productionUnitId}`,
            }),
          );
          return {
            decision: "APPROVED" as const,
            next: null,
            projectId: step.productionUnit.project.id,
            productionUnitId: step.productionUnitId,
          };
        }
        await createNotifications(
          tx,
          createDedupeNotificationData({
            userIds: managerIds,
            actorId: decidedByUserId ?? undefined,
            dedupePrefix: `production-approval-approved:${step.id}`,
            type: "PRODUCTION_APPROVAL_APPROVED",
            title: "Production approval accepted",
            message: `${step.productionUnit.sourceAttachment.originalFileName} passed Approval Step ${step.sequence}.`,
            entityType: "PRODUCTION_APPROVAL",
            entityId: step.id,
            projectId: step.productionUnit.project.id,
            url: `/projects/${step.productionUnit.project.id}/stages/6?unit=${step.productionUnitId}`,
          }),
        );
        const activation = await activateNextStep(tx, next, step.productionUnit.project);
        if ("error" in activation) throw new StageSixWorkflowError(activation.error);
        return {
          decision: "APPROVED" as const,
          projectId: step.productionUnit.project.id,
          productionUnitId: step.productionUnitId,
          next: activation.access
            ? { stepId: next.id, rawToken: activation.access.token, tokenHash: activation.access.tokenHash }
            : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (error instanceof StageSixWorkflowError) return { error: error.message } as const;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return { error: "This approval was already decided or changed at the same time." } as const;
    }
    throw error;
  }
  if ("error" in outcome || !outcome.next) return outcome;
  const dispatch = await sendExternalApproval(
    outcome.next,
    options.sendEmail ?? sendResendEmail,
  );
  return "error" in dispatch ? { ...outcome, dispatchError: dispatch.error } : outcome;
}

const approvalReadSelect = {
  id: true,
  sequence: true,
  isMarketingDirectorRequired: true,
  recipientType: true,
  recipientUserId: true,
  status: true,
  dispatchStatus: true,
  externalTokenExpiresAt: true,
  externalTokenRevokedAt: true,
  externalOpenedAt: true,
  message: true,
  sharedSnapshot: true,
  decisionComment: true,
  decidedAt: true,
  requestedBy: { select: { name: true, email: true } },
  productionUnit: {
    select: {
      id: true,
      sourceAttachment: { select: { originalFileName: true } },
      project: {
        select: {
          id: true,
          name: true,
          workflowStages: {
            where: {
              stageKey: ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
            },
            select: { status: true },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductionApprovalStepSelect;

function mapApprovalData(
  step: Prisma.ProductionApprovalStepGetPayload<{ select: typeof approvalReadSelect }>,
): ProductionApprovalData {
  const snapshot = parseSnapshot(step.sharedSnapshot);
  if (!snapshot || !step.requestedBy) return { state: "unavailable" };
  const state =
    step.status === ProductionApprovalStepStatus.APPROVED && step.decidedAt
      ? "approved"
      : step.status === ProductionApprovalStepStatus.REJECTED && step.decidedAt
        ? "rejected"
        : step.status === ProductionApprovalStepStatus.ACTIVE &&
            step.dispatchStatus === ProductionDispatchStatus.SENT
          ? "active"
          : null;
  if (!state) return { state: "unavailable" };
  return {
    state,
    stepId: step.id,
    project: step.productionUnit.project,
    unit: {
      id: step.productionUnit.id,
      name: step.productionUnit.sourceAttachment.originalFileName,
    },
    stepLabel: step.isMarketingDirectorRequired
      ? "Marketing Director — Required"
      : `Approval Step ${step.sequence}`,
    requestedBy: displayName(step.requestedBy),
    message: step.message,
    snapshot,
    decisionComment: step.decisionComment,
    decidedAt: step.decidedAt?.toISOString() ?? null,
  };
}

export async function getAuthenticatedProductionApprovalData(
  user: PermissionUser,
  stepId: string,
) {
  const step = await withPrismaRetry(() =>
    prisma.productionApprovalStep.findFirst({
      where: {
        id: stepId,
        recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR,
        recipientUserId: user.id,
      },
      select: approvalReadSelect,
    }),
  );
  if (!step) return { state: "invalid" } as const;
  if (
    !canOpenImplementedWorkflowStage({
      stageKey: ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
      status: step.productionUnit.project.workflowStages[0]?.status,
    })
  ) {
    return { state: "locked" } as const;
  }
  return mapApprovalData(step);
}

export async function getExternalProductionApprovalData(token: string) {
  const tokenHash = hashProductionExternalToken(token);
  if (!tokenHash) return { state: "invalid" } as const;
  const step = await withPrismaRetry(() =>
    prisma.productionApprovalStep.findFirst({
      where: {
        externalTokenHash: tokenHash,
        recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL,
      },
      select: approvalReadSelect,
    }),
  );
  if (!step) return { state: "invalid" } as const;
  if (
    (step.status === ProductionApprovalStepStatus.APPROVED ||
      step.status === ProductionApprovalStepStatus.REJECTED) &&
    step.decidedAt
  ) {
    return {
      state: "completed",
      decision:
        step.status === ProductionApprovalStepStatus.APPROVED
          ? "APPROVED"
          : "REJECTED",
      projectName: step.productionUnit.project.name,
      unitName: step.productionUnit.sourceAttachment.originalFileName,
      decidedAt: step.decidedAt?.toISOString() ?? null,
    } as const;
  }
  if (
    step.status === ProductionApprovalStepStatus.ACTIVE &&
    step.externalTokenExpiresAt &&
    step.externalTokenExpiresAt <= new Date() &&
    !step.externalTokenRevokedAt
  ) {
    return { state: "expired" } as const;
  }
  if (
    step.status === ProductionApprovalStepStatus.ACTIVE &&
    (step.externalTokenRevokedAt ||
      !step.externalTokenExpiresAt ||
      step.externalTokenExpiresAt <= new Date())
  ) {
    return { state: "unavailable" } as const;
  }
  if (!step.externalOpenedAt && step.status === ProductionApprovalStepStatus.ACTIVE) {
    await withPrismaRetry(() =>
      prisma.productionApprovalStep.updateMany({
        where: { id: step.id, externalOpenedAt: null },
        data: { externalOpenedAt: new Date() },
      }),
    );
  }
  return mapApprovalData(step);
}

async function getApprovalStepForFileScope(scope: ApprovalDecisionScope) {
  const tokenHash = scope.kind === "external" ? hashProductionExternalToken(scope.token) : null;
  if (scope.kind === "external" && !tokenHash) return null;
  return withPrismaRetry(() =>
    prisma.productionApprovalStep.findFirst({
      where:
        scope.kind === "authenticated"
          ? {
              id: scope.stepId,
              recipientUserId: scope.user.id,
              recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR,
              productionUnit: { project: accessibleStageSixProjectWhere },
            }
          : {
              externalTokenHash: tokenHash!,
              recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL,
              externalTokenExpiresAt: { gt: new Date() },
              externalTokenRevokedAt: null,
            },
      select: { status: true, sharedSnapshot: true, productionUnit: { select: { projectId: true } } },
    }),
  );
}

export async function getProductionApprovalFileUrl(
  scope: ApprovalDecisionScope,
  attachmentId: string,
  mode: "preview" | "download",
) {
  const step = await getApprovalStepForFileScope(scope);
  if (
    !step ||
    (scope.kind === "external" && step.status !== ProductionApprovalStepStatus.ACTIVE)
  ) {
    throw new Error("Approval file not found.");
  }
  const snapshot = parseSnapshot(step.sharedSnapshot);
  const allowedIds = new Set([
    ...(snapshot?.files.map((file) => file.id) ?? []),
    ...(snapshot?.fields.flatMap((field) => field.attachments.map((file) => file.id)) ?? []),
  ]);
  if (!allowedIds.has(attachmentId)) throw new Error("Approval file not found.");
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        id: attachmentId,
        projectId: step.productionUnit.projectId,
        status: AttachmentStatus.READY,
      },
      select: attachmentSelect,
    }),
  );
  if (!attachment) throw new Error("Approval file not found.");
  const fileInput = {
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  };
  return mode === "download"
    ? createPresignedDownloadUrl(fileInput)
    : createPresignedPreviewUrl(fileInput);
}

export async function addProductionUnitFile(
  user: PermissionUser,
  input: { projectId: string; productionUnitId: string; attachmentId: string },
) {
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;
  const unit = await withPrismaRetry(() =>
    prisma.projectProductionUnit.findFirst({
      where: {
        id: input.productionUnitId,
        projectId: input.projectId,
        status: { in: [ProjectProductionUnitStatus.PREPARATION, ProjectProductionUnitStatus.REJECTED] },
      },
      select: { id: true },
    }),
  );
  if (!unit) return { error: "Production files are locked for this unit." } as const;
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        id: input.attachmentId,
        projectId: input.projectId,
        status: AttachmentStatus.READY,
        assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET,
      },
      select: { id: true },
    }),
  );
  if (!attachment) {
    return { error: "The production file is invalid or belongs to another project." } as const;
  }
  try {
    const file = await withPrismaRetry(() =>
      prisma.projectProductionUnitFile.create({
        data: {
          productionUnitId: unit.id,
          attachmentId: attachment.id,
          addedById: user.id,
        },
        select: { id: true, productionUnitId: true, attachmentId: true },
      }),
    );
    return { file, duplicate: false } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await withPrismaRetry(() =>
        prisma.projectProductionUnitFile.findUnique({
          where: { attachmentId: attachment.id },
          select: { id: true, productionUnitId: true, attachmentId: true },
        }),
      );
      return existing?.productionUnitId === unit.id
        ? ({ file: existing, duplicate: true } as const)
        : ({ error: "This file already belongs to another Production Unit." } as const);
    }
    throw error;
  }
}

export async function removeProductionUnitFile(
  user: PermissionUser,
  input: { projectId: string; productionUnitId: string; attachmentId: string },
) {
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;
  const removed = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const selectedByApproval = await tx.productionApprovalStep.count({
        where: {
          productionUnitId: input.productionUnitId,
          selectedFileIds: { has: input.attachmentId },
        },
      });
      if (selectedByApproval > 0) return { count: 0, selected: true } as const;
      const result = await tx.projectProductionUnitFile.deleteMany({
        where: {
          productionUnitId: input.productionUnitId,
          attachmentId: input.attachmentId,
          productionUnit: {
            projectId: input.projectId,
            status: { in: [ProjectProductionUnitStatus.PREPARATION, ProjectProductionUnitStatus.REJECTED] },
          },
        },
      });
      return { count: result.count, selected: false } as const;
    }),
  );
  if (removed.selected) {
    return { error: "This file is selected in the approval chain and cannot be removed." } as const;
  }
  return removed.count === 1
    ? ({ removed: true } as const)
    : ({ error: "This production file cannot be removed." } as const);
}

export async function handoverProductionUnit(
  user: PermissionUser,
  input: {
    clientRequestId: string;
    projectId: string;
    productionUnitId: string;
    route: ProductionHandoverRoute;
    recipientType: ProductionApprovalRecipientType;
    recipientUserId?: string;
    recipientName?: string;
    recipientEmail?: string;
    recipientCompany?: string;
    recipientPhone?: string;
    sharedFieldKeys: ProjectFileChecklistField[];
    selectedFileIds: string[];
    note?: string;
  },
  options: { sendEmail?: EmailSender } = {},
) {
  if (!validClientRequestId(input.clientRequestId)) return { error: "Invalid request identifier." } as const;
  if (!uniqueAllowedFieldKeys(input.sharedFieldKeys)) return { error: "Unknown shared-information field." } as const;
  if (!input.selectedFileIds.length) return { error: "Select at least one approved production file." } as const;
  const note = sanitizeRichText(input.note) || null;
  if (note && richTextToPlainText(note).length > 5_000) return { error: "The handover note is too long." } as const;
  const isInternal = input.route === ProductionHandoverRoute.PURCHASE_DEPARTMENT;
  if (
    isInternal &&
    input.recipientType !== ProductionApprovalRecipientType.EXISTING_COLLABORATOR
  ) {
    return { error: "Internal handover requires an existing project participant." } as const;
  }
  if (
    !isInternal &&
    input.recipientType !== ProductionApprovalRecipientType.EXTERNAL_EMAIL
  ) {
    return { error: "External handover requires external recipient details." } as const;
  }
  const recipientCompany = input.recipientCompany?.trim() || null;
  const recipientPhone = input.recipientPhone
    ? normalizeInternationalPhone(input.recipientPhone)
    : null;
  if (!isInternal && !recipientCompany) {
    return { error: "Enter the external recipient company name." } as const;
  }
  if (recipientCompany && recipientCompany.length > 160) {
    return { error: "The external recipient company name is too long." } as const;
  }
  if (!isInternal && !input.recipientName?.trim()) {
    return { error: "Enter the external contact name." } as const;
  }
  if (!isInternal && !recipientPhone) {
    return {
      error: "Enter a valid external phone number including country code.",
    } as const;
  }
  const project = await getStageSixManagerProject(user, input.projectId);
  if (!project) return { error: "You do not have permission to manage Stage 6." } as const;
  const recipient = await resolveRecipient(project, input);
  if (!recipient.ok) return { error: recipient.error } as const;
  const recipientData = {
    recipientType: recipient.recipientType,
    recipientUserId: recipient.recipientUserId,
    recipientName: recipient.recipientName,
    recipientEmail: recipient.recipientEmail,
    recipientCompany: isInternal ? null : recipientCompany,
    recipientPhone: isInternal ? null : recipientPhone,
  };
  const requester = await withPrismaRetry(() =>
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } }),
  );
  if (!requester) return { error: "The handover sender was not found." } as const;
  const access = createProductionHandoverToken();
  let prepared;
  try {
    prepared = await withPrismaRetry(() =>
      prisma.$transaction(
      async (tx) => {
      const unit = await tx.projectProductionUnit.findFirst({
          where: {
            id: input.productionUnitId,
            projectId: input.projectId,
            status: ProjectProductionUnitStatus.HANDOVER_READY,
          },
          select: {
            id: true,
            sourceAttachment: { select: { originalFileName: true } },
            handover: {
              select: { id: true, clientRequestId: true, deliveryStatus: true },
            },
            approvalSteps: {
              where: { status: ProductionApprovalStepStatus.APPROVED },
              select: { selectedFileIds: true },
            },
          },
        });
        if (!unit) {
          const completed = await tx.projectProductionHandover.findUnique({
            where: { productionUnitId: input.productionUnitId },
            select: { id: true, deliveryStatus: true },
          });
          return completed?.deliveryStatus === ProductionHandoverDeliveryStatus.SENT
            ? ({ duplicate: true, handover: completed, unitName: "" } as const)
            : ({ error: "This Production Unit is not ready for handover." } as const);
        }
        const approvedFileIds = new Set(
          unit.approvalSteps.flatMap((step) => step.selectedFileIds),
        );
        if (input.selectedFileIds.some((id) => !approvedFileIds.has(id))) {
          return { error: "Handover may include only production files reviewed in the completed approval chain." } as const;
        }
        const snapshot = await buildSharedSnapshot(tx, {
          productionUnitId: unit.id,
          fieldKeys: input.sharedFieldKeys,
          selectedFileIds: input.selectedFileIds,
        });
        if ("error" in snapshot) return { error: snapshot.error } as const;
        let handover;
        if (unit.handover) {
          if (unit.handover.deliveryStatus === ProductionHandoverDeliveryStatus.SENT) {
            return { duplicate: true, handover: unit.handover, unitName: unit.sourceAttachment.originalFileName } as const;
          }
          if (unit.handover.deliveryStatus === ProductionHandoverDeliveryStatus.PENDING) {
            return { error: "This handover is already being sent." } as const;
          }
          handover = await tx.projectProductionHandover.update({
            where: { id: unit.handover.id },
            data: {
              clientRequestId: input.clientRequestId,
              route: input.route,
              ...recipientData,
              sharedFieldKeys: input.sharedFieldKeys,
              selectedFileIds: input.selectedFileIds,
              contentSnapshot: snapshot.snapshot as unknown as Prisma.InputJsonValue,
              note,
              requestedById: user.id,
              deliveryStatus: ProductionHandoverDeliveryStatus.PENDING,
              failedAt: null,
              failureMessage: null,
              externalTokenHash: access.tokenHash,
              externalTokenCreatedAt: access.createdAt,
              externalTokenExpiresAt: access.expiresAt,
              externalTokenRevokedAt: null,
            },
            select: { id: true, deliveryStatus: true },
          });
        } else {
          handover = await tx.projectProductionHandover.create({
            data: {
              clientRequestId: input.clientRequestId,
              productionUnitId: unit.id,
              route: input.route,
              ...recipientData,
              sharedFieldKeys: input.sharedFieldKeys,
              selectedFileIds: input.selectedFileIds,
              contentSnapshot: snapshot.snapshot as unknown as Prisma.InputJsonValue,
              note,
              requestedById: user.id,
              externalTokenHash: access.tokenHash,
              externalTokenCreatedAt: access.createdAt,
              externalTokenExpiresAt: access.expiresAt,
            },
            select: { id: true, deliveryStatus: true },
          });
        }
        return { duplicate: false, handover, unitName: unit.sourceAttachment.originalFileName } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const existing = await withPrismaRetry(() =>
        prisma.projectProductionHandover.findFirst({
          where: {
            OR: [
              { productionUnitId: input.productionUnitId },
              { clientRequestId: input.clientRequestId },
            ],
          },
          select: { id: true, productionUnitId: true, deliveryStatus: true },
        }),
      );
      if (
        existing?.productionUnitId === input.productionUnitId &&
        existing.deliveryStatus === ProductionHandoverDeliveryStatus.SENT
      ) {
        return { duplicate: true, handover: existing, unitName: "" } as const;
      }
      if (
        existing?.productionUnitId === input.productionUnitId &&
        existing.deliveryStatus === ProductionHandoverDeliveryStatus.PENDING
      ) {
        return { error: "This handover is already being sent." } as const;
      }
      return { error: "The handover changed at the same time. Please try again." } as const;
    }
    throw error;
  }
  if ("error" in prepared || prepared.duplicate) return prepared;
  const email = buildProductionHandoverEmail({
    recipientName: recipient.recipientName,
    senderName: displayName(requester),
    projectName: project.name,
    unitName: prepared.unitName,
    routeLabel:
      isInternal ? "Internal" : "External",
    recipientCompany,
    recipientPhone,
    note: input.note,
    handoverUrl: buildExternalProductionHandoverUrl(access.token),
  });
  let result: Awaited<ReturnType<EmailSender>>;
  try {
    result = await (options.sendEmail ?? sendResendEmail)({
      to: STAGE_SIX_EMAIL_DELIVERY_ADDRESS,
      ...email,
      replyTo: requester.email,
    });
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : "The email provider could not be reached.",
    };
  }
  const now = new Date();
  if (!result.ok) {
    await withPrismaRetry(() =>
      prisma.projectProductionHandover.updateMany({
        where: {
          id: prepared.handover.id,
          deliveryStatus: ProductionHandoverDeliveryStatus.PENDING,
          externalTokenHash: access.tokenHash,
        },
        data: {
          deliveryStatus: ProductionHandoverDeliveryStatus.FAILED,
          failedAt: now,
          failureMessage: result.error.slice(0, 5_000),
          externalTokenRevokedAt: now,
        },
      }),
    );
    return { error: `The handover email could not be sent: ${result.error}` } as const;
  }
  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const delivered = await tx.projectProductionHandover.updateMany({
        where: {
          id: prepared.handover.id,
          deliveryStatus: ProductionHandoverDeliveryStatus.PENDING,
          externalTokenHash: access.tokenHash,
        },
        data: {
          deliveryStatus: ProductionHandoverDeliveryStatus.SENT,
          providerMessageId: result.id ?? null,
          sentAt: now,
          handedOverById: user.id,
          failedAt: null,
          failureMessage: null,
        },
      });
      if (delivered.count !== 1) return { error: "The handover delivery state changed." } as const;
      const updatedUnit = await tx.projectProductionUnit.updateMany({
        where: {
          id: input.productionUnitId,
          projectId: input.projectId,
          status: ProjectProductionUnitStatus.HANDOVER_READY,
        },
        data: { status: ProjectProductionUnitStatus.HANDED_OVER, handedOverAt: now },
      });
      if (updatedUnit.count !== 1) {
        throw new Error("The Production Unit changed before handover completed.");
      }
      await createNotifications(
        tx,
        createDedupeNotificationData({
          userIds: [
            project.ownerId,
            ...project.coOwners.map((entry) => entry.userId),
            recipient.recipientUserId,
          ],
          actorId: user.id,
          dedupePrefix: `production-handover-completed:${prepared.handover.id}`,
          type: "PRODUCTION_HANDOVER_COMPLETED",
          title: "Production handover completed",
          message: `${prepared.unitName} was handed over successfully.`,
          entityType: "PRODUCTION_UNIT",
          entityId: input.productionUnitId,
          projectId: project.id,
          url: `/projects/${project.id}/stages/6?unit=${input.productionUnitId}`,
        }),
      );
      return { handedOver: true, handoverId: prepared.handover.id } as const;
    }),
  );
}

export async function getExternalProductionHandoverData(token: string) {
  const tokenHash = hashProductionExternalToken(token);
  if (!tokenHash) return { state: "invalid" } as const;
  const handover = await withPrismaRetry(() =>
    prisma.projectProductionHandover.findFirst({
      where: { externalTokenHash: tokenHash },
      select: {
        route: true,
        note: true,
        deliveryStatus: true,
        sentAt: true,
        externalTokenExpiresAt: true,
        externalTokenRevokedAt: true,
        contentSnapshot: true,
        handedOverBy: { select: { name: true, email: true } },
        productionUnit: {
          select: {
            id: true,
            sourceAttachment: { select: { originalFileName: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    }),
  );
  if (!handover) return { state: "invalid" } as const;
  if (
    handover.externalTokenExpiresAt &&
    handover.externalTokenExpiresAt <= new Date() &&
    !handover.externalTokenRevokedAt
  ) {
    return { state: "expired" } as const;
  }
  const snapshot = parseSnapshot(handover.contentSnapshot);
  if (
    handover.deliveryStatus !== ProductionHandoverDeliveryStatus.SENT ||
    !handover.sentAt ||
    !handover.handedOverBy ||
    !snapshot ||
    handover.externalTokenRevokedAt ||
    !handover.externalTokenExpiresAt ||
    handover.externalTokenExpiresAt <= new Date()
  ) {
    return { state: "unavailable" } as const;
  }
  return {
    state: "active",
    project: handover.productionUnit.project,
    unit: {
      id: handover.productionUnit.id,
      name: handover.productionUnit.sourceAttachment.originalFileName,
    },
    sender: displayName(handover.handedOverBy),
    route: handover.route,
    note: handover.note,
    snapshot,
    sentAt: handover.sentAt.toISOString(),
  } as const;
}

export async function getProductionHandoverFileUrl(
  token: string,
  attachmentId: string,
  mode: "preview" | "download",
) {
  const tokenHash = hashProductionExternalToken(token);
  if (!tokenHash) throw new Error("Handover file not found.");
  const handover = await withPrismaRetry(() =>
    prisma.projectProductionHandover.findFirst({
      where: {
        externalTokenHash: tokenHash,
        deliveryStatus: ProductionHandoverDeliveryStatus.SENT,
        externalTokenRevokedAt: null,
        externalTokenExpiresAt: { gt: new Date() },
      },
      select: {
        contentSnapshot: true,
        productionUnit: { select: { projectId: true } },
      },
    }),
  );
  const snapshot = handover ? parseSnapshot(handover.contentSnapshot) : null;
  const allowedIds = new Set([
    ...(snapshot?.files.map((file) => file.id) ?? []),
    ...(snapshot?.fields.flatMap((field) => field.attachments.map((file) => file.id)) ?? []),
  ]);
  if (!handover || !allowedIds.has(attachmentId)) throw new Error("Handover file not found.");
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        id: attachmentId,
        projectId: handover.productionUnit.projectId,
        status: AttachmentStatus.READY,
      },
      select: attachmentSelect,
    }),
  );
  if (!attachment) throw new Error("Handover file not found.");
  const fileInput = {
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  };
  return mode === "download"
    ? createPresignedDownloadUrl(fileInput)
    : createPresignedPreviewUrl(fileInput);
}

export async function completeStageSix(
  user: PermissionUser,
  input: { projectId: string },
  conflictRetryCount = 0,
) {
  const accessProject = await getStageSixManagerProject(user, input.projectId);
  if (!accessProject) return { error: "You do not have permission to complete Stage 6." } as const;
  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const project = await tx.project.findUnique({
            where: { id: input.projectId },
            select: {
              id: true,
              name: true,
              ownerId: true,
              coOwners: { select: { userId: true } },
              productionUnits: { select: { id: true, status: true } },
              workflowStages: {
                select: {
                  id: true,
                  stageKey: true,
                  status: true,
                  unlockedAt: true,
                  completedAt: true,
                },
              },
            },
          });
          if (!project) return { error: "Project not found." } as const;
          const stageSix = project.workflowStages.find(
            (stage) => stage.stageKey === ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
          );
          const stageSeven = project.workflowStages.find(
            (stage) => stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
          );
          if (!stageSix || !stageSeven) {
            return { error: "Stage 6 and Stage 7 workflow records are required." } as const;
          }
          const completionMode = getWorkflowStageCompletionMode(
            project.workflowStages,
            ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
          );
          if (completionMode === "UNAVAILABLE") {
            return { error: "Stage 6 is not currently available." } as const;
          }
          if (!project.productionUnits.length) {
            return { error: "Stage 6 has no Production Units." } as const;
          }
          const incomplete = project.productionUnits.filter(
            (unit) =>
              unit.status !== ProjectProductionUnitStatus.HANDOVER_READY &&
              unit.status !== ProjectProductionUnitStatus.HANDED_OVER,
          );
          if (incomplete.length) {
            return {
              error: `${incomplete.length} Production Unit${incomplete.length === 1 ? " has" : "s have"} not completed approval.`,
              incompleteUnitIds: incomplete.map((unit) => unit.id),
            } as const;
          }
          const transitioned = completionMode === "TRANSITION";
          const now = new Date();
          if (transitioned) {
            const completed = await tx.projectWorkflowStage.updateMany({
              where: {
                id: stageSix.id,
                status: ProjectWorkflowStageStatus.AVAILABLE,
              },
              data: {
                status: ProjectWorkflowStageStatus.COMPLETED,
                completedAt: now,
              },
            });

            if (completed.count === 1) {
              await tx.projectWorkflowStage.updateMany({
                where: {
                  id: stageSeven.id,
                  status: ProjectWorkflowStageStatus.LOCKED,
                },
                data: {
                  status: ProjectWorkflowStageStatus.AVAILABLE,
                  unlockedAt: now,
                },
              });
            }
          }
          if (transitioned) {
            await createNotifications(
              tx,
              createDedupeNotificationData({
                userIds: [project.ownerId, ...project.coOwners.map((entry) => entry.userId)],
                actorId: user.id,
                dedupePrefix: `stage-seven-activated:${project.id}`,
                type: "NEXT_STAGE_ACTIVATED",
                title: "Stage 7 available",
                message: `Production approval is complete for ${project.name}.`,
                entityType: "PROJECT",
                entityId: project.id,
                projectId: project.id,
                url: `/projects/${project.id}/stages/7`,
              }),
            );
          }
          return {
            transitioned,
            productionUnitCount: project.productionUnits.length,
            stageSevenAvailable: true,
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034") &&
      conflictRetryCount < 1
    ) {
      return completeStageSix(user, input, conflictRetryCount + 1);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return { error: "Stage 6 changed at the same time. Please try again." } as const;
    }
    throw error;
  }
}
