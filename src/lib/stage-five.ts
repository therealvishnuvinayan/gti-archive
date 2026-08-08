import {
  AttachmentStatus,
  Prisma,
  ProjectFileChecklistField,
  ProjectFileChecklistItemStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestStatus,
  ProjectWorkflowStageKey,
} from "@prisma/client";

import { buildChecklistInformationRequestEmail } from "@/lib/email/checklist-information-request";
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
import { canOpenImplementedWorkflowStage } from "@/lib/workflow-stage-access";

export const STAGE_FIVE_FIELD_KEYS = [
  ProjectFileChecklistField.OUTPUT_NAME,
  ProjectFileChecklistField.TECHNICAL_DRAWING,
  ProjectFileChecklistField.HEALTH_WARNING,
  ProjectFileChecklistField.TAR_NICOTINE,
  ProjectFileChecklistField.COMPULSORY_TEXT,
  ProjectFileChecklistField.MARKETING_COPY,
  ProjectFileChecklistField.RELATED_GRAPHICS,
  ProjectFileChecklistField.PRINTING_TECHNOLOGY,
  ProjectFileChecklistField.FINISHES,
  ProjectFileChecklistField.BARCODE,
  ProjectFileChecklistField.TRACK_TRACE,
  ProjectFileChecklistField.THREEDS,
  ProjectFileChecklistField.TAX_STAMP,
  ProjectFileChecklistField.QR_CODE,
  ProjectFileChecklistField.INVOICE,
] as const;

export const STAGE_FIVE_FIELD_LABELS: Record<ProjectFileChecklistField, string> = {
  OUTPUT_NAME: "Output Name",
  TECHNICAL_DRAWING: "Technical Drawing",
  HEALTH_WARNING: "Health Warning",
  TAR_NICOTINE: "Tar / Nicotine",
  COMPULSORY_TEXT: "Compulsory Text",
  MARKETING_COPY: "Marketing Copy",
  RELATED_GRAPHICS: "Related Graphics",
  PRINTING_TECHNOLOGY: "Printing Technology",
  FINISHES: "Finishes",
  BARCODE: "Barcode",
  TRACK_TRACE: "Track & Trace",
  THREEDS: "3D's",
  TAX_STAMP: "Tax Stamp",
  QR_CODE: "QR Code",
  INVOICE: "Invoice",
};

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

export type StageFourHandoffFileRecord = StageFiveAttachmentRecord & {
  handedOff: boolean;
  handoffId: string | null;
};

export type StageFiveChecklistItemRecord = {
  fieldKey: ProjectFileChecklistField;
  value: StageFiveChecklistValue;
  status: ProjectFileChecklistItemStatus;
  attachments: StageFiveAttachmentRecord[];
  latestRequest: {
    status: ProjectFileChecklistRequestStatus;
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
};

type StageFiveProject = ProjectStageAccessRecord;

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function stageStatus(project: StageFiveProject, stageKey: ProjectWorkflowStageKey) {
  return project.workflowStages.find((stage) => stage.stageKey === stageKey)?.status;
}

async function getAuthorizedProject(
  user: PermissionUser,
  projectId: string,
  stageKey: ProjectWorkflowStageKey,
) {
  const project = await getProjectStageAccessRecordById(projectId);

  if (!project || !hasProjectPermission(user, project, "project.view")) return null;
  if (
    !canOpenImplementedWorkflowStage({
      user,
      stageKey,
      status: stageStatus(project, stageKey),
    })
  ) {
    return null;
  }

  return project;
}

const stageFourAttachmentWhere = (projectId: string) =>
  ({
    projectId,
    status: AttachmentStatus.READY,
    stage: {
      is: {
        projectId,
        isTasker: true,
        conceptFolder: {
          is: {
            projectId,
            workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          },
        },
      },
    },
    assetType: {
      notIn: ["REVISION_PREVIEW", "REVISION_THUMBNAIL"],
    },
  }) satisfies Prisma.ProjectAttachmentWhereInput;

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

export async function getStageFourFinalFileHandoffData(
  user: PermissionUser,
  projectId: string,
) {
  const project = await getAuthorizedProject(
    user,
    projectId,
    ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
  );

  if (!project) return null;

  const canHandoff = hasProjectPermission(user, project, "project.update");
  if (!canHandoff) return { canHandoff: false, files: [] };

  const [attachments, handoffs] = await Promise.all([
    withPrismaRetry(() =>
      prisma.projectAttachment.findMany({
        where: stageFourAttachmentWhere(projectId),
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: attachmentSelect,
      }),
    ),
    withPrismaRetry(() =>
      prisma.projectStageFileHandoff.findMany({
        where: {
          projectId,
          sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
        },
        select: { id: true, sourceAttachmentId: true },
      }),
    ),
  ]);
  const handoffByAttachmentId = new Map(
    handoffs.map((handoff) => [handoff.sourceAttachmentId, handoff.id]),
  );

  return {
    canHandoff,
    files: attachments.map((attachment) => ({
      ...mapAttachment(attachment),
      handedOff: handoffByAttachmentId.has(attachment.id),
      handoffId: handoffByAttachmentId.get(attachment.id) ?? null,
    })),
  };
}

export async function handoffStageFourFiles(
  user: PermissionUser,
  input: { projectId: string; attachmentIds: string[] },
) {
  const project = await getAuthorizedProject(
    user,
    input.projectId,
    ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
  );

  if (!project || !hasProjectPermission(user, project, "project.update")) {
    return { error: "You do not have permission to designate final Stage 4 files." } as const;
  }

  const attachmentIds = Array.from(
    new Set(input.attachmentIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (attachmentIds.length === 0) return { error: "Select at least one Stage 4 file." } as const;
  if (attachmentIds.length > 100) return { error: "Select no more than 100 files at once." } as const;

  const validAttachments = await withPrismaRetry(() =>
    prisma.projectAttachment.findMany({
      where: { ...stageFourAttachmentWhere(input.projectId), id: { in: attachmentIds } },
      select: { id: true },
    }),
  );
  if (validAttachments.length !== attachmentIds.length) {
    return { error: "One or more selected files do not belong to this project's Stage 4 workspace." } as const;
  }

  const handoffs = await withPrismaRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await tx.projectStageFileHandoff.createMany({
          data: attachmentIds.map((sourceAttachmentId) => ({
            projectId: input.projectId,
            sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
            sourceAttachmentId,
            targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
            handedOffById: user.id,
          })),
          skipDuplicates: true,
        });

        const designated = await tx.projectStageFileHandoff.findMany({
          where: {
            projectId: input.projectId,
            sourceAttachmentId: { in: attachmentIds },
            targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
          },
          select: { id: true, sourceAttachmentId: true },
        });

        for (const handoff of designated) {
          await tx.projectFileChecklist.upsert({
            where: { handoffId: handoff.id },
            update: {},
            create: {
              projectId: input.projectId,
              handoffId: handoff.id,
              sourceAttachmentId: handoff.sourceAttachmentId,
            },
          });
        }

        return designated;
      },
      { maxWait: 5_000, timeout: 20_000 },
    ),
  );

  return { handoffs } as const;
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
              orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                status: true,
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
  if (!project) return null;

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
                      status: latestRequest.status,
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

  return {
    files,
    participants: getParticipants(project).filter((participant) => participant.id !== user.id),
    canEdit: hasProjectPermission(user, project, "file.uploadAttachment"),
  };
}

function validateChecklistValue(
  fieldKey: ProjectFileChecklistField,
  value: StageFiveChecklistValue,
): { error: string } | { value: StageFiveChecklistValue } {
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (text.length > 20_000) return { error: `${STAGE_FIVE_FIELD_LABELS[fieldKey]} is too long.` };
  const values = Array.isArray(value.values)
    ? Array.from(
        new Set(value.values.map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean)),
      )
    : [];
  if (values.length > 50 || values.some((item) => item.length > 150)) {
    return { error: `${STAGE_FIVE_FIELD_LABELS[fieldKey]} has too many or overly long values.` };
  }
  return {
    value: {
      ...(text ? { text } : {}),
      ...(values.length ? { values } : {}),
      ...(fieldKey === ProjectFileChecklistField.HEALTH_WARNING
        ? { included: Boolean(value.included) }
        : {}),
    } satisfies StageFiveChecklistValue,
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
  if (!project || !hasProjectPermission(user, project, "file.uploadAttachment")) {
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
        const result: Array<{ fieldKey: ProjectFileChecklistField; status: ProjectFileChecklistItemStatus }> = [];

        for (const item of prepared) {
          const filled = valueIsFilled(item.value, item.attachmentIds);
          const status = filled
            ? ProjectFileChecklistItemStatus.FILLED
            : statusByField.get(item.fieldKey) === ProjectFileChecklistItemStatus.REQUESTED
              ? ProjectFileChecklistItemStatus.REQUESTED
              : ProjectFileChecklistItemStatus.PENDING;
          const saved = await tx.projectFileChecklistItem.upsert({
            where: { checklistId_fieldKey: { checklistId: checklist.id, fieldKey: item.fieldKey } },
            update: { value: item.value as Prisma.InputJsonValue, status, updatedById: user.id },
            create: {
              checklistId: checklist.id,
              fieldKey: item.fieldKey,
              value: item.value as Prisma.InputJsonValue,
              status,
              updatedById: user.id,
            },
            select: { id: true },
          });
          await tx.projectFileChecklistItemAttachment.deleteMany({
            where: {
              checklistItemId: saved.id,
              ...(item.attachmentIds.length ? { attachmentId: { notIn: item.attachmentIds } } : {}),
            },
          });
          if (item.attachmentIds.length) {
            await tx.projectFileChecklistItemAttachment.createMany({
              data: item.attachmentIds.map((attachmentId) => ({
                checklistItemId: saved.id,
                attachmentId,
              })),
              skipDuplicates: true,
            });
          }
          result.push({ fieldKey: item.fieldKey, status });
        }
        return result;
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
  if (!project || !hasProjectPermission(user, project, "file.uploadAttachment")) {
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

  const message = input.message?.trim() || null;
  if (message && message.length > 5_000) return { error: "The request message is too long." } as const;
  const existing = await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findUnique({
      where: { clientRequestId: input.clientRequestId },
      select: { id: true, status: true, projectId: true, checklistId: true, fieldKey: true },
    }),
  );
  if (existing) {
    if (
      existing.projectId !== input.projectId ||
      existing.checklistId !== checklist.id ||
      existing.fieldKey !== input.fieldKey
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
    const url = `/projects/${input.projectId}/stages/5?file=${input.handoffId}&field=${input.fieldKey}&mode=edit`;

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
            sentAt: new Date(),
          },
          select: { id: true, status: true },
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
            url,
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
    return { request, duplicate: false } as const;
  }

  const recipientEmail = validateEmail(input.recipientEmail ?? "");
  if (!recipientEmail) return { error: "Enter a valid recipient email address." } as const;
  const recipientName = input.recipientName?.trim() || null;
  if (recipientName && recipientName.length > 160) return { error: "Recipient name is too long." } as const;
  const pending = await withPrismaRetry(() =>
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
        },
        select: { id: true, checklistItemId: true, status: true },
      });
    }),
  );

  const email = buildChecklistInformationRequestEmail({
    recipientName,
    requesterName: displayName(requester),
    projectName: project.name,
    fileName: checklist.sourceAttachment.originalFileName,
    fieldLabel: STAGE_FIVE_FIELD_LABELS[input.fieldKey],
    message,
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
