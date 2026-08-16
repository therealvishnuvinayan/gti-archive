import { randomUUID } from "node:crypto";

import {
  AttachmentStatus,
  Prisma,
  ProjectFileChecklistField,
  ProjectFileChecklistItemStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestStatus,
  ProjectFileChecklistRequestWorkflowStatus,
  ProjectFileChecklistResponseSource,
  ProjectWorkflowStageKey,
  UserRole,
} from "@prisma/client";

import {
  buildExternalChecklistRequestUrl,
  createExternalChecklistToken,
} from "@/lib/checklist-external-token";
import { buildChecklistInformationRequestEmail } from "@/lib/email/checklist-information-request";
import { sendResendEmail } from "@/lib/email/resend";
import {
  hasProjectPermission,
  isGlobalProjectAdministrator,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";
import { publishNotificationChanges } from "@/lib/realtime/server";
import {
  getProjectStageAccessRecordById,
  type ProjectStageAccessRecord,
} from "@/lib/project-stage-data";
import {
  ACCESSIBLE_WORKFLOW_STAGE_STATUSES,
  canOpenImplementedWorkflowStage,
} from "@/lib/workflow-stage-access";
import {
  getStageFiveFieldDefinition,
  STAGE_FIVE_FIELD_KEYS,
  STAGE_FIVE_FIELD_LABELS,
  type StageFiveFieldDefinition,
} from "@/lib/stage-five-fields";
import {
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
} from "@/lib/storage/s3";
import { getStageFiveCompletionState } from "@/lib/stage-six";

export { STAGE_FIVE_FIELD_KEYS, STAGE_FIVE_FIELD_LABELS } from "@/lib/stage-five-fields";
export { completeStageFive } from "@/lib/stage-six";

export type StageFiveChecklistValue = {
  text?: string;
  values?: string[];
  included?: boolean;
};

export type StageFiveAttachmentRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

export type StageFiveChecklistItemRecord = {
  fieldKey: ProjectFileChecklistField;
  value: StageFiveChecklistValue;
  status: ProjectFileChecklistItemStatus;
  attachments: StageFiveAttachmentRecord[];
  latestRequest: {
    id: string;
    channel: ProjectFileChecklistRequestChannel;
    status: ProjectFileChecklistRequestStatus;
    workflowStatus: ProjectFileChecklistRequestWorkflowStatus;
    recipient: string;
    requestedAt: string;
  } | null;
};

export type StageFiveFileRecord = {
  handoffId: string;
  checklistId: string;
  sourceAttachment: StageFiveAttachmentRecord;
  handedOffAt: string;
  items: StageFiveChecklistItemRecord[];
};

export type StageFiveParticipantRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type StageFiveWorkspaceData = {
  files: StageFiveFileRecord[];
  participants: StageFiveParticipantRecord[];
  canEdit: boolean;
  canComplete: boolean;
  stageCompleted: boolean;
  pendingRequestCount: number;
};

export type StageFiveChecklistRequestData = {
  id: string;
  project: { id: string; name: string };
  handoffId: string;
  file: StageFiveAttachmentRecord;
  field: StageFiveFieldDefinition;
  message: string | null;
  status: ProjectFileChecklistRequestWorkflowStatus;
  requestedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  requestedBy: { id: string; name: string };
  recipient: { id: string; name: string };
  respondedBy: { id: string; name: string } | null;
  response: {
    value: StageFiveChecklistValue;
    attachments: StageFiveAttachmentRecord[];
  };
  canRespond: boolean;
};

type StageFiveProject = ProjectStageAccessRecord;

const accessibleStageFiveProjectWhere = {
  workflowStages: {
    some: {
      stageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
      status: { in: [...ACCESSIBLE_WORKFLOW_STAGE_STATUSES] },
    },
  },
} satisfies Prisma.ProjectWhereInput;

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function stageStatus(project: StageFiveProject, stageKey: ProjectWorkflowStageKey) {
  return project.workflowStages.find((stage) => stage.stageKey === stageKey)?.status;
}

export function canManageStageFive(
  user: PermissionUser,
  project: StageFiveProject,
) {
  return (
    isGlobalProjectAdministrator(user) &&
    hasProjectPermission(user, project, "file.uploadAttachment")
  );
}

async function getAuthorizedProject(
  user: PermissionUser,
  projectId: string,
  stageKey: ProjectWorkflowStageKey,
) {
  const project = await getProjectStageAccessRecordById(projectId);

  if (
    !project ||
    !hasProjectPermission(user, project, "project.view") ||
    !hasProjectPermission(user, project, "stage.view")
  ) {
    return null;
  }
  if (
    !canOpenImplementedWorkflowStage({
      stageKey,
      status: stageStatus(project, stageKey),
    })
  ) {
    return null;
  }

  return project;
}

const attachmentSelect = {
  id: true,
  originalFileName: true,
  mimeType: true,
  fileSize: true,
} satisfies Prisma.ProjectAttachmentSelect;

function mapAttachment(attachment: {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}): StageFiveAttachmentRecord {
  return {
    id: attachment.id,
    name: attachment.originalFileName,
    mimeType: attachment.mimeType,
    size: attachment.fileSize,
  };
}

function hasMeaningfulChecklistValue(
  value: Prisma.JsonValue | null | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.some((entry) => hasMeaningfulChecklistValue(entry));
  }

  return Object.values(value).some((entry) =>
    hasMeaningfulChecklistValue(entry),
  );
}

export async function hasStageFiveDownstreamActivityForAttachment(
  tx: Prisma.TransactionClient,
  input: { projectId: string; attachmentId: string },
) {
  const handoff = await tx.projectStageFileHandoff.findFirst({
    where: {
      projectId: input.projectId,
      sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
      sourceAttachmentId: input.attachmentId,
      targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
    },
    select: {
      id: true,
      checklist: {
        select: {
          id: true,
          _count: { select: { requests: true } },
          items: {
            select: {
              value: true,
              status: true,
              _count: { select: { attachments: true, requests: true } },
            },
          },
        },
      },
    },
  });

  const checklist = handoff?.checklist;
  const hasActivity = Boolean(
    checklist &&
      (checklist._count.requests > 0 ||
        checklist.items.some(
          (item) =>
            item.status !== ProjectFileChecklistItemStatus.PENDING ||
            item._count.attachments > 0 ||
            item._count.requests > 0 ||
            hasMeaningfulChecklistValue(item.value),
        )),
  );

  return {
    hasActivity,
    handoffId: handoff?.id ?? null,
    checklistId: checklist?.id ?? null,
  };
}

function parseChecklistValue(value: Prisma.JsonValue | null): StageFiveChecklistValue {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  const record = value as Record<string, Prisma.JsonValue>;
  return {
    ...(typeof record.text === "string" ? { text: record.text } : {}),
    ...(Array.isArray(record.values)
      ? { values: record.values.filter((item): item is string => typeof item === "string") }
      : {}),
    ...(typeof record.included === "boolean" ? { included: record.included } : {}),
  };
}

function loadStageFiveChecklist(handoffId: string) {
  return withPrismaRetry(() =>
    prisma.projectFileChecklist.findUnique({
      where: { handoffId },
      relationLoadStrategy: "join",
      select: {
        id: true,
        items: {
          select: {
            fieldKey: true,
            value: true,
            status: true,
            attachments: {
              select: { attachment: { select: attachmentSelect } },
            },
            requests: {
              where: {
                workflowStatus: {
                  in: [
                    ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
                    ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
                  ],
                },
              },
              orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                id: true,
                channel: true,
                status: true,
                workflowStatus: true,
                recipientName: true,
                recipientEmail: true,
                recipientUser: { select: { name: true, email: true } },
                requestedAt: true,
              },
            },
          },
        },
      },
    }),
  );
}

function getParticipants(project: StageFiveProject): StageFiveParticipantRecord[] {
  const candidates = [
    ...(project.owner ? [{ user: project.owner, role: "Project Owner" }] : []),
    ...project.coOwners.map(({ user }) => ({ user, role: "Project Co-Owner" })),
    ...project.executors.map(({ user }) => ({ user, role: "Project Executor" })),
    ...project.collaborators.map(({ user }) => ({ user, role: "Project Collaborator" })),
  ];
  const unique = new Map<string, StageFiveParticipantRecord>();
  for (const { user, role } of candidates) {
    if (!unique.has(user.id)) {
      unique.set(user.id, { id: user.id, name: displayName(user), email: user.email, role });
    }
  }
  return [...unique.values()];
}

export async function getStageFiveWorkspaceData(
  user: PermissionUser,
  projectId: string,
  selectedHandoffId?: string | null,
): Promise<StageFiveWorkspaceData | null> {
  const project = await getAuthorizedProject(
    user,
    projectId,
    ProjectWorkflowStageKey.FINAL_LAYOUT,
  );
  if (!project || !canManageStageFive(user, project)) return null;

  const handoffs = await withPrismaRetry(() =>
    prisma.projectStageFileHandoff.findMany({
      where: {
        projectId,
        sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
        targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
      },
      relationLoadStrategy: "join",
      orderBy: [{ handedOffAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        handedOffAt: true,
        sourceAttachment: { select: attachmentSelect },
        checklist: { select: { id: true } },
      },
    }),
  );

  const selectedHandoff =
    handoffs.find((handoff) => handoff.id === selectedHandoffId) ?? handoffs[0];
  let selectedChecklist:
    | Awaited<ReturnType<typeof loadStageFiveChecklist>>
    | null = null;

  if (selectedHandoff) {
    selectedChecklist = await loadStageFiveChecklist(selectedHandoff.id);
    if (!selectedChecklist) {
      const created = await withPrismaRetry(() =>
        prisma.projectFileChecklist.create({
          data: {
            projectId,
            handoffId: selectedHandoff.id,
            sourceAttachmentId: selectedHandoff.sourceAttachment.id,
          },
          select: { id: true },
        }),
      );
      selectedChecklist = { ...created, items: [] };
    }
  }

  const files: StageFiveFileRecord[] = handoffs.map((handoff) => {
    const checklist =
      handoff.id === selectedHandoff?.id ? selectedChecklist : null;
    const checklistItems = checklist?.items ?? [];
    const itemByKey = new Map(
      checklistItems.map((item) => [item.fieldKey, item]),
    );

    return {
      handoffId: handoff.id,
      checklistId: checklist?.id ?? handoff.checklist?.id ?? "",
      sourceAttachment: mapAttachment(handoff.sourceAttachment),
      handedOffAt: handoff.handedOffAt.toISOString(),
      items:
        handoff.id === selectedHandoff?.id
          ? STAGE_FIVE_FIELD_KEYS.map((fieldKey) => {
              const item = itemByKey.get(fieldKey);
              const latestRequest = item?.requests[0];
              return {
                fieldKey,
                value: item ? parseChecklistValue(item.value) : {},
                status:
                  item?.status ?? ProjectFileChecklistItemStatus.PENDING,
                attachments:
                  item?.attachments.map(({ attachment }) =>
                    mapAttachment(attachment),
                  ) ?? [],
                latestRequest: latestRequest
                  ? {
                      id: latestRequest.id,
                      channel: latestRequest.channel,
                      status: latestRequest.status,
                      workflowStatus: latestRequest.workflowStatus,
                      recipient:
                        latestRequest.recipientName?.trim() ||
                        latestRequest.recipientUser?.name?.trim() ||
                        latestRequest.recipientEmail ||
                        latestRequest.recipientUser?.email ||
                        "Recipient",
                      requestedAt: latestRequest.requestedAt.toISOString(),
                    }
                  : null,
              };
            })
          : [],
    };
  });

  const completionState = await getStageFiveCompletionState(user, projectId);

  return {
    files,
    participants: getParticipants(project).filter((participant) => participant.id !== user.id),
    canEdit: true,
    canComplete: completionState?.canComplete ?? false,
    stageCompleted: completionState?.completed ?? false,
    pendingRequestCount: completionState?.pendingRequestCount ?? 0,
  };
}

function validateChecklistValue(
  fieldKey: ProjectFileChecklistField,
  value: StageFiveChecklistValue,
): { error: string } | { value: StageFiveChecklistValue } {
  const field = getStageFiveFieldDefinition(fieldKey);
  if (!field) return { error: "Unknown checklist field." };
  const rawText = typeof value.text === "string" ? value.text.trim() : "";
  const richTextControl =
    field.control === "textarea" ||
    field.control === "text-attachment" ||
    field.control === "health-warning";
  const text = richTextControl ? sanitizeRichText(rawText) : rawText;
  const textLength = richTextControl ? richTextToPlainText(text).length : text.length;
  if (textLength > 20_000) return { error: `${STAGE_FIVE_FIELD_LABELS[fieldKey]} is too long.` };
  const values = Array.isArray(value.values)
    ? Array.from(
        new Set(value.values.map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean)),
      )
    : [];
  const maxValueLength =
    fieldKey === ProjectFileChecklistField.COMPULSORY_TEXT ||
    fieldKey === ProjectFileChecklistField.MARKETING_COPY
      ? 2_000
      : 150;
  if (values.length > 50 || values.some((item) => item.length > maxValueLength)) {
    return { error: `${STAGE_FIVE_FIELD_LABELS[fieldKey]} has too many or overly long values.` };
  }
  const normalizedValues =
    (field.control === "multi-value" || field.control === "finishes") &&
    values.length === 0 &&
    text
      ? [text]
      : values;
  const normalizedValue: StageFiveChecklistValue =
    field.control === "text" ||
    field.control === "textarea" ||
    field.control === "text-attachment"
      ? { ...(text ? { text } : {}) }
      : field.control === "health-warning"
        ? {
            ...(text ? { text } : {}),
            included: Boolean(value.included),
          }
        : field.control === "multi-value" || field.control === "finishes"
          ? { ...(normalizedValues.length ? { values: normalizedValues } : {}) }
          : {};
  return {
    value: normalizedValue,
  };
}

function valueIsFilled(value: StageFiveChecklistValue, attachmentIds: string[]) {
  return Boolean(
    value.text?.trim() ||
      value.values?.length ||
      value.included ||
      attachmentIds.length,
  );
}

export async function saveStageFiveChecklist(
  user: PermissionUser,
  input: {
    projectId: string;
    handoffId: string;
    items: Array<{
      fieldKey: ProjectFileChecklistField;
      value: StageFiveChecklistValue;
      attachmentIds: string[];
    }>;
  },
) {
  const project = await getAuthorizedProject(
    user,
    input.projectId,
    ProjectWorkflowStageKey.FINAL_LAYOUT,
  );
  if (!project || !canManageStageFive(user, project)) {
    return { error: "You do not have permission to edit this file checklist." } as const;
  }

  const checklist = await withPrismaRetry(() =>
    prisma.projectFileChecklist.findFirst({
      where: {
        projectId: input.projectId,
        handoffId: input.handoffId,
        handoff: {
          projectId: input.projectId,
          targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
        },
      },
      select: { id: true },
    }),
  );
  if (!checklist) return { error: "The selected Stage 5 file was not found." } as const;

  const inputByField = new Map(input.items.map((item) => [item.fieldKey, item]));
  if (inputByField.size !== input.items.length) return { error: "Duplicate checklist fields are not allowed." } as const;
  for (const fieldKey of inputByField.keys()) {
    if (!STAGE_FIVE_FIELD_KEYS.includes(fieldKey)) return { error: "Unknown checklist field." } as const;
  }

  const prepared: Array<{
    fieldKey: ProjectFileChecklistField;
    value: StageFiveChecklistValue;
    attachmentIds: string[];
  }> = [];
  for (const fieldKey of STAGE_FIVE_FIELD_KEYS) {
    const item = inputByField.get(fieldKey) ?? { fieldKey, value: {}, attachmentIds: [] };
    const validated = validateChecklistValue(fieldKey, item.value);
    if ("error" in validated) return validated;
    const attachmentIds = Array.from(new Set(item.attachmentIds.map((id) => id.trim()).filter(Boolean)));
    if (attachmentIds.length > 20) return { error: `${STAGE_FIVE_FIELD_LABELS[fieldKey]} has too many files.` } as const;
    prepared.push({ fieldKey, value: validated.value, attachmentIds });
  }

  const allAttachmentIds = Array.from(new Set(prepared.flatMap((item) => item.attachmentIds)));
  if (allAttachmentIds.length) {
    const validAttachments = await withPrismaRetry(() =>
      prisma.projectAttachment.count({
        where: {
          id: { in: allAttachmentIds },
          projectId: input.projectId,
          status: AttachmentStatus.READY,
          assetType: "FILE_CHECKLIST_ATTACHMENT",
        },
      }),
    );
    if (validAttachments !== allAttachmentIds.length) {
      return { error: "One or more checklist attachments are invalid or belong to another project." } as const;
    }
  }

  const savedItems = await withPrismaRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const existing = await tx.projectFileChecklistItem.findMany({
          where: { checklistId: checklist.id },
          select: { fieldKey: true, status: true },
        });
        const statusByField = new Map(existing.map((item) => [item.fieldKey, item.status]));
        const itemsWithStatus = prepared.map((item) => {
          const filled = valueIsFilled(item.value, item.attachmentIds);
          const status = filled
            ? ProjectFileChecklistItemStatus.FILLED
            : statusByField.get(item.fieldKey) === ProjectFileChecklistItemStatus.REQUESTED
              ? ProjectFileChecklistItemStatus.REQUESTED
              : ProjectFileChecklistItemStatus.PENDING;

          return { ...item, status };
        });
        const upsertRows = itemsWithStatus.map((item) =>
          Prisma.sql`(
            ${randomUUID()},
            ${checklist.id},
            ${item.fieldKey}::"ProjectFileChecklistField",
            ${JSON.stringify(item.value)}::jsonb,
            ${item.status}::"ProjectFileChecklistItemStatus",
            ${user.id},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )`,
        );
        const saved = await tx.$queryRaw<
          Array<{ id: string; fieldKey: ProjectFileChecklistField }>
        >(Prisma.sql`
          INSERT INTO "ProjectFileChecklistItem" (
            "id",
            "checklistId",
            "fieldKey",
            "value",
            "status",
            "updatedById",
            "createdAt",
            "updatedAt"
          )
          VALUES ${Prisma.join(upsertRows)}
          ON CONFLICT ("checklistId", "fieldKey") DO UPDATE SET
            "value" = EXCLUDED."value",
            "status" = EXCLUDED."status",
            "updatedById" = EXCLUDED."updatedById",
            "updatedAt" = CURRENT_TIMESTAMP
          RETURNING "id", "fieldKey"
        `);
        const checklistItemIdByField = new Map(
          saved.map((item) => [item.fieldKey, item.id] as const),
        );
        const checklistItemIds = saved.map((item) => item.id);

        await tx.projectFileChecklistItemAttachment.deleteMany({
          where: { checklistItemId: { in: checklistItemIds } },
        });

        const attachmentLinks = itemsWithStatus.flatMap((item) => {
          const checklistItemId = checklistItemIdByField.get(item.fieldKey);
          if (!checklistItemId) {
            throw new Error("Unable to resolve a saved checklist item.");
          }

          return item.attachmentIds.map((attachmentId) => ({
            checklistItemId,
            attachmentId,
          }));
        });
        if (attachmentLinks.length > 0) {
          await tx.projectFileChecklistItemAttachment.createMany({
            data: attachmentLinks,
            skipDuplicates: true,
          });
        }

        return itemsWithStatus.map((item) => ({
          fieldKey: item.fieldKey,
          status: item.status,
        }));
      },
      { maxWait: 5_000, timeout: 25_000 },
    ),
  );

  return { items: savedItems } as const;
}

function isProjectParticipant(project: StageFiveProject, userId: string) {
  return (
    project.ownerId === userId ||
    project.coOwners.some((item) => item.userId === userId) ||
    project.executors.some((item) => item.userId === userId) ||
    project.collaborators.some((item) => item.userId === userId)
  );
}

function validateEmail(value: string) {
  const email = value.trim().toLocaleLowerCase("en-US");
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

type ChecklistEmailSender = typeof sendResendEmail;

export async function requestStageFiveChecklistInformation(
  user: PermissionUser,
  input: {
    clientRequestId: string;
    projectId: string;
    handoffId: string;
    fieldKey: ProjectFileChecklistField;
    channel: ProjectFileChecklistRequestChannel;
    recipientUserId?: string;
    recipientName?: string;
    recipientEmail?: string;
    message?: string;
  },
  options: { sendEmail?: ChecklistEmailSender } = {},
) {
  const project = await getAuthorizedProject(
    user,
    input.projectId,
    ProjectWorkflowStageKey.FINAL_LAYOUT,
  );
  if (!project || !canManageStageFive(user, project)) {
    return { error: "You do not have permission to request checklist information." } as const;
  }
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(input.clientRequestId)) {
    return { error: "Invalid request identifier." } as const;
  }
  if (!STAGE_FIVE_FIELD_KEYS.includes(input.fieldKey)) {
    return { error: "Unknown checklist field." } as const;
  }

  const checklist = await withPrismaRetry(() =>
    prisma.projectFileChecklist.findFirst({
      where: {
        projectId: input.projectId,
        handoffId: input.handoffId,
        handoff: { targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT },
      },
      select: {
        id: true,
        sourceAttachment: { select: attachmentSelect },
      },
    }),
  );
  if (!checklist) return { error: "The selected Stage 5 file was not found." } as const;

  const message = sanitizeRichText(input.message) || null;
  if (message && richTextToPlainText(message).length > 5_000) return { error: "The request message is too long." } as const;
  const existing = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findUnique({
      where: { clientRequestId: input.clientRequestId },
      select: {
        id: true,
        status: true,
        workflowStatus: true,
        projectId: true,
        checklistId: true,
        fieldKey: true,
        channel: true,
        recipientUserId: true,
        recipientEmail: true,
      },
    }),
  );
  if (existing) {
    if (
      existing.projectId !== input.projectId ||
      existing.checklistId !== checklist.id ||
      existing.fieldKey !== input.fieldKey ||
      existing.channel !== input.channel ||
      (input.channel === ProjectFileChecklistRequestChannel.IN_APP &&
        existing.recipientUserId !== input.recipientUserId?.trim()) ||
      (input.channel === ProjectFileChecklistRequestChannel.EMAIL &&
        existing.recipientEmail !== validateEmail(input.recipientEmail ?? ""))
    ) {
      return { error: "This request identifier is already in use." } as const;
    }
    return { request: existing, duplicate: true } as const;
  }
  const requester = await withPrismaRetry(() =>
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } }),
  );
  if (!requester) return { error: "The requesting user was not found." } as const;

  if (input.channel === ProjectFileChecklistRequestChannel.IN_APP) {
    const recipientUserId = input.recipientUserId?.trim();
    if (!recipientUserId || !isProjectParticipant(project, recipientUserId)) {
      return { error: "Select a current project participant." } as const;
    }
    const recipient = getParticipants(project).find((item) => item.id === recipientUserId);
    if (!recipient) return { error: "The selected participant is unavailable." } as const;
    const activeRequest = await withPrismaRetry(() =>
      prisma.projectFileChecklistRequest.findFirst({
        where: {
          checklistId: checklist.id,
          fieldKey: input.fieldKey,
          channel: ProjectFileChecklistRequestChannel.IN_APP,
          recipientUserId,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        select: { id: true, status: true, workflowStatus: true },
      }),
    );
    if (activeRequest) {
      return { request: activeRequest, duplicate: true } as const;
    }

    try {
      const request = await withPrismaRetry(() =>
        prisma.$transaction(async (tx) => {
        const item = await tx.projectFileChecklistItem.upsert({
          where: { checklistId_fieldKey: { checklistId: checklist.id, fieldKey: input.fieldKey } },
          update: {},
          create: { checklistId: checklist.id, fieldKey: input.fieldKey },
          select: { id: true, status: true },
        });
        const created = await tx.projectFileChecklistRequest.create({
          data: {
            clientRequestId: input.clientRequestId,
            projectId: input.projectId,
            checklistId: checklist.id,
            checklistItemId: item.id,
            fieldKey: input.fieldKey,
            requestedById: user.id,
            channel: ProjectFileChecklistRequestChannel.IN_APP,
            recipientUserId,
            recipientName: recipient.name,
            message,
            status: ProjectFileChecklistRequestStatus.SENT,
            workflowStatus: ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
            sentAt: new Date(),
          },
          select: { id: true, status: true, workflowStatus: true },
        });
        await tx.notification.create({
          data: {
            userId: recipientUserId,
            type: "CHECKLIST_INFORMATION_REQUESTED",
            title: "Information requested",
            message: `${displayName(requester)} requested \"${STAGE_FIVE_FIELD_LABELS[input.fieldKey]}\" for \"${checklist.sourceAttachment.originalFileName}\".`,
            entityType: "CHECKLIST_REQUEST",
            entityId: created.id,
            projectId: input.projectId,
            attachmentId: checklist.sourceAttachment.id,
            url: `/requests/checklist/${created.id}`,
          },
        });
        if (item.status !== ProjectFileChecklistItemStatus.FILLED) {
          await tx.projectFileChecklistItem.update({
            where: { id: item.id },
            data: { status: ProjectFileChecklistItemStatus.REQUESTED },
          });
        }
        return created;
        }),
      );
      await publishNotificationChanges({
        recipientUserIds: [recipientUserId],
        reason: "created",
      });
      return { request, duplicate: false } as const;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await withPrismaRetry(() =>
          prisma.projectFileChecklistRequest.findFirst({
            where: {
              checklistId: checklist.id,
              fieldKey: input.fieldKey,
              recipientUserId,
              workflowStatus: {
                in: [
                  ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
                  ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
                ],
              },
            },
            select: { id: true, status: true, workflowStatus: true },
          }),
        );
        if (duplicate) return { request: duplicate, duplicate: true } as const;
      }
      throw error;
    }
  }

  const recipientEmail = validateEmail(input.recipientEmail ?? "");
  if (!recipientEmail) return { error: "Enter a valid recipient email address." } as const;
  const recipientName = input.recipientName?.trim() || null;
  if (recipientName && recipientName.length > 160) return { error: "Recipient name is too long." } as const;
  const activeEmailRequest = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        checklistId: checklist.id,
        fieldKey: input.fieldKey,
        channel: ProjectFileChecklistRequestChannel.EMAIL,
        recipientEmail,
        status: {
          in: [
            ProjectFileChecklistRequestStatus.PENDING,
            ProjectFileChecklistRequestStatus.SENT,
          ],
        },
        workflowStatus: {
          in: [
            ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
            ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
          ],
        },
      },
      select: { id: true, status: true, workflowStatus: true },
    }),
  );
  if (activeEmailRequest) {
    return { request: activeEmailRequest, duplicate: true } as const;
  }

  const access = createExternalChecklistToken();
  let pending: { id: string; checklistItemId: string; status: ProjectFileChecklistRequestStatus };
  try {
    pending = await withPrismaRetry(() =>
      prisma.$transaction(async (tx) => {
        const item = await tx.projectFileChecklistItem.upsert({
          where: { checklistId_fieldKey: { checklistId: checklist.id, fieldKey: input.fieldKey } },
          update: {},
          create: { checklistId: checklist.id, fieldKey: input.fieldKey },
          select: { id: true },
        });
        return tx.projectFileChecklistRequest.create({
          data: {
            clientRequestId: input.clientRequestId,
            projectId: input.projectId,
            checklistId: checklist.id,
            checklistItemId: item.id,
            fieldKey: input.fieldKey,
            requestedById: user.id,
            channel: ProjectFileChecklistRequestChannel.EMAIL,
            recipientName,
            recipientEmail,
            message,
            status: ProjectFileChecklistRequestStatus.PENDING,
            workflowStatus: ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
            externalTokenHash: access.tokenHash,
            externalTokenCreatedAt: access.createdAt,
            externalTokenExpiresAt: access.expiresAt,
          },
          select: { id: true, checklistItemId: true, status: true },
        });
      }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await withPrismaRetry(() =>
        prisma.projectFileChecklistRequest.findFirst({
          where: {
            checklistId: checklist.id,
            fieldKey: input.fieldKey,
            channel: ProjectFileChecklistRequestChannel.EMAIL,
            recipientEmail,
            status: {
              in: [
                ProjectFileChecklistRequestStatus.PENDING,
                ProjectFileChecklistRequestStatus.SENT,
              ],
            },
            workflowStatus: {
              in: [
                ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
                ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
              ],
            },
          },
          select: { id: true, status: true, workflowStatus: true },
        }),
      );
      if (duplicate) return { request: duplicate, duplicate: true } as const;
    }
    throw error;
  }

  const email = buildChecklistInformationRequestEmail({
    recipientName,
    requesterName: displayName(requester),
    projectName: project.name,
    fileName: checklist.sourceAttachment.originalFileName,
    fieldLabel: STAGE_FIVE_FIELD_LABELS[input.fieldKey],
    message,
    responseUrl: buildExternalChecklistRequestUrl(access.token),
  });
  let sendResult: Awaited<ReturnType<ChecklistEmailSender>>;
  try {
    sendResult = await (options.sendEmail ?? sendResendEmail)({
      to: recipientEmail,
      ...email,
      replyTo: requester.email,
    });
  } catch (error) {
    sendResult = {
      ok: false,
      error: error instanceof Error ? error.message : "The email provider could not be reached.",
    };
  }

  if (!sendResult.ok) {
    const failed = await withPrismaRetry(() =>
      prisma.projectFileChecklistRequest.update({
        where: { id: pending.id },
        data: {
          status: ProjectFileChecklistRequestStatus.FAILED,
          failedAt: new Date(),
          failureMessage: sendResult.error.slice(0, 5_000),
          externalTokenRevokedAt: new Date(),
        },
        select: { id: true, status: true },
      }),
    );
    return { error: `The email could not be sent: ${sendResult.error}`, request: failed } as const;
  }

  const sent = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const request = await tx.projectFileChecklistRequest.update({
        where: { id: pending.id },
        data: {
          status: ProjectFileChecklistRequestStatus.SENT,
          sentAt: new Date(),
          failedAt: null,
          failureMessage: null,
          externalTokenRevokedAt: null,
        },
        select: { id: true, status: true },
      });
      await tx.projectFileChecklistItem.updateMany({
        where: {
          id: pending.checklistItemId,
          status: { not: ProjectFileChecklistItemStatus.FILLED },
        },
        data: { status: ProjectFileChecklistItemStatus.REQUESTED },
      });
      return request;
    }),
  );
  return { request: sent, duplicate: false } as const;
}

export async function resendStageFiveExternalChecklistRequest(
  user: PermissionUser,
  requestId: string,
  options: { sendEmail?: ChecklistEmailSender } = {},
) {
  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: { id: requestId, channel: ProjectFileChecklistRequestChannel.EMAIL },
      select: {
        id: true,
        projectId: true,
        checklistItemId: true,
        fieldKey: true,
        requestedById: true,
        recipientName: true,
        recipientEmail: true,
        message: true,
        workflowStatus: true,
        project: { select: { name: true } },
        requestedBy: { select: { name: true, email: true } },
        checklist: {
          select: {
            sourceAttachment: { select: { originalFileName: true } },
          },
        },
      },
    }),
  );
  if (!request?.recipientEmail) return { error: "This email request is unavailable." } as const;

  const project = await getAuthorizedProject(
    user,
    request.projectId,
    ProjectWorkflowStageKey.FINAL_LAYOUT,
  );
  if (!project || !canManageStageFive(user, project)) {
    return { error: "You do not have permission to resend this request." } as const;
  }
  if (
    request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.REQUESTED &&
    request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.ACCEPTED
  ) {
    return { error: "This information request can no longer be resent." } as const;
  }

  const access = createExternalChecklistToken();
  const prepared = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.updateMany({
      where: {
        id: request.id,
        channel: ProjectFileChecklistRequestChannel.EMAIL,
        workflowStatus: {
          in: [
            ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
            ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
          ],
        },
      },
      data: {
        status: ProjectFileChecklistRequestStatus.PENDING,
        externalTokenHash: access.tokenHash,
        externalTokenCreatedAt: access.createdAt,
        externalTokenExpiresAt: access.expiresAt,
        externalTokenRevokedAt: null,
        failedAt: null,
        failureMessage: null,
      },
    }),
  );
  if (prepared.count !== 1) {
    return { error: "This information request changed before it could be resent." } as const;
  }

  const email = buildChecklistInformationRequestEmail({
    recipientName: request.recipientName,
    requesterName: displayName(request.requestedBy),
    projectName: request.project.name,
    fileName: request.checklist.sourceAttachment.originalFileName,
    fieldLabel: STAGE_FIVE_FIELD_LABELS[request.fieldKey],
    message: request.message,
    responseUrl: buildExternalChecklistRequestUrl(access.token),
  });
  let sendResult: Awaited<ReturnType<ChecklistEmailSender>>;
  try {
    sendResult = await (options.sendEmail ?? sendResendEmail)({
      to: request.recipientEmail,
      ...email,
      replyTo: request.requestedBy.email,
    });
  } catch (error) {
    sendResult = {
      ok: false,
      error: error instanceof Error ? error.message : "The email provider could not be reached.",
    };
  }

  if (!sendResult.ok) {
    await withPrismaRetry(() =>
      prisma.projectFileChecklistRequest.updateMany({
        where: { id: request.id, externalTokenHash: access.tokenHash },
        data: {
          status: ProjectFileChecklistRequestStatus.FAILED,
          failedAt: new Date(),
          failureMessage: sendResult.error.slice(0, 5_000),
          externalTokenRevokedAt: new Date(),
        },
      }),
    );
    return { error: `The email could not be sent: ${sendResult.error}` } as const;
  }

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectFileChecklistRequest.update({
        where: { id: request.id },
        data: {
          status: ProjectFileChecklistRequestStatus.SENT,
          sentAt: new Date(),
          failedAt: null,
          failureMessage: null,
        },
      }),
      prisma.projectFileChecklistItem.updateMany({
        where: {
          id: request.checklistItemId,
          status: { not: ProjectFileChecklistItemStatus.FILLED },
        },
        data: { status: ProjectFileChecklistItemStatus.REQUESTED },
      }),
    ]),
  );
  return { status: ProjectFileChecklistRequestStatus.SENT } as const;
}

export async function cancelStageFiveChecklistRequest(
  user: PermissionUser,
  requestId: string,
) {
  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        projectId: true,
        checklistItemId: true,
        requestedById: true,
        workflowStatus: true,
      },
    }),
  );
  if (!request) return { error: "This information request is unavailable." } as const;
  const project = await getAuthorizedProject(
    user,
    request.projectId,
    ProjectWorkflowStageKey.FINAL_LAYOUT,
  );
  if (
    !project ||
    !canManageStageFive(user, project) ||
    (!isGlobalProjectAdministrator(user) && request.requestedById !== user.id)
  ) {
    return { error: "You do not have permission to cancel this request." } as const;
  }
  if (
    request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.REQUESTED &&
    request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.ACCEPTED
  ) {
    return { error: "This information request can no longer be cancelled." } as const;
  }

  const cancelled = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.projectFileChecklistRequest.updateMany({
        where: {
          id: request.id,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
        data: {
          workflowStatus: ProjectFileChecklistRequestWorkflowStatus.CANCELLED,
          status: ProjectFileChecklistRequestStatus.CANCELLED,
          externalTokenRevokedAt: new Date(),
        },
      });
      if (updated.count !== 1) return false;
      const otherActiveRequests = await tx.projectFileChecklistRequest.count({
        where: {
          checklistItemId: request.checklistItemId,
          status: ProjectFileChecklistRequestStatus.SENT,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
      });
      if (otherActiveRequests === 0) {
        await tx.projectFileChecklistItem.updateMany({
          where: {
            id: request.checklistItemId,
            status: ProjectFileChecklistItemStatus.REQUESTED,
          },
          data: { status: ProjectFileChecklistItemStatus.PENDING },
        });
      }
      return true;
    }),
  );
  return cancelled
    ? ({ status: ProjectFileChecklistRequestWorkflowStatus.CANCELLED } as const)
    : ({ error: "This information request changed before it could be cancelled." } as const);
}

const checklistRequestResponseSelect = {
  id: true,
  projectId: true,
  fieldKey: true,
  message: true,
  channel: true,
  workflowStatus: true,
  requestedAt: true,
  acceptedAt: true,
  completedAt: true,
  declinedAt: true,
  declineReason: true,
  recipientUserId: true,
  project: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  recipientUser: { select: { id: true, name: true, email: true } },
  respondedByUser: { select: { id: true, name: true, email: true } },
  checklist: {
    select: {
      handoffId: true,
      sourceAttachment: { select: attachmentSelect },
    },
  },
  checklistItem: {
    select: {
      id: true,
      value: true,
      status: true,
      attachments: {
        orderBy: { createdAt: "asc" as const },
        select: { attachment: { select: attachmentSelect } },
      },
    },
  },
} satisfies Prisma.ProjectFileChecklistRequestSelect;

function canRespondToChecklistRequest(
  user: PermissionUser,
  request: { recipientUserId: string | null },
) {
  return user.role === UserRole.SUPER_ADMIN || request.recipientUserId === user.id;
}

function stageFiveOwnerUrl(input: {
  projectId: string;
  handoffId: string;
  fieldKey: ProjectFileChecklistField;
  mode: "edit" | "view";
}) {
  return `/projects/${input.projectId}/stages/5?file=${encodeURIComponent(input.handoffId)}&field=${input.fieldKey}&mode=${input.mode}`;
}

export async function getStageFiveChecklistRequestData(
  user: PermissionUser,
  requestId: string,
): Promise<StageFiveChecklistRequestData | null> {
  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        id: requestId,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        recipientUserId: { not: null },
        project: accessibleStageFiveProjectWhere,
      },
      relationLoadStrategy: "join",
      select: checklistRequestResponseSelect,
    }),
  );

  if (!request || !request.recipientUser || !canRespondToChecklistRequest(user, request)) {
    return null;
  }

  const field = getStageFiveFieldDefinition(request.fieldKey);
  if (!field) return null;

  return {
    id: request.id,
    project: request.project,
    handoffId: request.checklist.handoffId,
    file: mapAttachment(request.checklist.sourceAttachment),
    field,
    message: request.message,
    status: request.workflowStatus,
    requestedAt: request.requestedAt.toISOString(),
    acceptedAt: request.acceptedAt?.toISOString() ?? null,
    completedAt: request.completedAt?.toISOString() ?? null,
    declinedAt: request.declinedAt?.toISOString() ?? null,
    declineReason: request.declineReason,
    requestedBy: {
      id: request.requestedBy.id,
      name: displayName(request.requestedBy),
    },
    recipient: {
      id: request.recipientUser.id,
      name: displayName(request.recipientUser),
    },
    respondedBy: request.respondedByUser
      ? {
          id: request.respondedByUser.id,
          name: displayName(request.respondedByUser),
        }
      : null,
    response: {
      value: parseChecklistValue(request.checklistItem.value),
      attachments: request.checklistItem.attachments.map(({ attachment }) =>
        mapAttachment(attachment),
      ),
    },
    canRespond: canRespondToChecklistRequest(user, request),
  };
}

export async function getStageFiveChecklistRequestSourceFileUrl(
  user: PermissionUser,
  requestId: string,
  mode: "preview" | "download",
) {
  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        id: requestId,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        project: accessibleStageFiveProjectWhere,
        ...(user.role === UserRole.SUPER_ADMIN ? {} : { recipientUserId: user.id }),
      },
      select: {
        checklist: {
          select: {
            sourceAttachment: {
              select: {
                bucket: true,
                storageKey: true,
                originalFileName: true,
                mimeType: true,
                status: true,
              },
            },
          },
        },
      },
    }),
  );

  const attachment = request?.checklist.sourceAttachment;
  if (!attachment || attachment.status !== AttachmentStatus.READY) {
    throw new Error("Requested file not found.");
  }

  const input = {
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  };
  return mode === "download"
    ? createPresignedDownloadUrl(input)
    : createPresignedPreviewUrl(input);
}

export async function getStageFiveChecklistRequestUploadContext(
  user: PermissionUser,
  requestId: string,
) {
  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        id: requestId,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        workflowStatus: ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
        project: accessibleStageFiveProjectWhere,
      },
      select: { id: true, projectId: true, recipientUserId: true },
    }),
  );
  if (!request || !canRespondToChecklistRequest(user, request)) return null;
  return { requestId: request.id, projectId: request.projectId };
}

export async function acceptStageFiveChecklistRequest(
  user: PermissionUser,
  requestId: string,
) {
  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        id: requestId,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        project: accessibleStageFiveProjectWhere,
      },
      select: { id: true, recipientUserId: true, workflowStatus: true },
    }),
  );
  if (!request || !canRespondToChecklistRequest(user, request)) {
    return { error: "This information request is unavailable." } as const;
  }
  if (request.workflowStatus === ProjectFileChecklistRequestWorkflowStatus.ACCEPTED) {
    return { status: request.workflowStatus } as const;
  }
  if (request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.REQUESTED) {
    return { error: "This information request can no longer be accepted." } as const;
  }

  const accepted = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.updateMany({
      where: {
        id: request.id,
        workflowStatus: ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
      },
      data: {
        workflowStatus: ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    }),
  );
  if (accepted.count !== 1) {
    return { error: "This information request changed before it could be accepted." } as const;
  }
  return { status: ProjectFileChecklistRequestWorkflowStatus.ACCEPTED } as const;
}

export async function declineStageFiveChecklistRequest(
  user: PermissionUser,
  input: { requestId: string; reason: string },
) {
  const reason = sanitizeRichText(input.reason);
  const reasonLength = richTextToPlainText(reason).length;
  if (reasonLength < 3) return { error: "Enter a short reason for declining." } as const;
  if (reasonLength > 1_000) return { error: "The decline reason is too long." } as const;

  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        id: input.requestId,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        project: accessibleStageFiveProjectWhere,
      },
      select: {
        id: true,
        projectId: true,
        checklistItemId: true,
        fieldKey: true,
        requestedById: true,
        recipientUserId: true,
        workflowStatus: true,
        checklist: {
          select: {
            handoffId: true,
            sourceAttachment: { select: { originalFileName: true } },
          },
        },
      },
    }),
  );
  if (!request || !canRespondToChecklistRequest(user, request)) {
    return { error: "This information request is unavailable." } as const;
  }
  if (
    request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.REQUESTED &&
    request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.ACCEPTED
  ) {
    return { error: "This information request can no longer be declined." } as const;
  }

  const actor = await withPrismaRetry(() =>
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } }),
  );
  if (!actor) return { error: "The responding user was not found." } as const;

  const declined = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.projectFileChecklistRequest.updateMany({
        where: {
          id: request.id,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
        data: {
          workflowStatus: ProjectFileChecklistRequestWorkflowStatus.DECLINED,
          declinedAt: new Date(),
          declineReason: reason,
          respondedByUserId: user.id,
          responseSource: ProjectFileChecklistResponseSource.AUTHENTICATED_USER,
        },
      });
      if (updated.count !== 1) return false;

      const otherActiveRequests = await tx.projectFileChecklistRequest.count({
        where: {
          checklistItemId: request.checklistItemId,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
      });
      if (otherActiveRequests === 0) {
        await tx.projectFileChecklistItem.updateMany({
          where: {
            id: request.checklistItemId,
            status: ProjectFileChecklistItemStatus.REQUESTED,
          },
          data: { status: ProjectFileChecklistItemStatus.PENDING },
        });
      }

      if (request.requestedById !== user.id) {
        await tx.notification.create({
          data: {
            userId: request.requestedById,
            type: "CHECKLIST_INFORMATION_DECLINED",
            title: "Information request declined",
            message: `${displayName(actor)} declined the request for "${STAGE_FIVE_FIELD_LABELS[request.fieldKey]}". ${reason}`.slice(0, 500),
            entityType: "CHECKLIST_REQUEST",
            entityId: request.id,
            projectId: request.projectId,
            url: stageFiveOwnerUrl({
              projectId: request.projectId,
              handoffId: request.checklist.handoffId,
              fieldKey: request.fieldKey,
              mode: "edit",
            }),
          },
        });
      }
      return true;
    }),
  );
  if (!declined) {
    return { error: "This information request changed before it could be declined." } as const;
  }
  if (request.requestedById !== user.id) {
    await publishNotificationChanges({
      recipientUserIds: [request.requestedById],
      reason: "created",
    });
  }
  return {
    status: ProjectFileChecklistRequestWorkflowStatus.DECLINED,
    projectId: request.projectId,
    handoffId: request.checklist.handoffId,
  } as const;
}

export function validateStageFiveChecklistResponse(
  fieldKey: ProjectFileChecklistField,
  value: StageFiveChecklistValue,
  attachmentIds: string[],
): { error: string } | { value: StageFiveChecklistValue } {
  const field = getStageFiveFieldDefinition(fieldKey);
  if (!field) return { error: "Unknown checklist field." } as const;
  const validated = validateChecklistValue(fieldKey, value);
  if ("error" in validated) return validated;

  const normalizedValue: StageFiveChecklistValue =
    field.control === "text" || field.control === "textarea" || field.control === "text-attachment"
      ? { ...(validated.value.text ? { text: validated.value.text } : {}) }
      : field.control === "health-warning"
        ? {
            ...(validated.value.text ? { text: validated.value.text } : {}),
            included: Boolean(validated.value.included),
          }
        : field.control === "multi-value" || field.control === "finishes"
          ? { ...(validated.value.values?.length ? { values: validated.value.values } : {}) }
          : {};

  const hasText = Boolean(normalizedValue.text?.trim());
  const hasValues = Boolean(normalizedValue.values?.length);
  const hasFiles = attachmentIds.length > 0;
  const hasIncluded = Boolean(normalizedValue.included);
  const valid =
    field.control === "file"
      ? attachmentIds.length === 1
      : field.control === "multi-file"
        ? hasFiles
        : field.control === "multi-value"
          ? hasValues
          : field.control === "finishes"
            ? hasValues || hasFiles
            : field.control === "text-attachment"
              ? hasText || hasFiles
              : field.control === "health-warning"
                ? hasText || hasFiles || hasIncluded
                : hasText;

  if (!valid) {
    return { error: `Provide the requested ${field.title.toLocaleLowerCase()}.` } as const;
  }
  return { value: normalizedValue } as const;
}

export async function submitStageFiveChecklistResponse(
  user: PermissionUser,
  input: {
    requestId: string;
    value: StageFiveChecklistValue;
    attachmentIds: string[];
  },
) {
  const attachmentIds = Array.from(
    new Set(input.attachmentIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (attachmentIds.length > 20) return { error: "Select no more than 20 files." } as const;

  const request = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        id: input.requestId,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        project: accessibleStageFiveProjectWhere,
      },
      select: {
        id: true,
        projectId: true,
        checklistId: true,
        checklistItemId: true,
        fieldKey: true,
        requestedById: true,
        recipientUserId: true,
        workflowStatus: true,
        checklist: {
          select: {
            handoffId: true,
            sourceAttachment: { select: { id: true, originalFileName: true } },
          },
        },
      },
    }),
  );
  if (!request || !canRespondToChecklistRequest(user, request)) {
    return { error: "This information request is unavailable." } as const;
  }
  if (request.workflowStatus !== ProjectFileChecklistRequestWorkflowStatus.ACCEPTED) {
    return { error: "Accept this request before submitting a response." } as const;
  }

  const validated = validateStageFiveChecklistResponse(
    request.fieldKey,
    input.value,
    attachmentIds,
  );
  if ("error" in validated) return validated;

  if (attachmentIds.length > 0) {
    const attachments = await withPrismaRetry(() =>
      prisma.projectAttachment.count({
        where: {
          id: { in: attachmentIds },
          projectId: request.projectId,
          uploadedById: user.id,
          status: AttachmentStatus.READY,
          assetType: "FILE_CHECKLIST_ATTACHMENT",
          checklistResponseRequestId: request.id,
          fileChecklistItems: { none: {} },
        },
      }),
    );
    if (attachments !== attachmentIds.length) {
      return { error: "One or more response files are invalid or belong to another request." } as const;
    }
  }

  const actor = await withPrismaRetry(() =>
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } }),
  );
  if (!actor) return { error: "The responding user was not found." } as const;

  const completed = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.projectFileChecklistRequest.updateMany({
        where: {
          id: request.id,
          workflowStatus: ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
        },
        data: {
          workflowStatus: ProjectFileChecklistRequestWorkflowStatus.COMPLETED,
          completedAt: new Date(),
          respondedByUserId: user.id,
          responseSource: ProjectFileChecklistResponseSource.AUTHENTICATED_USER,
        },
      });
      if (updated.count !== 1) return false;

      await tx.projectFileChecklistItem.update({
        where: { id: request.checklistItemId },
        data: {
          value: validated.value as Prisma.InputJsonValue,
          status: ProjectFileChecklistItemStatus.FILLED,
          updatedById: user.id,
        },
      });
      await tx.projectFileChecklistItemAttachment.deleteMany({
        where: { checklistItemId: request.checklistItemId },
      });
      if (attachmentIds.length > 0) {
        await tx.projectFileChecklistItemAttachment.createMany({
          data: attachmentIds.map((attachmentId) => ({
            checklistItemId: request.checklistItemId,
            attachmentId,
          })),
        });
      }

      if (request.requestedById !== user.id) {
        await tx.notification.create({
          data: {
            userId: request.requestedById,
            type: "CHECKLIST_INFORMATION_COMPLETED",
            title: "Requested information received",
            message: `${displayName(actor)} provided "${STAGE_FIVE_FIELD_LABELS[request.fieldKey]}" for "${request.checklist.sourceAttachment.originalFileName}".`,
            entityType: "CHECKLIST_REQUEST",
            entityId: request.id,
            projectId: request.projectId,
            attachmentId: request.checklist.sourceAttachment.id,
            url: stageFiveOwnerUrl({
              projectId: request.projectId,
              handoffId: request.checklist.handoffId,
              fieldKey: request.fieldKey,
              mode: "view",
            }),
          },
        });
      }
      return true;
    }),
  );
  if (!completed) {
    return { error: "This information request changed before the response was submitted." } as const;
  }
  if (request.requestedById !== user.id) {
    await publishNotificationChanges({
      recipientUserIds: [request.requestedById],
      reason: "created",
    });
  }
  return {
    status: ProjectFileChecklistRequestWorkflowStatus.COMPLETED,
    projectId: request.projectId,
    handoffId: request.checklist.handoffId,
  } as const;
}
