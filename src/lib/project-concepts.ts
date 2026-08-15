import {
  AttachmentAssetType,
  AttachmentStatus,
  Prisma,
  ProductionApprovalStepStatus,
  ProductionDispatchStatus,
  ProjectProductionUnitStatus,
  ProjectRevisionStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  StageStatus,
  SubmissionReviewStatus,
} from "@prisma/client";

import {
  type PermissionUser,
} from "@/lib/permissions/resolver";
import {
  canCompleteProjectConceptStage,
  canManageProjectConcept,
  canReviewProjectConcept,
  canViewProjectConcept,
  getProjectConceptParticipantUserIds,
  type ConceptAccessContext,
} from "@/lib/project-concept-access";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { sanitizeRichText } from "@/lib/rich-text";
import { getWorkflowStageCompletionMode } from "@/lib/project-workflow";
import {
  getProjectStageAccessRecordById,
  projectStageAccessSelect,
  type ProjectStageAccessRecord,
} from "@/lib/project-stage-data";
import { canOpenImplementedWorkflowStage } from "@/lib/workflow-stage-access";
import { isAllowedStageSubmissionFile } from "@/lib/upload-validation";
import { hasStageFiveDownstreamActivityForAttachment } from "@/lib/stage-five";
import { deleteObjectIfNeeded } from "@/lib/storage/s3";

export type ProjectConceptAttachmentReference = {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  previewPath: string;
  downloadPath: string;
};

export type ProjectConceptStageThreeReference =
  ProjectConceptAttachmentReference & {
    sourceConceptId: string;
    sourceConceptName: string;
  };

export type ConceptWorkflowStageKey =
  | typeof ProjectWorkflowStageKey.CONCEPT_CREATION
  | typeof ProjectWorkflowStageKey.PROJECT_DEVELOPMENT;

export type ProjectConceptFolderRecord = {
  id: string;
  name: string;
  deadline: Date | null;
  canDelete: boolean;
  sortOrder: number;
  taskerStageId: string;
  assignedExecutorId: string | null;
  assignedExecutor: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  brief: string | null;
  actualStartedAt: Date | null;
  latestRevisionStatus: ProjectRevisionStatus | null;
  approvedAttachment: ProjectConceptAttachmentReference | null;
  approvedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  approvedAt: Date | null;
  sourceStage3Concept: { id: string; name: string } | null;
  startingReference: ProjectConceptAttachmentReference | null;
  briefAttachments: Array<{
    id: string;
    name: string;
    mimeType: string;
    fileSize: number;
  }>;
};

export type ProjectConceptChatMode = {
  type: "concept";
  folderId: string;
  workflowStageKey: ConceptWorkflowStageKey;
  stageNumber: 3 | 4;
  stageLabel: "Stage 3 - Initial Concept" | "Stage 4 - Final Concept";
  conceptName: string;
  assignedExecutor: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  canManage: boolean;
  canReview: boolean;
  isAssignedExecutor: boolean;
  participantUserIds: string[];
  approvedAttachmentId: string | null;
  isWorkflowCompleted: boolean;
  startingReference: ProjectConceptStageThreeReference | null;
  availableStageThreeReferences: ProjectConceptStageThreeReference[];
  backHref: string;
  compareHref: string;
};

export const DEFAULT_CONCEPT_FOLDER_NAME = "Concept 1";
export const CONCEPT_FOLDER_NAME_MAX_LENGTH = 120;

type ConceptProject = ProjectStageAccessRecord;

function isSupportedConceptStageKey(
  stageKey: ProjectWorkflowStageKey,
): stageKey is ConceptWorkflowStageKey {
  return (
    stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ||
    stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT
  );
}

function cleanConceptFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeConceptFolderName(value: string) {
  return cleanConceptFolderName(value).normalize("NFKC").toLocaleLowerCase("en-US");
}

function validateConceptFolderName(value: string):
  | { error: string }
  | { name: string; normalizedName: string } {
  const name = cleanConceptFolderName(value);

  if (!name) {
    return { error: "Task name is required." };
  }

  if (name.length > CONCEPT_FOLDER_NAME_MAX_LENGTH) {
    return {
      error: `Task names can be up to ${CONCEPT_FOLDER_NAME_MAX_LENGTH} characters.`,
    };
  }

  return {
    name,
    normalizedName: normalizeConceptFolderName(name),
  };
}

function getWorkflowStageStatus(
  project: ConceptProject,
  stageKey: ConceptWorkflowStageKey,
) {
  return project.workflowStages.find((stage) => stage.stageKey === stageKey)?.status;
}

async function getAuthorizedConceptProject(
  user: PermissionUser,
  projectId: string,
  stageKey: ProjectWorkflowStageKey,
) {
  if (!isSupportedConceptStageKey(stageKey)) {
    return null;
  }

  const project = await getProjectStageAccessRecordById(projectId);

  if (!project) {
    return null;
  }

  if (
    !canOpenImplementedWorkflowStage({
      stageKey,
      status: getWorkflowStageStatus(project, stageKey),
    })
  ) {
    return null;
  }

  return project;
}

function getTaskerStageOrder(stageKey: ConceptWorkflowStageKey, sortOrder: number) {
  const stageBase =
    stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ? 30_000 : 40_000;

  return stageBase + sortOrder;
}

const conceptFolderSelect = {
  id: true,
  name: true,
  createdById: true,
  sortOrder: true,
  taskerStageId: true,
  assignedExecutorId: true,
  approvedAt: true,
  approvedBy: {
    select: { id: true, name: true, email: true },
  },
  approvedAttachment: {
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      fileSize: true,
    },
  },
  sourceStage3Concept: {
    select: { id: true, name: true },
  },
  promotedStage4Concept: {
    select: { id: true },
  },
  sourceStage3ApprovedAttachment: {
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      fileSize: true,
    },
  },
  assignedExecutor: {
    select: {
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  },
  taskerStage: {
    select: {
      description: true,
      actualStartedAt: true,
      plannedDueAt: true,
      revisions: {
        orderBy: [{ revisionNumber: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { status: true },
      },
      attachments: {
        where: {
          revisionId: null,
          commentId: null,
          assetType: "GENERAL_PROJECT_ASSET",
          status: "READY",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
        },
      },
    },
  },
} satisfies Prisma.ProjectConceptFolderSelect;

function mapConceptAttachmentReference(attachment: {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}): ProjectConceptAttachmentReference {
  return {
    id: attachment.id,
    name: attachment.originalFileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    previewPath: `/api/project-assets/${attachment.id}/preview`,
    downloadPath: `/api/project-assets/${attachment.id}/download`,
  };
}

function getConceptAccessContext(
  project: ConceptProject,
  folder: { id: string; taskerStageId: string; assignedExecutorId: string | null },
  stageKey: ConceptWorkflowStageKey,
): ConceptAccessContext {
  return {
    folderId: folder.id,
    projectId: project.id,
    taskerStageId: folder.taskerStageId,
    workflowStageKey: stageKey,
    assignedExecutorId: folder.assignedExecutorId,
    ownerId: project.ownerId,
    coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
  };
}

function mapConceptFolder(
  folder: Prisma.ProjectConceptFolderGetPayload<{
    select: typeof conceptFolderSelect;
  }>,
  currentUserId: string,
): ProjectConceptFolderRecord {
  return {
    id: folder.id,
    name: folder.name,
    deadline: folder.taskerStage.plannedDueAt,
    canDelete:
      folder.createdById === currentUserId && !folder.promotedStage4Concept,
    sortOrder: folder.sortOrder,
    taskerStageId: folder.taskerStageId,
    assignedExecutorId: folder.assignedExecutorId,
    assignedExecutor: folder.assignedExecutor?.user ?? null,
    brief: folder.taskerStage.description,
    actualStartedAt: folder.taskerStage.actualStartedAt,
    latestRevisionStatus: folder.taskerStage.revisions[0]?.status ?? null,
    approvedAttachment: folder.approvedAttachment
      ? mapConceptAttachmentReference(folder.approvedAttachment)
      : null,
    approvedBy: folder.approvedBy,
    approvedAt: folder.approvedAt,
    sourceStage3Concept: folder.sourceStage3Concept,
    startingReference: folder.sourceStage3ApprovedAttachment
      ? mapConceptAttachmentReference(folder.sourceStage3ApprovedAttachment)
      : null,
    briefAttachments: folder.taskerStage.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    })),
  };
}

export async function getProjectConceptFolders(
  user: PermissionUser,
  projectId: string,
  stageKey: ConceptWorkflowStageKey,
  options: { executorId?: string | null } = {},
) {
  const project = await getAuthorizedConceptProject(user, projectId, stageKey);
  if (!project) {
    return null;
  }

  const managerContext: ConceptAccessContext = {
    folderId: "",
    projectId,
    taskerStageId: "",
    workflowStageKey: stageKey,
    assignedExecutorId: null,
    ownerId: project.ownerId,
    coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
  };
  const canManage = canManageProjectConcept(user, managerContext);
  const canCompleteStage = canCompleteProjectConceptStage(user, managerContext);
  const isProjectExecutor = project.executors.some(
    (executor) => executor.userId === user.id,
  );
  const requestedExecutor = options.executorId?.trim() || null;
  const requestedExecutorId = canManage
    ? requestedExecutor &&
      project.executors.some((executor) => executor.userId === requestedExecutor)
      ? requestedExecutor
      : null
    : user.id;
  const folders = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findMany({
      where: {
        projectId,
        workflowStageKey: stageKey,
        ...(canManage ? {} : { assignedExecutorId: user.id }),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: conceptFolderSelect,
    }),
  );

  const visibleFolders = folders.filter((folder) =>
    canViewProjectConcept(user, getConceptAccessContext(project, folder, stageKey)),
  );
  const displayedFolders = requestedExecutorId
    ? visibleFolders.filter(
        (folder) => folder.assignedExecutorId === requestedExecutorId,
      )
    : visibleFolders;

  if (!canManage && !isProjectExecutor && visibleFolders.length === 0) {
    return null;
  }

  return {
    folders: displayedFolders.map((folder) => mapConceptFolder(folder, user.id)),
    canManage,
    canCompleteStage,
    workflowStatus: getWorkflowStageStatus(project, stageKey) ?? null,
    completionConcepts: canCompleteStage
      ? visibleFolders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          isApproved: Boolean(folder.approvedAttachment),
        }))
      : [],
    selectedExecutorId: requestedExecutorId,
    executors: canManage
      ? project.executors.map((executor) => ({
          id: executor.user.id,
          name: executor.user.name,
          email: executor.user.email,
          avatarUrl: executor.user.avatarUrl,
        }))
      : [],
  };
}

export async function createProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    name: string;
    assignedExecutorId: string;
    deadline: string;
    brief?: string | null;
    briefAttachmentIds?: string[];
  },
) {
  const validatedName = validateConceptFolderName(input.name);

  if ("error" in validatedName) {
    return validatedName;
  }

  const project = await getAuthorizedConceptProject(
    user,
    input.projectId,
    input.stageKey,
  );

  const managerContext: ConceptAccessContext | null = project
    ? {
        folderId: "",
        projectId: input.projectId,
        taskerStageId: "",
        workflowStageKey: input.stageKey,
        assignedExecutorId: null,
        ownerId: project.ownerId,
        coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
      }
    : null;

  if (!project || !managerContext || !canManageProjectConcept(user, managerContext)) {
    return { error: "You do not have permission to create concept tasks." } as const;
  }

  if (
    getWorkflowStageStatus(project, input.stageKey) ===
    ProjectWorkflowStageStatus.COMPLETED
  ) {
    return {
      error: `Concept management is locked because ${
        input.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION
          ? "Stage 3"
          : "Stage 4"
      } is completed.`,
    } as const;
  }

  const assignedExecutorId = input.assignedExecutorId.trim();
  if (!assignedExecutorId) {
    return { error: "Assigned Executor is required." } as const;
  }

  if (!project.executors.some((executor) => executor.userId === assignedExecutorId)) {
    return { error: "Assigned Executor must be a current project executor." } as const;
  }

  const brief = sanitizeRichText(input.brief) || null;
  if (!brief) {
    return { error: "Concept Brief is required." } as const;
  }

  const deadline = new Date(input.deadline);
  if (Number.isNaN(deadline.getTime())) {
    return { error: "Deadline must be a valid date and time." } as const;
  }
  if (deadline.getTime() <= Date.now()) {
    return { error: "Deadline must be in the future." } as const;
  }

  const briefAttachmentIds = [
    ...new Set(
      (input.briefAttachmentIds ?? [])
        .map((attachmentId) => attachmentId.trim())
        .filter(Boolean),
    ),
  ];

  try {
    const folder = await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.projectConceptFolder.findUnique({
            where: {
              projectId_workflowStageKey_normalizedName: {
                projectId: input.projectId,
                workflowStageKey: input.stageKey,
                normalizedName: validatedName.normalizedName,
              },
            },
            select: { id: true },
          });

          if (duplicate) {
            throw new Error("DUPLICATE_CONCEPT_FOLDER");
          }

          const lastFolder = await tx.projectConceptFolder.findFirst({
            where: {
              projectId: input.projectId,
              workflowStageKey: input.stageKey,
            },
            orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
            select: { sortOrder: true },
          });
          const sortOrder = (lastFolder?.sortOrder ?? 0) + 1;
          if (briefAttachmentIds.length > 0) {
            const stagedAttachments = await tx.projectAttachment.findMany({
              where: {
                id: { in: briefAttachmentIds },
                projectId: input.projectId,
                stageId: null,
                revisionId: null,
                commentId: null,
                uploadedById: user.id,
                assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET,
                status: AttachmentStatus.READY,
              },
              select: { id: true },
            });

            if (stagedAttachments.length !== briefAttachmentIds.length) {
              throw new Error("INVALID_CONCEPT_BRIEF_ATTACHMENTS");
            }
          }

          const taskerStage = await tx.projectStage.create({
            data: {
              projectId: input.projectId,
              name: validatedName.name,
              description: brief,
              plannedDueAt: deadline,
              invoiceRequired: false,
              isTasker: true,
              actualStartedAt: null,
              startedById: null,
              status: StageStatus.ONGOING,
              order: getTaskerStageOrder(input.stageKey, sortOrder),
            },
            select: { id: true },
          });

          const folder = await tx.projectConceptFolder.create({
            data: {
              projectId: input.projectId,
              workflowStageKey: input.stageKey,
              taskerStageId: taskerStage.id,
              assignedExecutorId,
              name: validatedName.name,
              normalizedName: validatedName.normalizedName,
              sortOrder,
              createdById: user.id,
            },
            select: { id: true },
          });
          if (briefAttachmentIds.length > 0) {
            const attached = await tx.projectAttachment.updateMany({
              where: {
                id: { in: briefAttachmentIds },
                projectId: input.projectId,
                stageId: null,
                uploadedById: user.id,
                assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET,
                status: AttachmentStatus.READY,
              },
              data: { stageId: taskerStage.id },
            });

            if (attached.count !== briefAttachmentIds.length) {
              throw new Error("INVALID_CONCEPT_BRIEF_ATTACHMENTS");
            }
          }

          return tx.projectConceptFolder.findUniqueOrThrow({
            where: { id: folder.id },
            select: conceptFolderSelect,
          });
        },
        { maxWait: 5_000, timeout: 15_000 },
      ),
    );

    return { folder: mapConceptFolder(folder, user.id) } as const;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVALID_CONCEPT_BRIEF_ATTACHMENTS"
    ) {
      return {
        error:
          "Every Brief Attachment must finish uploading before the concept can be created.",
      } as const;
    }

    if (
      (error instanceof Error && error.message === "DUPLICATE_CONCEPT_FOLDER") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return { error: "A concept task with this name already exists." } as const;
    }

    throw error;
  }
}

export async function deleteProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    folderId: string;
  },
) {
  const project = await getAuthorizedConceptProject(
    user,
    input.projectId,
    input.stageKey,
  );

  if (!project) {
    return { error: "You do not have permission to delete this task." } as const;
  }

  try {
    const result = await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const workflowStage = await tx.projectWorkflowStage.findUnique({
            where: {
              projectId_stageKey: {
                projectId: input.projectId,
                stageKey: input.stageKey,
              },
            },
            select: { status: true },
          });

          if (workflowStage?.status === ProjectWorkflowStageStatus.COMPLETED) {
            return {
              error: "Task management is locked because this workflow stage is completed.",
            } as const;
          }

          const folder = await tx.projectConceptFolder.findFirst({
            where: {
              id: input.folderId,
              projectId: input.projectId,
              workflowStageKey: input.stageKey,
            },
            select: {
              id: true,
              name: true,
              taskerStageId: true,
              assignedExecutorId: true,
              createdById: true,
              promotedStage4Concept: { select: { id: true } },
              taskerStage: {
                select: {
                  attachments: {
                    select: { id: true, storageKey: true, bucket: true },
                  },
                },
              },
            },
          });

          if (
            !folder ||
            !canViewProjectConcept(
              user,
              getConceptAccessContext(project, folder, input.stageKey),
            )
          ) {
            return { error: "Task not found." } as const;
          }

          if (folder.createdById !== user.id) {
            return { error: "Only the person who created this task can delete it." } as const;
          }

          if (folder.promotedStage4Concept) {
            return {
              error: "This task cannot be deleted because it is already used in Stage 4.",
            } as const;
          }

          const attachmentStorage = folder.taskerStage.attachments;
          const attachmentIds = attachmentStorage.map((attachment) => attachment.id);

          await tx.notification.deleteMany({
            where: {
              projectId: input.projectId,
              OR: [
                { stageId: folder.taskerStageId },
                { entityId: folder.id },
                ...(attachmentIds.length > 0
                  ? [{ attachmentId: { in: attachmentIds } }]
                  : []),
              ],
            },
          });
          await tx.projectFormDraft.deleteMany({
            where: {
              projectId: input.projectId,
              formKey: `concept-details:${input.stageKey}:${folder.id}`,
            },
          });
          await tx.projectConceptFolder.delete({ where: { id: folder.id } });
          await tx.projectStage.delete({ where: { id: folder.taskerStageId } });

          return {
            folder: {
              id: folder.id,
              name: folder.name,
              taskerStageId: folder.taskerStageId,
            },
            attachmentStorage,
          } as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      ),
    );

    if ("error" in result) {
      return result;
    }

    await Promise.allSettled(
      result.attachmentStorage.map((attachment) =>
        deleteObjectIfNeeded(attachment.storageKey, attachment.bucket),
      ),
    );

    return { folder: result.folder } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return {
          error: "This task cannot be deleted because it is already used by later project work.",
        } as const;
      }

      if (error.code === "P2034") {
        return { error: "The task changed at the same time. Please try again." } as const;
      }
    }

    throw error;
  }
}

export async function importStageThreeConceptReference(
  user: PermissionUser,
  input: {
    projectId: string;
    folderId: string;
    sourceConceptId: string;
  },
) {
  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const folder = await tx.projectConceptFolder.findFirst({
            where: {
              id: input.folderId,
              projectId: input.projectId,
              workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
              taskerStage: { projectId: input.projectId, isTasker: true },
            },
            select: {
              id: true,
              taskerStageId: true,
              assignedExecutorId: true,
              sourceStage3ConceptId: true,
              sourceStage3ApprovedAttachmentId: true,
              project: {
                select: {
                  ownerId: true,
                  coOwners: { select: { userId: true } },
                  workflowStages: {
                    where: {
                      stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                    },
                    select: { status: true },
                  },
                },
              },
            },
          });

          if (!folder) {
            return { error: "Stage 4 concept not found." } as const;
          }

          const accessContext: ConceptAccessContext = {
            folderId: folder.id,
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
            assignedExecutorId: folder.assignedExecutorId,
            ownerId: folder.project.ownerId,
            coOwnerIds: folder.project.coOwners.map((coOwner) => coOwner.userId),
          };

          if (!canCompleteProjectConceptStage(user, accessContext)) {
            return {
              error: "Only a project owner, co-owner, or administrator can import an approved Stage 3 concept.",
            } as const;
          }

          if (
            folder.project.workflowStages[0]?.status !==
            ProjectWorkflowStageStatus.AVAILABLE
          ) {
            return { error: "Stage 4 is not currently available." } as const;
          }

          if (folder.sourceStage3ConceptId) {
            if (folder.sourceStage3ConceptId === input.sourceConceptId) {
              const existingSource = await tx.projectConceptFolder.findUnique({
                where: { id: input.sourceConceptId },
                select: {
                  id: true,
                  name: true,
                  approvedAttachment: {
                    select: {
                      id: true,
                      originalFileName: true,
                      mimeType: true,
                      fileSize: true,
                    },
                  },
                },
              });

              if (existingSource?.approvedAttachment) {
                return {
                  imported: false,
                  reference: {
                    ...mapConceptAttachmentReference(existingSource.approvedAttachment),
                    sourceConceptId: existingSource.id,
                    sourceConceptName: existingSource.name,
                  },
                } as const;
              }
            }

            return {
              error: "This Stage 4 concept already has an imported Stage 3 reference.",
            } as const;
          }

          const sourceConcept = await tx.projectConceptFolder.findFirst({
            where: {
              id: input.sourceConceptId,
              projectId: input.projectId,
              workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
              approvedAttachmentId: { not: null },
            },
            select: {
              id: true,
              name: true,
              approvedAttachmentId: true,
              approvedAttachment: {
                select: {
                  id: true,
                  originalFileName: true,
                  mimeType: true,
                  fileSize: true,
                },
              },
            },
          });

          if (!sourceConcept?.approvedAttachmentId || !sourceConcept.approvedAttachment) {
            return {
              error: "Choose a Stage 3 concept that has an Approved Concept file.",
            } as const;
          }

          await tx.projectConceptFolder.update({
            where: { id: folder.id },
            data: {
              sourceStage3ConceptId: sourceConcept.id,
              sourceStage3ApprovedAttachmentId: sourceConcept.approvedAttachmentId,
            },
          });

          return {
            imported: true,
            reference: {
              ...mapConceptAttachmentReference(sourceConcept.approvedAttachment),
              sourceConceptId: sourceConcept.id,
              sourceConceptName: sourceConcept.name,
            },
          } as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      ),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          error: "That Stage 3 concept is already imported into another Stage 4 concept.",
        } as const;
      }

      if (error.code === "P2034") {
        return {
          error: "The concept reference changed at the same time. Please try again.",
        } as const;
      }
    }

    throw error;
  }
}

export async function renameProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    folderId: string;
    name: string;
  },
) {
  const validatedName = validateConceptFolderName(input.name);

  if ("error" in validatedName) {
    return validatedName;
  }

  return editProjectConceptFolder(user, input);
}

export async function editProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    folderId: string;
    name: string;
    assignedExecutorId?: string;
    deadline?: string;
    brief?: string | null;
  },
) {
  const validatedName = validateConceptFolderName(input.name);

  if ("error" in validatedName) {
    return validatedName;
  }

  const project = await getAuthorizedConceptProject(
    user,
    input.projectId,
    input.stageKey,
  );

  if (!project) {
    return { error: "You do not have permission to rename concept tasks." } as const;
  }

  const folder = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findFirst({
      where: {
        id: input.folderId,
        projectId: input.projectId,
        workflowStageKey: input.stageKey,
      },
      select: {
        id: true,
        taskerStageId: true,
        assignedExecutorId: true,
        taskerStage: {
          select: {
            actualStartedAt: true,
            description: true,
            plannedDueAt: true,
          },
        },
      },
    }),
  );

  if (!folder) {
    return { error: "Concept task not found." } as const;
  }

  const accessContext = getConceptAccessContext(project, folder, input.stageKey);
  if (!canManageProjectConcept(user, accessContext)) {
    return { error: "You do not have permission to edit concept tasks." } as const;
  }

  if (
    getWorkflowStageStatus(project, input.stageKey) ===
    ProjectWorkflowStageStatus.COMPLETED
  ) {
    return {
      error: "Concept management is locked because this workflow stage is completed.",
    } as const;
  }

  const requestedExecutorId = input.assignedExecutorId?.trim();
  const assignmentChanged =
    requestedExecutorId !== undefined &&
    requestedExecutorId !== folder.assignedExecutorId;
  const requestedBrief =
    input.brief === undefined ? undefined : sanitizeRichText(input.brief) || null;
  if (input.brief !== undefined && !requestedBrief) {
    return { error: "Concept Brief is required." } as const;
  }
  const briefChanged =
    requestedBrief !== undefined && requestedBrief !== folder.taskerStage.description;
  const requestedDeadline =
    input.deadline === undefined
      ? folder.taskerStage.plannedDueAt
      : new Date(input.deadline);
  if (input.deadline !== undefined && Number.isNaN(requestedDeadline?.getTime())) {
    return { error: "Deadline must be a valid date and time." } as const;
  }
  const deadlineChanged =
    input.deadline !== undefined &&
    folder.taskerStage.plannedDueAt?.getTime() !== requestedDeadline?.getTime();
  if (deadlineChanged && requestedDeadline && requestedDeadline.getTime() <= Date.now()) {
    return { error: "Deadline must be in the future." } as const;
  }

  if (requestedExecutorId === "") {
    return { error: "Assigned Executor is required." } as const;
  }

  if (
    requestedExecutorId &&
    !project.executors.some((executor) => executor.userId === requestedExecutorId)
  ) {
    return { error: "Assigned Executor must be a current project executor." } as const;
  }

  if (folder.taskerStage.actualStartedAt && (briefChanged || (assignmentChanged && folder.assignedExecutorId))) {
    return {
      error: "Assigned Executor and Concept Brief are locked after work starts.",
    } as const;
  }

  try {
    await withPrismaRetry(() =>
      prisma.$transaction([
        prisma.projectConceptFolder.update({
          where: { id: folder.id },
          data: {
            name: validatedName.name,
            normalizedName: validatedName.normalizedName,
            ...(requestedExecutorId !== undefined
              ? { assignedExecutorId: requestedExecutorId }
              : {}),
          },
        }),
        prisma.projectStage.update({
          where: { id: folder.taskerStageId },
          data: {
            name: validatedName.name,
            ...(input.deadline !== undefined
              ? { plannedDueAt: requestedDeadline }
              : {}),
            ...(requestedBrief !== undefined ? { description: requestedBrief } : {}),
          },
        }),
      ]),
    );

    return {
      folder: {
        id: folder.id,
        name: validatedName.name,
        taskerStageId: folder.taskerStageId,
        assignedExecutorId: requestedExecutorId ?? folder.assignedExecutorId,
        deadline: requestedDeadline,
      },
    } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A concept task with this name already exists." } as const;
    }

    throw error;
  }
}

const formalConceptAttachmentTypes: AttachmentAssetType[] = [
  AttachmentAssetType.REVISION_ORIGINAL,
  AttachmentAssetType.STAGE_SUBMISSION,
];

type FormalConceptAttachment = {
  id: string;
  projectId: string;
  stageId: string | null;
  revisionId: string | null;
  commentId: string | null;
  assetType: AttachmentAssetType;
  status: AttachmentStatus;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  revision: {
    projectId: string;
    stageId: string;
    status: ProjectRevisionStatus;
  } | null;
};

const formalConceptAttachmentSelect = {
  id: true,
  projectId: true,
  stageId: true,
  revisionId: true,
  commentId: true,
  assetType: true,
  status: true,
  originalFileName: true,
  mimeType: true,
  fileSize: true,
  revision: {
    select: {
      projectId: true,
      stageId: true,
      status: true,
    },
  },
} satisfies Prisma.ProjectAttachmentSelect;

async function approveConceptRevision(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    taskerStageId: string;
    revisionId: string;
    reviewedById: string;
    approvedAt: Date;
  },
) {
  await tx.projectRevision.update({
    where: { id: input.revisionId },
    data: {
      status: ProjectRevisionStatus.APPROVED,
      reviewedById: input.reviewedById,
      reviewedAt: input.approvedAt,
      rejectionReason: null,
    },
  });
  await tx.projectAttachment.updateMany({
    where: {
      projectId: input.projectId,
      stageId: input.taskerStageId,
      revisionId: input.revisionId,
      status: AttachmentStatus.READY,
      assetType: { in: formalConceptAttachmentTypes },
    },
    data: {
      submissionReviewStatus: SubmissionReviewStatus.APPROVED,
      reviewedById: input.reviewedById,
      reviewedAt: input.approvedAt,
      reviewNote: null,
    },
  });
  await tx.projectStage.update({
    where: { id: input.taskerStageId },
    data: {
      status: StageStatus.COMPLETED,
      completedAt: input.approvedAt,
    },
  });
}

function getFormalConceptAttachmentError(input: {
  attachment: FormalConceptAttachment | null;
  projectId: string;
  taskerStageId: string;
  projectCategory: string | null;
  workflowStageKey: ConceptWorkflowStageKey;
}) {
  const attachment = input.attachment;

  if (!attachment) {
    return "The selected concept file was not found.";
  }

  if (
    attachment.projectId !== input.projectId ||
    attachment.stageId !== input.taskerStageId ||
    !attachment.revisionId ||
    attachment.commentId !== null ||
    attachment.status !== AttachmentStatus.READY ||
    !formalConceptAttachmentTypes.includes(attachment.assetType) ||
    !attachment.revision ||
    attachment.revision.projectId !== input.projectId ||
    attachment.revision.stageId !== input.taskerStageId ||
    (attachment.revision.status !== ProjectRevisionStatus.PENDING_REVIEW &&
      attachment.revision.status !== ProjectRevisionStatus.APPROVED) ||
    !isAllowedStageSubmissionFile({
      fileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      projectCategory: input.projectCategory,
    })
  ) {
    return input.workflowStageKey === ProjectWorkflowStageKey.CONCEPT_CREATION
      ? "Only a ready formal revision file from this Stage 3 concept can be marked as the Approved Concept."
      : "Only a ready formal revision file from this exact Stage 4 concept can be marked as the Final Approved File.";
  }

  return null;
}

export async function markProjectConceptApprovedAttachment(
  user: PermissionUser,
  input: {
    projectId: string;
    folderId: string;
    attachmentId: string;
  },
) {
  try {
    const designation = await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const folder = await tx.projectConceptFolder.findFirst({
            where: {
              id: input.folderId,
              projectId: input.projectId,
              workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
              taskerStage: { projectId: input.projectId, isTasker: true },
            },
            select: {
              id: true,
              taskerStageId: true,
              assignedExecutorId: true,
              approvedAttachmentId: true,
              approvedById: true,
              approvedAt: true,
              promotedStage4Concept: { select: { id: true } },
              project: {
                select: {
                  category: true,
                  ownerId: true,
                  coOwners: { select: { userId: true } },
                  workflowStages: {
                    where: {
                      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
                    },
                    select: { status: true },
                  },
                },
              },
            },
          });

          if (!folder) {
            return { error: "Stage 3 concept not found." } as const;
          }

          const accessContext: ConceptAccessContext = {
            folderId: folder.id,
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
            assignedExecutorId: folder.assignedExecutorId,
            ownerId: folder.project.ownerId,
            coOwnerIds: folder.project.coOwners.map((coOwner) => coOwner.userId),
          };

          if (!canReviewProjectConcept(user, accessContext)) {
            return {
              error: "You do not have permission to approve concept files.",
            } as const;
          }

          const stageThreeStatus = folder.project.workflowStages[0]?.status;

          if (
            stageThreeStatus === ProjectWorkflowStageStatus.COMPLETED &&
            folder.approvedAttachmentId !== input.attachmentId
          ) {
            return {
              error: "Approved Concept selection is locked because Stage 3 is completed.",
            } as const;
          }

          if (
            stageThreeStatus !== ProjectWorkflowStageStatus.AVAILABLE &&
            stageThreeStatus !== ProjectWorkflowStageStatus.COMPLETED
          ) {
            return { error: "Stage 3 is not currently available." } as const;
          }

          const attachment = await tx.projectAttachment.findUnique({
            where: { id: input.attachmentId },
            select: formalConceptAttachmentSelect,
          });
          const attachmentError = getFormalConceptAttachmentError({
            attachment,
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            projectCategory: folder.project.category,
            workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
          });

          if (attachmentError || !attachment) {
            return {
              error:
                attachmentError ?? "The selected concept file was not found.",
            } as const;
          }

          const changed = folder.approvedAttachmentId !== attachment.id;
          const approvedAt = changed
            ? new Date()
            : (folder.approvedAt ?? new Date());
          const reviewedById = changed
            ? user.id
            : (folder.approvedById ?? user.id);

          if (changed) {
            await tx.projectConceptFolder.update({
              where: { id: folder.id },
              data: {
                approvedAttachmentId: attachment.id,
                approvedById: user.id,
                approvedAt,
              },
            });
            if (folder.promotedStage4Concept) {
              await tx.projectConceptFolder.update({
                where: { id: folder.promotedStage4Concept.id },
                data: { sourceStage3ApprovedAttachmentId: attachment.id },
              });
            }
          }

          await approveConceptRevision(tx, {
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            revisionId: attachment.revisionId!,
            reviewedById,
            approvedAt,
          });
          const unapprovedConceptCount = await tx.projectConceptFolder.count({
            where: {
              projectId: input.projectId,
              workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
              approvedAttachmentId: null,
            },
          });

          return {
            changed,
            folderId: folder.id,
            taskerStageId: folder.taskerStageId,
            assignedExecutorId: folder.assignedExecutorId,
            approvedAt,
            revisionId: attachment.revisionId!,
            revisionStatus: ProjectRevisionStatus.APPROVED,
            allConceptsApproved: unapprovedConceptCount === 0,
            attachment: mapConceptAttachmentReference(attachment),
          } as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      ),
    );

    return designation;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          error: "This file is already designated for another concept.",
        } as const;
      }

      if (error.code === "P2034") {
        return {
          error: "The concept changed at the same time. Please try again.",
        } as const;
      }
    }

    throw error;
  }
}

export async function markStageFourFinalApprovedAttachment(
  user: PermissionUser,
  input: {
    projectId: string;
    folderId: string;
    attachmentId: string;
  },
) {
  try {
    const designation = await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const folder = await tx.projectConceptFolder.findFirst({
            where: {
              id: input.folderId,
              projectId: input.projectId,
              workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
              taskerStage: { projectId: input.projectId, isTasker: true },
            },
            select: {
              id: true,
              taskerStageId: true,
              assignedExecutorId: true,
              approvedAttachmentId: true,
              approvedById: true,
              approvedAt: true,
              project: {
                select: {
                  category: true,
                  ownerId: true,
                  coOwners: { select: { userId: true } },
                  workflowStages: {
                    where: {
                      stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                    },
                    select: { status: true },
                  },
                },
              },
            },
          });

          if (!folder) {
            return { error: "Stage 4 concept not found." } as const;
          }

          const accessContext: ConceptAccessContext = {
            folderId: folder.id,
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
            assignedExecutorId: folder.assignedExecutorId,
            ownerId: folder.project.ownerId,
            coOwnerIds: folder.project.coOwners.map((coOwner) => coOwner.userId),
          };

          if (!canReviewProjectConcept(user, accessContext)) {
            return {
              error: "You do not have permission to approve final Stage 4 files.",
            } as const;
          }

          const stageFourStatus = folder.project.workflowStages[0]?.status;

          if (
            stageFourStatus === ProjectWorkflowStageStatus.COMPLETED &&
            folder.approvedAttachmentId !== input.attachmentId
          ) {
            return {
              error: "Final Approved File selection is locked because Stage 4 is completed.",
            } as const;
          }

          if (
            stageFourStatus !== ProjectWorkflowStageStatus.AVAILABLE &&
            stageFourStatus !== ProjectWorkflowStageStatus.COMPLETED
          ) {
            return { error: "Stage 4 is not currently available." } as const;
          }

          const attachment = await tx.projectAttachment.findUnique({
            where: { id: input.attachmentId },
            select: formalConceptAttachmentSelect,
          });
          const attachmentError = getFormalConceptAttachmentError({
            attachment,
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            projectCategory: folder.project.category,
            workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          });

          if (attachmentError || !attachment) {
            return {
              error:
                attachmentError ?? "The selected Stage 4 file was not found.",
            } as const;
          }

          const changed = folder.approvedAttachmentId !== attachment.id;
          let removedUnusedHandoff = false;

          if (changed && folder.approvedAttachmentId) {
            const downstream =
              await hasStageFiveDownstreamActivityForAttachment(tx, {
                projectId: input.projectId,
                attachmentId: folder.approvedAttachmentId,
              });

            if (downstream.hasActivity) {
              return {
                error:
                  "This final file already has Stage 5 activity and cannot be replaced directly.",
              } as const;
            }

            if (downstream.handoffId) {
              await tx.projectStageFileHandoff.delete({
                where: { id: downstream.handoffId },
              });
              removedUnusedHandoff = true;
            }
          }

          const approvedAt = changed
            ? new Date()
            : (folder.approvedAt ?? new Date());
          const reviewedById = changed
            ? user.id
            : (folder.approvedById ?? user.id);
          if (changed) {
            await tx.projectConceptFolder.update({
              where: { id: folder.id },
              data: {
                approvedAttachmentId: attachment.id,
                approvedById: user.id,
                approvedAt,
              },
            });
          }

          await approveConceptRevision(tx, {
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            revisionId: attachment.revisionId!,
            reviewedById,
            approvedAt,
          });
          const conceptsWithoutFinalFile = await tx.projectConceptFolder.count({
            where: {
              projectId: input.projectId,
              workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
              approvedAttachmentId: null,
            },
          });

          return {
            changed,
            folderId: folder.id,
            taskerStageId: folder.taskerStageId,
            assignedExecutorId: folder.assignedExecutorId,
            approvedAt,
            removedUnusedHandoff,
            revisionId: attachment.revisionId!,
            revisionStatus: ProjectRevisionStatus.APPROVED,
            allConceptsApproved: conceptsWithoutFinalFile === 0,
            attachment: mapConceptAttachmentReference(attachment),
          } as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 20_000,
        },
      ),
    );

    return designation;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          error: "This file is already designated for another concept.",
        } as const;
      }

      if (error.code === "P2034") {
        return {
          error: "The final file changed at the same time. Please try again.",
        } as const;
      }
    }

    throw error;
  }
}

async function revokeConceptApprovedAttachment(
  user: PermissionUser,
  input: {
    projectId: string;
    folderId: string;
  },
  workflowStageKey: ConceptWorkflowStageKey,
  conflictRetryCount = 0,
) {
  const stageNumber =
    workflowStageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ? 3 : 4;
  const nextWorkflowStageKey =
    stageNumber === 3
      ? ProjectWorkflowStageKey.PROJECT_DEVELOPMENT
      : ProjectWorkflowStageKey.FINAL_LAYOUT;
  const approvalLabel =
    stageNumber === 3 ? "Approved Concept" : "Final Approved File";

  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const folder = await tx.projectConceptFolder.findFirst({
            where: {
              id: input.folderId,
              projectId: input.projectId,
              workflowStageKey,
              taskerStage: { projectId: input.projectId, isTasker: true },
            },
            select: {
              id: true,
              taskerStageId: true,
              assignedExecutorId: true,
              approvedAttachmentId: true,
              approvedAttachment: {
                select: { id: true, revisionId: true },
              },
              promotedStage4Concept: {
                select: {
                  id: true,
                  taskerStageId: true,
                  approvedAttachmentId: true,
                  approvedAttachment: {
                    select: { id: true, revisionId: true },
                  },
                },
              },
              project: {
                select: {
                  ownerId: true,
                  coOwners: { select: { userId: true } },
                  workflowStages: {
                    select: { id: true, stageKey: true, status: true },
                  },
                },
              },
            },
          });

          if (!folder) {
            return { error: `Stage ${stageNumber} concept not found.` } as const;
          }

          const accessContext: ConceptAccessContext = {
            folderId: folder.id,
            projectId: input.projectId,
            taskerStageId: folder.taskerStageId,
            workflowStageKey,
            assignedExecutorId: folder.assignedExecutorId,
            ownerId: folder.project.ownerId,
            coOwnerIds: folder.project.coOwners.map((coOwner) => coOwner.userId),
          };

          if (!canReviewProjectConcept(user, accessContext)) {
            return {
              error: `You do not have permission to revoke the ${approvalLabel}.`,
            } as const;
          }

          const workflowStage = folder.project.workflowStages.find(
            (stage) => stage.stageKey === workflowStageKey,
          );
          const nextWorkflowStage = folder.project.workflowStages.find(
            (stage) => stage.stageKey === nextWorkflowStageKey,
          );
          const stageFiveWorkflow = folder.project.workflowStages.find(
            (stage) => stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT,
          );
          const stageSixWorkflow = folder.project.workflowStages.find(
            (stage) =>
              stage.stageKey ===
              ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
          );
          const stageSevenWorkflow = folder.project.workflowStages.find(
            (stage) =>
              stage.stageKey ===
              ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
          );
          const workflowStatus = workflowStage?.status;
          if (
            workflowStatus !== ProjectWorkflowStageStatus.AVAILABLE &&
            workflowStatus !== ProjectWorkflowStageStatus.COMPLETED
          ) {
            return { error: `Stage ${stageNumber} is not currently available.` } as const;
          }
          if (!workflowStage || !nextWorkflowStage) {
            return {
              error: `Stage ${stageNumber} and Stage ${stageNumber + 1} workflow records are required for revocation.`,
            } as const;
          }
          const reopensWorkflowStage =
            workflowStatus === ProjectWorkflowStageStatus.COMPLETED;

          if (
            stageNumber === 3 &&
            reopensWorkflowStage &&
            (!stageFiveWorkflow || !stageSixWorkflow || !stageSevenWorkflow)
          ) {
            return {
              error:
                "Stage 3 through Stage 7 workflow records are required for rework.",
            } as const;
          }

          const approvedAttachment = folder.approvedAttachment;
          if (
            !folder.approvedAttachmentId ||
            !approvedAttachment ||
            !approvedAttachment.revisionId
          ) {
            return {
              error: `This concept does not currently have a designated ${approvalLabel}.`,
            } as const;
          }

          let cascadedStageFourApproval = false;
          let removedStageFiveHandoff = false;
          let resetThroughStageFive = false;
          let removedUnusedHandoff = false;

          if (stageNumber === 3) {
            if (reopensWorkflowStage) {
              if (
                stageSixWorkflow!.status ===
                  ProjectWorkflowStageStatus.COMPLETED ||
                stageSevenWorkflow!.status !==
                  ProjectWorkflowStageStatus.LOCKED
              ) {
                return {
                  error:
                    "Stage 6 production work has already started, so this Stage 3 approval can no longer be revoked.",
                } as const;
              }

              const stageSixUnits = await tx.projectProductionUnit.findMany({
                where: { projectId: input.projectId },
                select: {
                  status: true,
                  approvedAt: true,
                  handedOverAt: true,
                  _count: { select: { files: true } },
                  handover: { select: { id: true } },
                  supervision: { select: { id: true } },
                  approvalSteps: {
                    select: {
                      sequence: true,
                      isMarketingDirectorRequired: true,
                      clientRequestId: true,
                      requestedById: true,
                      status: true,
                      dispatchStatus: true,
                      activatedAt: true,
                      sentAt: true,
                      decidedAt: true,
                    },
                  },
                },
              });
              const stageSixHasActivity = stageSixUnits.some((unit) => {
                const bootstrapStep = unit.approvalSteps[0];

                return (
                  unit.status !== ProjectProductionUnitStatus.PREPARATION ||
                  unit.approvedAt !== null ||
                  unit.handedOverAt !== null ||
                  unit._count.files > 0 ||
                  unit.handover !== null ||
                  unit.supervision !== null ||
                  unit.approvalSteps.length !== 1 ||
                  !bootstrapStep ||
                  bootstrapStep.sequence !== 1 ||
                  !bootstrapStep.isMarketingDirectorRequired ||
                  bootstrapStep.clientRequestId !== null ||
                  bootstrapStep.requestedById !== null ||
                  bootstrapStep.status !== ProductionApprovalStepStatus.WAITING ||
                  bootstrapStep.dispatchStatus !==
                    ProductionDispatchStatus.NOT_SENT ||
                  bootstrapStep.activatedAt !== null ||
                  bootstrapStep.sentAt !== null ||
                  bootstrapStep.decidedAt !== null
                );
              });

              if (stageSixHasActivity) {
                return {
                  error:
                    "Stage 6 production work has already started, so this Stage 3 approval can no longer be revoked.",
                } as const;
              }

              resetThroughStageFive = [
                nextWorkflowStage,
                stageFiveWorkflow!,
                stageSixWorkflow!,
              ].some(
                (stage) =>
                  stage.status !== ProjectWorkflowStageStatus.LOCKED,
              );
            }

            const promotedConcept = folder.promotedStage4Concept;
            if (promotedConcept) {
              const promotedApproval = promotedConcept.approvedAttachment;
              if (
                promotedConcept.approvedAttachmentId &&
                (!promotedApproval || !promotedApproval.revisionId)
              ) {
                return {
                  error:
                    "The dependent Stage 4 approval is incomplete and could not be reset safely.",
                } as const;
              }

              if (promotedApproval?.revisionId) {
                const handoff = await tx.projectStageFileHandoff.findFirst({
                  where: {
                    projectId: input.projectId,
                    sourceWorkflowStageKey:
                      ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                    sourceAttachmentId: promotedApproval.id,
                    targetWorkflowStageKey:
                      ProjectWorkflowStageKey.FINAL_LAYOUT,
                  },
                  select: { id: true },
                });

                if (handoff) {
                  await tx.projectStageFileHandoff.delete({
                    where: { id: handoff.id },
                  });
                  removedStageFiveHandoff = true;
                }

                await tx.projectRevision.update({
                  where: { id: promotedApproval.revisionId },
                  data: {
                    status: ProjectRevisionStatus.PENDING_REVIEW,
                    reviewedById: null,
                    reviewedAt: null,
                    rejectionReason: null,
                  },
                });
                await tx.projectAttachment.updateMany({
                  where: {
                    projectId: input.projectId,
                    stageId: promotedConcept.taskerStageId,
                    revisionId: promotedApproval.revisionId,
                    status: AttachmentStatus.READY,
                    assetType: { in: formalConceptAttachmentTypes },
                  },
                  data: {
                    submissionReviewStatus:
                      SubmissionReviewStatus.PENDING_REVIEW,
                    reviewedById: null,
                    reviewedAt: null,
                    reviewNote: null,
                  },
                });
                cascadedStageFourApproval = true;
              }

              await tx.projectConceptFolder.update({
                where: { id: promotedConcept.id },
                data: {
                  ...(promotedConcept.approvedAttachmentId
                    ? {
                        approvedAttachmentId: null,
                        approvedById: null,
                        approvedAt: null,
                      }
                    : {}),
                },
              });
              await tx.projectStage.update({
                where: { id: promotedConcept.taskerStageId },
                data: {
                  status: StageStatus.ONGOING,
                  completedAt: null,
                },
              });
            }
          }

          if (stageNumber === 4) {
            if (reopensWorkflowStage) {
              if (nextWorkflowStage.status === ProjectWorkflowStageStatus.COMPLETED) {
                return {
                  error:
                    "Stage 5 is already completed, so this Final Approved File cannot be revoked.",
                } as const;
              }

              const stageFiveHandoffs = await tx.projectStageFileHandoff.findMany({
                where: {
                  projectId: input.projectId,
                  sourceWorkflowStageKey:
                    ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                  targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
                },
                select: { sourceAttachmentId: true },
              });
              for (const handoff of stageFiveHandoffs) {
                const handoffActivity =
                  await hasStageFiveDownstreamActivityForAttachment(tx, {
                    projectId: input.projectId,
                    attachmentId: handoff.sourceAttachmentId,
                  });
                if (handoffActivity.hasActivity) {
                  return {
                    error:
                      "Stage 5 already contains checklist activity, so this Final Approved File cannot be revoked.",
                  } as const;
                }
              }
            }

            const downstream = await hasStageFiveDownstreamActivityForAttachment(tx, {
              projectId: input.projectId,
              attachmentId: approvedAttachment.id,
            });

            if (downstream.hasActivity) {
              return {
                error:
                  "This Final Approved File already has Stage 5 activity and cannot be revoked.",
              } as const;
            }

            if (downstream.handoffId) {
              await tx.projectStageFileHandoff.delete({
                where: { id: downstream.handoffId },
              });
              removedUnusedHandoff = true;
            }
          }

          if (reopensWorkflowStage) {
            await tx.projectWorkflowStage.update({
              where: { id: workflowStage.id },
              data: {
                status: ProjectWorkflowStageStatus.AVAILABLE,
                completedAt: null,
              },
            });

            if (stageNumber === 3) {
              await tx.projectWorkflowStage.updateMany({
                where: {
                  projectId: input.projectId,
                  stageKey: {
                    in: [
                      ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                      ProjectWorkflowStageKey.FINAL_LAYOUT,
                      ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
                      ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
                    ],
                  },
                },
                data: {
                  status: ProjectWorkflowStageStatus.LOCKED,
                  unlockedAt: null,
                  completedAt: null,
                },
              });
            } else if (
              nextWorkflowStage.status === ProjectWorkflowStageStatus.AVAILABLE
            ) {
              await tx.projectWorkflowStage.update({
                where: { id: nextWorkflowStage.id },
                data: {
                  status: ProjectWorkflowStageStatus.LOCKED,
                  unlockedAt: null,
                  completedAt: null,
                },
              });
            }
          }

          await tx.projectConceptFolder.update({
            where: { id: folder.id },
            data: {
              approvedAttachmentId: null,
              approvedById: null,
              approvedAt: null,
            },
          });
          await tx.projectRevision.update({
            where: { id: approvedAttachment.revisionId },
            data: {
              status: ProjectRevisionStatus.PENDING_REVIEW,
              reviewedById: null,
              reviewedAt: null,
              rejectionReason: null,
            },
          });
          await tx.projectAttachment.updateMany({
            where: {
              projectId: input.projectId,
              stageId: folder.taskerStageId,
              revisionId: approvedAttachment.revisionId,
              status: AttachmentStatus.READY,
              assetType: { in: formalConceptAttachmentTypes },
            },
            data: {
              submissionReviewStatus: SubmissionReviewStatus.PENDING_REVIEW,
              reviewedById: null,
              reviewedAt: null,
              reviewNote: null,
            },
          });
          await tx.projectStage.update({
            where: { id: folder.taskerStageId },
            data: {
              status: StageStatus.ONGOING,
              completedAt: null,
            },
          });

          return {
            changed: true,
            folderId: folder.id,
            taskerStageId: folder.taskerStageId,
            assignedExecutorId: folder.assignedExecutorId,
            attachmentId: approvedAttachment.id,
            revisionId: approvedAttachment.revisionId,
            revisionStatus: ProjectRevisionStatus.PENDING_REVIEW,
            cascadedStageFourApproval,
            removedStageFiveHandoff,
            removedUnusedHandoff,
            reopensWorkflowStage,
            resetThroughStageFive,
          } as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 30_000,
        },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      if (conflictRetryCount < 1) {
        return revokeConceptApprovedAttachment(
          user,
          input,
          workflowStageKey,
          conflictRetryCount + 1,
        );
      }

      return {
        error: "The concept approval changed at the same time. Please try again.",
      } as const;
    }

    throw error;
  }
}

export async function revokeProjectConceptApprovedAttachment(
  user: PermissionUser,
  input: { projectId: string; folderId: string },
) {
  return revokeConceptApprovedAttachment(
    user,
    input,
    ProjectWorkflowStageKey.CONCEPT_CREATION,
  );
}

export async function revokeStageFourFinalApprovedAttachment(
  user: PermissionUser,
  input: { projectId: string; folderId: string },
) {
  return revokeConceptApprovedAttachment(
    user,
    input,
    ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
  );
}

type StageThreeCompletionResult = {
  transitioned: boolean;
  createdFolderIds: string[];
  promotedFolderIds: string[];
  approvedCount: number;
  skipped: boolean;
  unapprovedConcepts: Array<{ id: string; name: string }>;
};

export async function completeStageThreeConcepts(
  user: PermissionUser,
  input: { projectId: string },
  conflictRetryCount = 0,
) {
  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx): Promise<StageThreeCompletionResult | { error: string }> => {
          const project = await tx.project.findUnique({
            where: { id: input.projectId },
            select: {
              id: true,
              category: true,
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
              conceptFolders: {
                where: {
                  workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
                },
                orderBy: [
                  { sortOrder: "asc" },
                  { createdAt: "asc" },
                  { id: "asc" },
                ],
                select: {
                  id: true,
                  name: true,
                  normalizedName: true,
                  taskerStageId: true,
                  assignedExecutorId: true,
                  approvedAttachmentId: true,
                  approvedAttachment: {
                    select: formalConceptAttachmentSelect,
                  },
                },
              },
            },
          });

          if (!project) {
            return { error: "Project not found." };
          }

          const managerContext: ConceptAccessContext = {
            folderId: "",
            projectId: project.id,
            taskerStageId: "",
            workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
            assignedExecutorId: null,
            ownerId: project.ownerId,
            coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
          };

          if (!canCompleteProjectConceptStage(user, managerContext)) {
            return {
              error:
                "Only a project owner, co-owner, or administrator can complete Stage 3.",
            };
          }

          const stageThreeWorkflow = project.workflowStages.find(
            (stage) =>
              stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION,
          );
          const stageFourWorkflow = project.workflowStages.find(
            (stage) =>
              stage.stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          );

          if (!stageThreeWorkflow || !stageFourWorkflow) {
            return {
              error: "Stage 3 and Stage 4 workflow records are required before completion.",
            };
          }

          const completionMode = getWorkflowStageCompletionMode(
            project.workflowStages,
            ProjectWorkflowStageKey.CONCEPT_CREATION,
          );

          if (completionMode === "UNAVAILABLE") {
            return { error: "Stage 3 is not currently available." };
          }

          const approvedConcepts = project.conceptFolders.filter(
            (folder) => Boolean(folder.approvedAttachmentId),
          );
          const unapprovedConcepts = project.conceptFolders
            .filter((folder) => !folder.approvedAttachmentId)
            .map((folder) => ({ id: folder.id, name: folder.name }));

          if (unapprovedConcepts.length > 0) {
            return {
              error: `Every Stage 3 concept must have an Approved Concept before Stage 3 can be completed. Pending: ${unapprovedConcepts.map((concept) => concept.name).join(", ")}.`,
            };
          }

          for (const concept of approvedConcepts) {
            const attachmentError = getFormalConceptAttachmentError({
              attachment: concept.approvedAttachment,
              projectId: project.id,
              taskerStageId: concept.taskerStageId,
              projectCategory: project.category,
              workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
            });

            if (attachmentError) {
              return {
                error: `The Approved Concept for “${concept.name}” is no longer eligible. Select a valid formal revision file before completing Stage 3.`,
              };
            }
          }

          const transitioned = completionMode === "TRANSITION";
          const completedAt = new Date();

          if (transitioned) {
            const completed = await tx.projectWorkflowStage.updateMany({
              where: {
                id: stageThreeWorkflow.id,
                status: ProjectWorkflowStageStatus.AVAILABLE,
              },
              data: {
                status: ProjectWorkflowStageStatus.COMPLETED,
                completedAt,
              },
            });

            if (completed.count === 1) {
              await tx.projectWorkflowStage.updateMany({
                where: {
                  id: stageFourWorkflow.id,
                  status: ProjectWorkflowStageStatus.LOCKED,
                },
                data: {
                  status: ProjectWorkflowStageStatus.AVAILABLE,
                  unlockedAt: completedAt,
                },
              });
            }
          }

          return {
            transitioned,
            createdFolderIds: [],
            promotedFolderIds: [],
            approvedCount: approvedConcepts.length,
            skipped: project.conceptFolders.length === 0,
            unapprovedConcepts,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 30_000,
        },
      ),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (
        (error.code === "P2002" || error.code === "P2034") &&
        conflictRetryCount < 1
      ) {
        return completeStageThreeConcepts(
          user,
          input,
          conflictRetryCount + 1,
        );
      }

      if (error.code === "P2002" || error.code === "P2034") {
        return {
          error: "Stage 3 changed at the same time. Please try completion again.",
        } as const;
      }
    }

    throw error;
  }
}

type StageFourCompletionResult = {
  transitioned: boolean;
  finalApprovedCount: number;
  conceptsWithoutFinalFile: Array<{ id: string; name: string }>;
  handoffs: Array<{
    id: string;
    sourceAttachmentId: string;
    checklistId: string;
  }>;
};

export async function completeStageFourConcepts(
  user: PermissionUser,
  input: { projectId: string },
  conflictRetryCount = 0,
) {
  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx): Promise<StageFourCompletionResult | { error: string }> => {
          const project = await tx.project.findUnique({
            where: { id: input.projectId },
            select: {
              id: true,
              category: true,
              ownerId: true,
              coOwners: { select: { userId: true } },
              workflowStages: {
                select: {
                  id: true,
                  stageKey: true,
                  status: true,
                  completedAt: true,
                  unlockedAt: true,
                },
              },
              conceptFolders: {
                where: {
                  workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                },
                orderBy: [
                  { sortOrder: "asc" },
                  { createdAt: "asc" },
                  { id: "asc" },
                ],
                select: {
                  id: true,
                  name: true,
                  taskerStageId: true,
                  approvedAttachmentId: true,
                  approvedAttachment: {
                    select: formalConceptAttachmentSelect,
                  },
                },
              },
            },
          });

          if (!project) {
            return { error: "Project not found." };
          }

          const managerContext: ConceptAccessContext = {
            folderId: "",
            projectId: project.id,
            taskerStageId: "",
            workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
            assignedExecutorId: null,
            ownerId: project.ownerId,
            coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
          };

          if (!canCompleteProjectConceptStage(user, managerContext)) {
            return {
              error:
                "Only a project owner, co-owner, or administrator can complete Stage 4.",
            };
          }

          const stageFourWorkflow = project.workflowStages.find(
            (stage) =>
              stage.stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          );
          const stageFiveWorkflow = project.workflowStages.find(
            (stage) => stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT,
          );

          if (!stageFourWorkflow || !stageFiveWorkflow) {
            return {
              error: "Stage 4 and Stage 5 workflow records are required before completion.",
            };
          }

          const completionMode = getWorkflowStageCompletionMode(
            project.workflowStages,
            ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          );

          if (completionMode === "UNAVAILABLE") {
            return { error: "Stage 4 is not currently available." };
          }

          const finalConcepts = project.conceptFolders.filter(
            (folder) => Boolean(folder.approvedAttachmentId),
          );
          const conceptsWithoutFinalFile = project.conceptFolders
            .filter((folder) => !folder.approvedAttachmentId)
            .map((folder) => ({ id: folder.id, name: folder.name }));

          if (finalConcepts.length === 0) {
            return {
              error:
                "At least one concept must have a Final Approved File before Stage 4 can be completed.",
            };
          }

          if (conceptsWithoutFinalFile.length > 0) {
            return {
              error: `Every Stage 4 concept must receive Final Approval before Stage 4 can be completed. Pending: ${conceptsWithoutFinalFile.map((concept) => concept.name).join(", ")}.`,
            };
          }

          for (const concept of finalConcepts) {
            const attachmentError = getFormalConceptAttachmentError({
              attachment: concept.approvedAttachment,
              projectId: project.id,
              taskerStageId: concept.taskerStageId,
              projectCategory: project.category,
              workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
            });

            if (attachmentError) {
              return {
                error: `The Final Approved File for “${concept.name}” is no longer eligible. Select a valid formal Stage 4 revision file before completing Stage 4.`,
              };
            }
          }

          const finalAttachmentIds = finalConcepts.map(
            (concept) => concept.approvedAttachmentId!,
          );
          const [existingHandoffs, existingChecklists] = await Promise.all([
            tx.projectStageFileHandoff.findMany({
              where: {
                projectId: project.id,
                sourceAttachmentId: { in: finalAttachmentIds },
                targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
              },
              select: {
                id: true,
                sourceWorkflowStageKey: true,
              },
            }),
            tx.projectFileChecklist.findMany({
              where: {
                projectId: project.id,
                sourceAttachmentId: { in: finalAttachmentIds },
              },
              select: {
                id: true,
                sourceAttachmentId: true,
                handoff: {
                  select: {
                    id: true,
                    projectId: true,
                    sourceAttachmentId: true,
                    sourceWorkflowStageKey: true,
                    targetWorkflowStageKey: true,
                  },
                },
              },
            }),
          ]);

          if (
            existingHandoffs.some(
              (handoff) =>
                handoff.sourceWorkflowStageKey !==
                ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
            )
          ) {
            return {
              error:
                "An existing Stage 5 handoff conflicts with its final file source stage. Stage 4 was not completed.",
            };
          }

          for (const checklist of existingChecklists) {
            if (
              checklist.handoff.projectId !== project.id ||
              checklist.handoff.sourceAttachmentId !==
                checklist.sourceAttachmentId ||
              checklist.handoff.sourceWorkflowStageKey !==
                ProjectWorkflowStageKey.PROJECT_DEVELOPMENT ||
              checklist.handoff.targetWorkflowStageKey !==
                ProjectWorkflowStageKey.FINAL_LAYOUT
            ) {
              return {
                error:
                  "An existing Stage 5 checklist conflicts with its final file handoff. Stage 4 was not completed.",
              };
            }
          }

          const handoffs: StageFourCompletionResult["handoffs"] = [];

          for (const concept of finalConcepts) {
            const sourceAttachmentId = concept.approvedAttachmentId!;
            const handoff = await tx.projectStageFileHandoff.upsert({
              where: {
                projectId_sourceAttachmentId_targetWorkflowStageKey: {
                  projectId: project.id,
                  sourceAttachmentId,
                  targetWorkflowStageKey:
                    ProjectWorkflowStageKey.FINAL_LAYOUT,
                },
              },
              update: {},
              create: {
                projectId: project.id,
                sourceWorkflowStageKey:
                  ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                sourceAttachmentId,
                targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
                handedOffById: user.id,
              },
              select: { id: true, sourceAttachmentId: true },
            });
            const checklist = await tx.projectFileChecklist.upsert({
              where: { handoffId: handoff.id },
              update: {},
              create: {
                projectId: project.id,
                handoffId: handoff.id,
                sourceAttachmentId,
              },
              select: {
                id: true,
                projectId: true,
                sourceAttachmentId: true,
              },
            });

            if (
              checklist.projectId !== project.id ||
              checklist.sourceAttachmentId !== sourceAttachmentId
            ) {
              throw new Error(
                "Existing Stage 5 checklist does not match its final file.",
              );
            }

            handoffs.push({
              id: handoff.id,
              sourceAttachmentId,
              checklistId: checklist.id,
            });
          }

          const transitioned = completionMode === "TRANSITION";
          const completedAt = new Date();

          if (transitioned) {
            const completed = await tx.projectWorkflowStage.updateMany({
              where: {
                id: stageFourWorkflow.id,
                status: ProjectWorkflowStageStatus.AVAILABLE,
              },
              data: {
                status: ProjectWorkflowStageStatus.COMPLETED,
                completedAt,
              },
            });

            if (completed.count === 1) {
              await tx.projectWorkflowStage.updateMany({
                where: {
                  id: stageFiveWorkflow.id,
                  status: ProjectWorkflowStageStatus.LOCKED,
                },
                data: {
                  status: ProjectWorkflowStageStatus.AVAILABLE,
                  unlockedAt: completedAt,
                },
              });
            }
          }

          return {
            transitioned,
            finalApprovedCount: finalConcepts.length,
            conceptsWithoutFinalFile,
            handoffs,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 30_000,
        },
      ),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (
        (error.code === "P2002" || error.code === "P2034") &&
        conflictRetryCount < 1
      ) {
        return completeStageFourConcepts(
          user,
          input,
          conflictRetryCount + 1,
        );
      }

      if (error.code === "P2002" || error.code === "P2034") {
        return {
          error:
            "Stage 4 changed at the same time. Please try completion again.",
        } as const;
      }
    }

    throw error;
  }
}

export async function getProjectConceptChatContext(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    folderId: string;
  },
) {
  const record = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findFirst({
      where: {
        id: input.folderId,
        projectId: input.projectId,
        workflowStageKey: input.stageKey,
        taskerStage: {
          projectId: input.projectId,
          isTasker: true,
        },
      },
      relationLoadStrategy: "join",
      select: {
        id: true,
        name: true,
        taskerStageId: true,
        assignedExecutorId: true,
        approvedAttachmentId: true,
        sourceStage3Concept: {
          select: { id: true, name: true },
        },
        sourceStage3ApprovedAttachment: {
          select: {
            id: true,
            originalFileName: true,
            mimeType: true,
            fileSize: true,
          },
        },
        assignedExecutor: {
          select: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        project: { select: projectStageAccessSelect },
      },
    }),
  );

  if (
    !record ||
    !canViewProjectConcept(
      user,
      getConceptAccessContext(record.project, record, input.stageKey),
    ) ||
    !canOpenImplementedWorkflowStage({
      stageKey: input.stageKey,
      status: getWorkflowStageStatus(record.project, input.stageKey),
    })
  ) {
    return null;
  }

  const accessContext = getConceptAccessContext(
    record.project,
    record,
    input.stageKey,
  );
  const stageNumber =
    input.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ? 3 : 4;
  const conceptPath = `/projects/${encodeURIComponent(input.projectId)}/stages/${stageNumber}/concepts/${encodeURIComponent(record.id)}`;
  const canManage = canManageProjectConcept(user, accessContext);
  const canReview = canReviewProjectConcept(user, accessContext);
  const workflowStatus = getWorkflowStageStatus(record.project, input.stageKey);
  const startingReference =
    record.sourceStage3Concept && record.sourceStage3ApprovedAttachment
      ? {
          ...mapConceptAttachmentReference(record.sourceStage3ApprovedAttachment),
          sourceConceptId: record.sourceStage3Concept.id,
          sourceConceptName: record.sourceStage3Concept.name,
        }
      : null;
  const availableStageThreeReferences =
    input.stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT &&
    canCompleteProjectConceptStage(user, accessContext) &&
    workflowStatus === ProjectWorkflowStageStatus.AVAILABLE &&
    !startingReference
      ? await withPrismaRetry(() =>
          prisma.projectConceptFolder.findMany({
            where: {
              projectId: input.projectId,
              workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
              approvedAttachmentId: { not: null },
              promotedStage4Concept: null,
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              name: true,
              approvedAttachment: {
                select: {
                  id: true,
                  originalFileName: true,
                  mimeType: true,
                  fileSize: true,
                },
              },
            },
          }),
        ).then((concepts) =>
          concepts.flatMap((concept) =>
            concept.approvedAttachment
              ? [
                  {
                    ...mapConceptAttachmentReference(concept.approvedAttachment),
                    sourceConceptId: concept.id,
                    sourceConceptName: concept.name,
                  },
                ]
              : [],
          ),
        )
      : [];

  return {
    projectId: input.projectId,
    workflowStageKey: input.stageKey,
    folder: {
      id: record.id,
      name: record.name,
      taskerStageId: record.taskerStageId,
    },
    chatMode: {
      type: "concept",
      folderId: record.id,
      workflowStageKey: input.stageKey,
      stageNumber,
      stageLabel:
        stageNumber === 3
          ? "Stage 3 - Initial Concept"
          : "Stage 4 - Final Concept",
      conceptName: record.name,
      assignedExecutor: record.assignedExecutor?.user ?? null,
      canManage,
      canReview,
      isAssignedExecutor: record.assignedExecutorId === user.id,
      participantUserIds: getProjectConceptParticipantUserIds(accessContext),
      approvedAttachmentId: record.approvedAttachmentId,
      isWorkflowCompleted:
        workflowStatus === ProjectWorkflowStageStatus.COMPLETED,
      startingReference,
      availableStageThreeReferences,
      backHref: `/projects/${encodeURIComponent(input.projectId)}/stages/${stageNumber}`,
      compareHref: `${conceptPath}/compare`,
    } satisfies ProjectConceptChatMode,
  };
}
