import { randomUUID } from "node:crypto";

import {
  ArchiveRecordStatus,
  AttachmentAssetType,
  AttachmentStatus,
  Prisma,
  ProjectCompletionDocumentType,
  ProjectCompletionStepStatus,
  ProjectExecutionType,
  ProjectRevisionStatus,
  SubmissionReviewStatus,
  type User,
} from "@prisma/client";

import { getUserDisplayName } from "@/lib/auth";
import {
  assertProjectTimestampVisibleForUser,
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
import {
  notifyApprovalProofUploaded,
  notifyCopyrightDocumentUploaded,
  notifyInvoiceUploaded,
  runNotificationTask,
} from "@/lib/notification-center";
import {
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import type { PermissionKey } from "@/lib/permissions/definitions";
import { assertProjectAccess } from "@/lib/project-history";
import { isProjectStatusCompleted } from "@/lib/project-statuses";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  buildProjectCompletionDocumentKey,
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadUrl,
  getFileExtension,
  getMaxAssetUploadBytes,
  getS3BucketName,
  isAllowedProjectCompletionDocument,
  sanitizeFileName,
} from "@/lib/storage/s3";
import {
  COMPLETION_DOCUMENT_ALLOWED_EXTENSIONS,
  UploadFileTypeError,
  buildFileTypeNotAllowedPayload,
} from "@/lib/upload-validation";

export type ProjectCompletionWorkflowUser = Pick<
  User,
  "id" | "role" | "email" | "name"
> &
  PermissionUser;

export type ProjectCompletionContactOption = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
};

export type ProjectCompletionArchivedFileOption = {
  id: string;
  sourceAttachmentId: string;
  finalArchiveFileName: string;
  originalFileName: string;
  fileTypeLabel: string;
  mimeType: string;
  fileSizeLabel: string;
  sourceLabel: string;
  previewPath: string;
  downloadPath: string;
};

export type ProjectCompletionDocumentRecord = {
  id: string;
  type: ProjectCompletionDocumentType;
  typeLabel: string;
  originalFileName: string;
  archiveFileName: string;
  mimeType: string;
  fileTypeLabel: string;
  fileSizeLabel: string;
  uploadedAt: string;
  uploadedBy: string;
  previewPath: string;
  downloadPath: string;
};

export type ProjectCompletionWorkflowRecord = {
  workflowId: string;
  projectId: string;
  executionType: ProjectExecutionType | null;
  executionTypeLabel: string;
  isInternalExecution: boolean;
  canManage: boolean;
  canUploadApprovalProof: boolean;
  canUploadCopyrightDocument: boolean;
  canUploadInvoice: boolean;
  needsInitialConfiguration: boolean;
  approvalRequired: boolean | null;
  approvalStatus: ProjectCompletionStepStatus;
  approvalContactUserId: string | null;
  approvalContactName: string | null;
  approvalNote: string | null;
  approvalRequestedAt: string | null;
  approvalCompletedAt: string | null;
  approvalSelectedArchivedFileIds: string[];
  approvalSelectedProjectFileIds: string[];
  copyrightRequired: boolean | null;
  copyrightStatus: ProjectCompletionStepStatus;
  copyrightContactUserId: string | null;
  copyrightContactName: string | null;
  copyrightNote: string | null;
  copyrightRequestedAt: string | null;
  copyrightCompletedAt: string | null;
  invoiceRequired: boolean | null;
  invoiceStatus: ProjectCompletionStepStatus;
  invoiceContactUserId: string | null;
  invoiceContactName: string | null;
  invoiceNote: string | null;
  invoiceRequestedAt: string | null;
  invoiceCompletedAt: string | null;
  completedAt: string | null;
  isApprovalResolved: boolean;
  isCopyrightUnlocked: boolean;
  isCopyrightResolved: boolean;
  isInvoiceUnlocked: boolean;
  availableContacts: ProjectCompletionContactOption[];
  finalArchivedFiles: ProjectCompletionArchivedFileOption[];
  approvalSelectedFiles: ProjectCompletionArchivedFileOption[];
  documents: ProjectCompletionDocumentRecord[];
  approvalProofDocument: ProjectCompletionDocumentRecord | null;
  copyrightTransferDocument: ProjectCompletionDocumentRecord | null;
  invoiceDocument: ProjectCompletionDocumentRecord | null;
  archiveBlockers: string[];
};

export type RequestProjectCompletionDocumentUploadInput = {
  projectId: string;
  documentType: ProjectCompletionDocumentType;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
};

export type RequestProjectCompletionDocumentUploadResult = {
  uploadUrl: string;
  storageKey: string;
};

type ProjectCompletionProjectRecord = NonNullable<
  Awaited<ReturnType<typeof getProjectCompletionProject>>
>;

function formatCompletionExecutionTypeLabel(executionType: ProjectExecutionType | null) {
  if (!executionType) {
    return "Not configured";
  }

  return executionType === ProjectExecutionType.INTERNAL
    ? "Internal Execution"
    : "External Execution";
}

function isInternalCompletionProject(
  project: Pick<ProjectCompletionProjectRecord, "executionType">,
) {
  return project.executionType === ProjectExecutionType.INTERNAL;
}

function getInternalCompletionWorkflowData(completedAt = new Date()) {
  return {
    approvalRequired: false,
    approvalStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
    approvalContactUserId: null,
    approvalNote: null,
    approvalSelectedArchivedFileIds: [],
    approvalSelectedProjectFileIds: [],
    approvalRequestedAt: null,
    approvalCompletedAt: null,
    copyrightRequired: false,
    copyrightStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
    copyrightContactUserId: null,
    copyrightNote: null,
    copyrightRequestedAt: null,
    copyrightCompletedAt: null,
    invoiceRequired: false,
    invoiceStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
    invoiceContactUserId: null,
    invoiceNote: null,
    invoiceRequestedAt: null,
    invoiceCompletedAt: null,
    completedAt,
  };
}

function formatCompletionTimestamp(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompletionFileSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (fileSize >= 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${fileSize} B`;
}

function getCompletionFileTypeLabel(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName).toUpperCase();

  if (extension) {
    return extension;
  }

  const subtype = mimeType.split("/")[1];
  return subtype ? subtype.toUpperCase() : "FILE";
}

function getCompletionDocumentTypeLabel(type: ProjectCompletionDocumentType) {
  switch (type) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      return "Approval Proof";
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      return "Copyright Transfer";
    case ProjectCompletionDocumentType.INVOICE:
    default:
      return "Final Invoice";
  }
}

function getArchivedFileSourceLabel(file: {
  sourceRevisionId: string | null;
  sourceRevision: { revisionNumber: number } | null;
  sourceAttachment: {
    submissionReviewStatus: SubmissionReviewStatus | null;
  };
}) {
  if (file.sourceRevisionId) {
    return `Revision ${file.sourceRevision?.revisionNumber ?? "—"}`;
  }

  return file.sourceAttachment.submissionReviewStatus === SubmissionReviewStatus.APPROVED
    ? "Approved submission"
    : "Final archive";
}

type ProjectCompletionPermissionProject = {
  ownerId: string | null;
  coOwners?: Array<{ userId: string }>;
  executors: Array<{ userId: string }>;
  completionWorkflow?: {
    approvalContactUserId?: string | null;
    copyrightContactUserId?: string | null;
    invoiceContactUserId?: string | null;
  } | null;
};

function canViewCompletionWorkflow(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
) {
  return (
    hasProjectPermission(user, project, "completion.viewChecklist") ||
    project.completionWorkflow?.approvalContactUserId === user.id ||
    project.completionWorkflow?.copyrightContactUserId === user.id ||
    project.completionWorkflow?.invoiceContactUserId === user.id
  );
}

function canManageCompletionWorkflow(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
) {
  return hasProjectPermission(user, project, "completion.setApprovalRequired");
}

function canUploadApprovalProofForProject(
  workflow: ProjectCompletionProjectRecord["completionWorkflow"] | null,
  user: ProjectCompletionWorkflowUser,
) {
  return workflow?.approvalContactUserId === user.id;
}

function canUploadCopyrightDocumentForProject(
  workflow: ProjectCompletionProjectRecord["completionWorkflow"] | null,
  user: ProjectCompletionWorkflowUser,
) {
  return workflow?.copyrightContactUserId === user.id;
}

function canUploadInvoiceForProject(
  workflow: ProjectCompletionProjectRecord["completionWorkflow"] | null,
  user: ProjectCompletionWorkflowUser,
) {
  return workflow?.invoiceContactUserId === user.id;
}

function canAccessCompletionDocuments(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
) {
  return canViewCompletionWorkflow(project, user);
}

function requireCompletionProjectPermission(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
  permissionKey: PermissionKey,
  message: string,
) {
  if (!hasProjectPermission(user, project, permissionKey)) {
    throw new Error(message);
  }
}

function isCompletedProject(project: {
  status: Parameters<typeof isProjectStatusCompleted>[0];
  archive: { id: string; status: ArchiveRecordStatus } | null;
  archivedAt: Date | null;
  completedAt: Date | null;
}) {
  return Boolean(
    (project.archive && project.archive.status !== ArchiveRecordStatus.SAVED) ||
      project.archivedAt ||
      project.completedAt ||
      isProjectStatusCompleted(project.status),
  );
}

function areAllStagesCompleted(project: {
  stages?: Array<{ status: string }>;
}) {
  return (
    Boolean(project.stages && project.stages.length > 0) &&
    project.stages!.every((stage) => stage.status === "COMPLETED")
  );
}

function canUseFinalCompletionWorkflow(project: {
  status: Parameters<typeof isProjectStatusCompleted>[0];
  archive: { id: string; status: ArchiveRecordStatus } | null;
  archivedAt: Date | null;
  completedAt: Date | null;
  stages?: Array<{ status: string }>;
}) {
  return isCompletedProject(project) || areAllStagesCompleted(project);
}

export function isCompletionRequirementResolved(input: {
  required: boolean | null;
  status: ProjectCompletionStepStatus;
}) {
  if (input.status === ProjectCompletionStepStatus.NOT_REQUIRED) {
    return true;
  }

  if (input.required === false) {
    return true;
  }

  if (input.required === true) {
    return input.status === ProjectCompletionStepStatus.COMPLETED;
  }

  return false;
}

export function getFinalCompletionArchiveBlockers(input: {
  executionType: ProjectExecutionType | null;
  workflow:
    | {
        approvalRequired: boolean | null;
        approvalStatus: ProjectCompletionStepStatus;
        copyrightRequired: boolean | null;
        copyrightStatus: ProjectCompletionStepStatus;
        invoiceRequired: boolean | null;
        invoiceStatus: ProjectCompletionStepStatus;
      }
    | null
    | undefined;
}) {
  if (input.executionType === ProjectExecutionType.INTERNAL) {
    return [];
  }

  const workflow = input.workflow;

  if (!workflow) {
    return ["Final completion checklist must be configured before archive."];
  }

  const blockers: string[] = [];
  const approvalResolved = isCompletionRequirementResolved({
    required: workflow.approvalRequired,
    status: workflow.approvalStatus,
  });
  const copyrightResolved = isCompletionRequirementResolved({
    required: workflow.copyrightRequired,
    status: workflow.copyrightStatus,
  });
  const invoiceResolved = isCompletionRequirementResolved({
    required: workflow.invoiceRequired,
    status: workflow.invoiceStatus,
  });

  if (!approvalResolved) {
    if (workflow.approvalRequired === null) {
      blockers.push("Approval requirement must be confirmed.");
    } else {
      blockers.push("Approval is required and still pending.");
    }
  }

  if (!copyrightResolved) {
    if (workflow.copyrightRequired === null) {
      blockers.push("Copyright transfer requirement must be confirmed.");
    } else {
      blockers.push("Copyright transfer is required and still pending.");
    }
  }

  if (!invoiceResolved) {
    if (workflow.invoiceRequired === null) {
      blockers.push("Final invoice requirement must be confirmed.");
    } else {
      blockers.push("Final invoice is required and still pending.");
    }
  }

  return blockers;
}

function getNextInvoiceStatus(currentStatus: ProjectCompletionStepStatus) {
  if (
    currentStatus === ProjectCompletionStepStatus.COMPLETED ||
    currentStatus === ProjectCompletionStepStatus.NOT_REQUIRED ||
    currentStatus === ProjectCompletionStepStatus.PENDING
  ) {
    return currentStatus;
  }

  return ProjectCompletionStepStatus.NOT_STARTED;
}

function getWorkflowCompletedAtValue(input: {
  approvalRequired: boolean | null;
  approvalStatus: ProjectCompletionStepStatus;
  copyrightRequired: boolean | null;
  copyrightStatus: ProjectCompletionStepStatus;
  invoiceRequired: boolean | null;
  invoiceStatus: ProjectCompletionStepStatus;
}) {
  return isCompletionRequirementResolved({
    required: input.approvalRequired,
    status: input.approvalStatus,
  }) &&
    isCompletionRequirementResolved({
      required: input.copyrightRequired,
      status: input.copyrightStatus,
    }) &&
    isCompletionRequirementResolved({
      required: input.invoiceRequired,
      status: input.invoiceStatus,
    })
    ? new Date()
    : null;
}

function ensureRequirementChangeAllowed(
  stepLabel: string,
  currentRequired: boolean | null,
  currentStatus: ProjectCompletionStepStatus,
  nextRequired: boolean,
) {
  if (currentRequired === nextRequired) {
    return currentStatus;
  }

  if (currentStatus === ProjectCompletionStepStatus.COMPLETED) {
    throw new Error(`${stepLabel} has already been completed and can no longer be changed.`);
  }

  if (currentStatus === ProjectCompletionStepStatus.PENDING) {
    throw new Error(`${stepLabel} is already in progress and cannot be changed now.`);
  }

  return nextRequired
    ? ProjectCompletionStepStatus.NOT_STARTED
    : ProjectCompletionStepStatus.NOT_REQUIRED;
}

function compareProjectCompletionExecutors(
  left: ProjectCompletionProjectRecord["executors"][number],
  right: ProjectCompletionProjectRecord["executors"][number],
) {
  return getUserDisplayName(left.user).localeCompare(
    getUserDisplayName(right.user),
    undefined,
    { sensitivity: "base" },
  );
}

function mapContactOptions(project: ProjectCompletionProjectRecord) {
  const contactMap = new Map<string, ProjectCompletionContactOption>();

  const addContact = (
    user: { id: string; name: string | null; email: string },
    roleLabel: string,
  ) => {
    if (!contactMap.has(user.id)) {
      contactMap.set(user.id, {
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
        roleLabel,
      });
    }
  };

  if (project.owner) {
    addContact(project.owner, "Project Owner");
  }

  for (const coOwner of project.coOwners) {
    addContact(coOwner.user, "Project Co-Owner");
  }

  for (const executor of [...project.executors].sort(compareProjectCompletionExecutors)) {
    addContact(executor.user, "Executor");
  }

  const sortedCollaborators = [...project.collaborators].sort((left, right) =>
    getUserDisplayName(left.user).localeCompare(
      getUserDisplayName(right.user),
      undefined,
      { sensitivity: "base" },
    ),
  );

  for (const collaborator of sortedCollaborators) {
    addContact(collaborator.user, "Collaborator");
  }

  return Array.from(contactMap.values());
}

function mapArchivedFileOption(
  file: NonNullable<ProjectCompletionProjectRecord["archive"]>["files"][number],
) {
  return {
    id: file.id,
    sourceAttachmentId: file.sourceAttachmentId,
    finalArchiveFileName: file.finalArchiveFileName,
    originalFileName: file.originalFileName,
    fileTypeLabel: getCompletionFileTypeLabel(file.finalArchiveFileName, file.mimeType),
    mimeType: file.mimeType,
    fileSizeLabel: formatCompletionFileSize(file.fileSize),
    sourceLabel: getArchivedFileSourceLabel(file),
    previewPath: `/api/archives/files/${file.id}/preview`,
    downloadPath: `/api/archives/files/${file.id}/download`,
  } satisfies ProjectCompletionArchivedFileOption;
}

async function getPreArchiveFinalFileOptions(project: ProjectCompletionProjectRecord) {
  const finalStage = project.stages.at(-1) ?? null;

  if (!finalStage) {
    return [];
  }

  const latestApprovedRevision = await withPrismaRetry(() =>
    prisma.projectRevision.findFirst({
      where: {
        projectId: project.id,
        stageId: finalStage.id,
        status: ProjectRevisionStatus.APPROVED,
      },
      orderBy: [
        {
          reviewedAt: "desc",
        },
        {
          revisionNumber: "desc",
        },
      ],
      select: {
        id: true,
        revisionNumber: true,
      },
    }),
  );

  const [revisionAttachments, stageSubmissions] = await withPrismaRetry(() =>
    Promise.all([
      latestApprovedRevision
        ? prisma.projectAttachment.findMany({
            where: {
              projectId: project.id,
              stageId: finalStage.id,
              revisionId: latestApprovedRevision.id,
              assetType: AttachmentAssetType.REVISION_ORIGINAL,
              status: AttachmentStatus.READY,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              revisionId: true,
              originalFileName: true,
              mimeType: true,
              fileSize: true,
            },
          })
        : Promise.resolve([]),
      prisma.projectAttachment.findMany({
        where: {
          projectId: project.id,
          stageId: finalStage.id,
          assetType: AttachmentAssetType.STAGE_SUBMISSION,
          status: AttachmentStatus.READY,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          revisionId: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
          submissionReviewStatus: true,
        },
      }),
    ]),
  );

  const submissionNumberById = new Map(
    stageSubmissions.map((attachment, index) => [attachment.id, index + 1] as const),
  );
  const approvedStageSubmissions = stageSubmissions
    .filter(
      (attachment) =>
        attachment.submissionReviewStatus === SubmissionReviewStatus.APPROVED &&
        (!latestApprovedRevision ||
          attachment.revisionId === latestApprovedRevision.id ||
          attachment.revisionId === null),
    )
    .map((attachment) => ({
      id: attachment.id,
      sourceAttachmentId: attachment.id,
      finalArchiveFileName: attachment.originalFileName,
      originalFileName: attachment.originalFileName,
      fileTypeLabel: getCompletionFileTypeLabel(attachment.originalFileName, attachment.mimeType),
      mimeType: attachment.mimeType,
      fileSizeLabel: formatCompletionFileSize(attachment.fileSize),
      sourceLabel: `Submission ${submissionNumberById.get(attachment.id) ?? "—"}`,
      previewPath: `/api/project-assets/${attachment.id}/preview`,
      downloadPath: `/api/project-assets/${attachment.id}/download`,
    } satisfies ProjectCompletionArchivedFileOption));
  const approvedRevisionAttachments = revisionAttachments.map((attachment) => ({
    id: attachment.id,
    sourceAttachmentId: attachment.id,
    finalArchiveFileName: attachment.originalFileName,
    originalFileName: attachment.originalFileName,
    fileTypeLabel: getCompletionFileTypeLabel(attachment.originalFileName, attachment.mimeType),
    mimeType: attachment.mimeType,
    fileSizeLabel: formatCompletionFileSize(attachment.fileSize),
    sourceLabel: latestApprovedRevision
      ? `Revision ${latestApprovedRevision.revisionNumber}`
      : "Approved revision",
    previewPath: `/api/project-assets/${attachment.id}/preview`,
    downloadPath: `/api/project-assets/${attachment.id}/download`,
  } satisfies ProjectCompletionArchivedFileOption));

  return [...approvedRevisionAttachments, ...approvedStageSubmissions];
}

function mapDocumentRecord(
  document: NonNullable<ProjectCompletionProjectRecord["completionWorkflow"]>["documents"][number],
) {
  return {
    id: document.id,
    type: document.type,
    typeLabel: getCompletionDocumentTypeLabel(document.type),
    originalFileName: document.originalFileName,
    archiveFileName: document.archiveFileName,
    mimeType: document.mimeType,
    fileTypeLabel: getCompletionFileTypeLabel(document.archiveFileName, document.mimeType),
    fileSizeLabel: formatCompletionFileSize(document.fileSize),
    uploadedAt: formatCompletionTimestamp(document.uploadedAt) ?? "—",
    uploadedBy: getUserDisplayName(document.uploadedBy),
    previewPath: `/api/project-completion-documents/${document.id}/preview`,
    downloadPath: `/api/project-completion-documents/${document.id}/download`,
  } satisfies ProjectCompletionDocumentRecord;
}

async function getProjectCompletionProject(projectId: string) {
  return withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        name: true,
        category: true,
        executionType: true,
        status: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            group: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                isActive: true,
              },
            },
          },
        },
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        coOwners: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        executors: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        archivedAt: true,
        completedAt: true,
        stages: {
          where: { isTasker: false },
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            name: true,
            status: true,
            order: true,
          },
        },
        collaborators: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        archive: {
          select: {
            id: true,
            status: true,
            files: {
              orderBy: [
                {
                  archivedAt: "desc",
                },
                {
                  finalArchiveFileName: "asc",
                },
              ],
              select: {
                id: true,
                sourceAttachmentId: true,
                finalArchiveFileName: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                archivedAt: true,
                sourceRevisionId: true,
                sourceRevision: {
                  select: {
                    revisionNumber: true,
                  },
                },
                sourceAttachment: {
                  select: {
                    submissionReviewStatus: true,
                  },
                },
              },
            },
          },
        },
        completionWorkflow: {
          select: {
            id: true,
            approvalRequired: true,
            approvalStatus: true,
            approvalContactUserId: true,
            approvalContactUser: {
              select: {
                name: true,
                email: true,
              },
            },
            approvalNote: true,
            approvalSelectedArchivedFileIds: true,
            approvalSelectedProjectFileIds: true,
            approvalRequestedAt: true,
            approvalCompletedAt: true,
            copyrightRequired: true,
            copyrightStatus: true,
            copyrightContactUserId: true,
            copyrightContactUser: {
              select: {
                name: true,
                email: true,
              },
            },
            copyrightNote: true,
            copyrightRequestedAt: true,
            copyrightCompletedAt: true,
            invoiceRequired: true,
            invoiceStatus: true,
            invoiceContactUserId: true,
            invoiceContactUser: {
              select: {
                name: true,
                email: true,
              },
            },
            invoiceNote: true,
            invoiceRequestedAt: true,
            invoiceCompletedAt: true,
            completedAt: true,
            documents: {
              orderBy: [
                {
                  uploadedAt: "desc",
                },
                {
                  type: "asc",
                },
              ],
              select: {
                id: true,
                type: true,
                originalFileName: true,
                archiveFileName: true,
                mimeType: true,
                fileSize: true,
                bucket: true,
                storageKey: true,
                uploadedAt: true,
                uploadedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  );
}

async function ensureProjectCompletionViewAccess(
  user: ProjectCompletionWorkflowUser,
  projectId: string,
) {
  await assertProjectAccess(user, projectId);

  const project = await getProjectCompletionProject(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!canUseFinalCompletionWorkflow(project)) {
    return null;
  }

  if (!canViewCompletionWorkflow(project, user)) {
    return null;
  }

  return project;
}

async function ensureProjectCompletionManageAccess(
  user: ProjectCompletionWorkflowUser,
  projectId: string,
) {
  await assertProjectAccess(user, projectId);

  const project = await getProjectCompletionProject(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!canUseFinalCompletionWorkflow(project)) {
    throw new Error(
      "Complete the final stage before using the final completion checklist.",
    );
  }

  if (!canManageCompletionWorkflow(project, user)) {
    throw new Error("Only the project owner or an admin can manage the completion checklist.");
  }

  return project;
}

async function ensureProjectCompletionDocumentAccess(
  user: ProjectCompletionWorkflowUser,
  documentId: string,
) {
  const document = await withPrismaRetry(() =>
    prisma.projectCompletionDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        projectId: true,
        archiveFileName: true,
        mimeType: true,
        bucket: true,
        storageKey: true,
        uploadedAt: true,
        project: {
          select: {
            ownerId: true,
            coOwners: {
              select: { userId: true },
            },
            executors: {
              select: {
                userId: true,
              },
            },
            completionWorkflow: {
              select: {
                approvalContactUserId: true,
                copyrightContactUserId: true,
                invoiceContactUserId: true,
              },
            },
          },
        },
      },
    }),
  );

  if (!document) {
    throw new Error("Completion document not found.");
  }

  await assertProjectAccess(user, document.projectId);

  if (!canAccessCompletionDocuments(document.project, user)) {
    throw new Error("You do not have access to this completion document.");
  }

  if (!hasProjectPermission(user, document.project, "completion.viewChecklist")) {
    await assertProjectTimestampVisibleForUser(user, {
      projectId: document.projectId,
      projectOwnerId: document.project.ownerId ?? "",
      timestamp: document.uploadedAt,
      message: "You do not have access to this completion document.",
    });
  }

  return document;
}

async function ensureWorkflowExists(projectId: string) {
  return withPrismaRetry(() =>
    prisma.projectCompletionWorkflow.upsert({
      where: {
        projectId,
      },
      update: {},
      create: {
        projectId,
      },
      select: {
        id: true,
      },
    }),
  );
}

async function ensureWorkflowExistsTx(tx: Prisma.TransactionClient, projectId: string) {
  return tx.projectCompletionWorkflow.upsert({
    where: {
      projectId,
    },
    update: {},
    create: {
      projectId,
    },
    select: {
      id: true,
      approvalRequired: true,
      approvalStatus: true,
      approvalSelectedArchivedFileIds: true,
      approvalSelectedProjectFileIds: true,
      approvalContactUserId: true,
      copyrightRequired: true,
      copyrightStatus: true,
      copyrightContactUserId: true,
      invoiceRequired: true,
      invoiceStatus: true,
      invoiceContactUserId: true,
    },
  });
}

async function mapWorkflowRecord(
  project: ProjectCompletionProjectRecord,
  user: ProjectCompletionWorkflowUser,
) {
  if (!project.completionWorkflow) {
    throw new Error("Project completion workflow is not available yet.");
  }

  const finalArchivedFiles =
    project.archive?.files.map(mapArchivedFileOption) ??
    (await getPreArchiveFinalFileOptions(project));
  const approvalSelectedProjectFileIdSet = new Set(
    project.completionWorkflow.approvalSelectedProjectFileIds,
  );
  const approvalSelectedArchivedFileIdSet = new Set(
    project.completionWorkflow.approvalSelectedArchivedFileIds,
  );
  const approvalSelectedFiles = project.archive
    ? approvalSelectedProjectFileIdSet.size > 0
      ? finalArchivedFiles.filter((file) =>
          approvalSelectedProjectFileIdSet.has(file.sourceAttachmentId),
        )
      : finalArchivedFiles.filter((file) => approvalSelectedArchivedFileIdSet.has(file.id))
    : finalArchivedFiles.filter((file) => approvalSelectedProjectFileIdSet.has(file.id));
  const documents = project.completionWorkflow.documents.map(mapDocumentRecord);
  const documentByType = new Map(documents.map((document) => [document.type, document] as const));
  const isInternalExecution = isInternalCompletionProject(project);
  const approvalRequired = isInternalExecution
    ? false
    : project.completionWorkflow.approvalRequired;
  const approvalStatus = isInternalExecution
    ? ProjectCompletionStepStatus.NOT_REQUIRED
    : project.completionWorkflow.approvalStatus;
  const approvalSelectedArchivedFileIds = isInternalExecution
    ? []
    : project.completionWorkflow.approvalSelectedArchivedFileIds;
  const approvalSelectedProjectFileIds = isInternalExecution
    ? []
    : project.completionWorkflow.approvalSelectedProjectFileIds;
  const copyrightRequired = isInternalExecution
    ? false
    : project.completionWorkflow.copyrightRequired;
  const copyrightStatus = isInternalExecution
    ? ProjectCompletionStepStatus.NOT_REQUIRED
    : project.completionWorkflow.copyrightStatus;
  const invoiceStatus = isInternalExecution
    ? ProjectCompletionStepStatus.NOT_REQUIRED
    : project.completionWorkflow.invoiceStatus;
  const invoiceRequired = isInternalExecution
    ? false
    : project.completionWorkflow.invoiceRequired;
  const isApprovalResolved = isCompletionRequirementResolved({
    required: approvalRequired,
    status: approvalStatus,
  });
  const isCopyrightResolved = isCompletionRequirementResolved({
    required: copyrightRequired,
    status: copyrightStatus,
  });
  const archiveBlockers = getFinalCompletionArchiveBlockers({
    executionType: project.executionType,
    workflow: project.completionWorkflow,
  });

  return {
    workflowId: project.completionWorkflow.id,
    projectId: project.id,
    executionType: project.executionType,
    executionTypeLabel: formatCompletionExecutionTypeLabel(project.executionType),
    isInternalExecution,
    canManage: canManageCompletionWorkflow(project, user),
    canUploadApprovalProof: isInternalExecution
      ? false
      : canUploadApprovalProofForProject(project.completionWorkflow, user),
    canUploadCopyrightDocument: isInternalExecution
      ? false
      : canUploadCopyrightDocumentForProject(project.completionWorkflow, user),
    canUploadInvoice: isInternalExecution
      ? false
      : canUploadInvoiceForProject(project.completionWorkflow, user),
    needsInitialConfiguration:
      !isInternalExecution &&
      (project.completionWorkflow.approvalRequired === null ||
        project.completionWorkflow.copyrightRequired === null ||
        project.completionWorkflow.invoiceRequired === null),
    approvalRequired,
    approvalStatus,
    approvalContactUserId: project.completionWorkflow.approvalContactUserId ?? null,
    approvalContactName: project.completionWorkflow.approvalContactUser
      ? getUserDisplayName(project.completionWorkflow.approvalContactUser)
      : null,
    approvalNote: project.completionWorkflow.approvalNote ?? null,
    approvalRequestedAt: formatCompletionTimestamp(
      project.completionWorkflow.approvalRequestedAt,
    ),
    approvalCompletedAt: formatCompletionTimestamp(
      project.completionWorkflow.approvalCompletedAt,
    ),
    approvalSelectedArchivedFileIds,
    approvalSelectedProjectFileIds,
    copyrightRequired,
    copyrightStatus,
    copyrightContactUserId: project.completionWorkflow.copyrightContactUserId ?? null,
    copyrightContactName: project.completionWorkflow.copyrightContactUser
      ? getUserDisplayName(project.completionWorkflow.copyrightContactUser)
      : null,
    copyrightNote: project.completionWorkflow.copyrightNote ?? null,
    copyrightRequestedAt: formatCompletionTimestamp(
      project.completionWorkflow.copyrightRequestedAt,
    ),
    copyrightCompletedAt: formatCompletionTimestamp(
      project.completionWorkflow.copyrightCompletedAt,
    ),
    invoiceRequired,
    invoiceStatus,
    invoiceContactUserId: project.completionWorkflow.invoiceContactUserId ?? null,
    invoiceContactName: project.completionWorkflow.invoiceContactUser
      ? getUserDisplayName(project.completionWorkflow.invoiceContactUser)
      : null,
    invoiceNote: project.completionWorkflow.invoiceNote ?? null,
    invoiceRequestedAt: formatCompletionTimestamp(
      project.completionWorkflow.invoiceRequestedAt,
    ),
    invoiceCompletedAt: formatCompletionTimestamp(project.completionWorkflow.invoiceCompletedAt),
    completedAt: formatCompletionTimestamp(project.completionWorkflow.completedAt),
    isApprovalResolved,
    isCopyrightUnlocked: isApprovalResolved,
    isCopyrightResolved,
    isInvoiceUnlocked:
      isInternalExecution ||
      (isApprovalResolved && isCopyrightResolved),
    availableContacts: mapContactOptions(project),
    finalArchivedFiles,
    approvalSelectedFiles: isInternalExecution ? [] : approvalSelectedFiles,
    documents,
    approvalProofDocument:
      documentByType.get(ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF) ?? null,
    copyrightTransferDocument:
      documentByType.get(ProjectCompletionDocumentType.COPYRIGHT_TRANSFER) ?? null,
    invoiceDocument: documentByType.get(ProjectCompletionDocumentType.INVOICE) ?? null,
    archiveBlockers,
  } satisfies ProjectCompletionWorkflowRecord;
}

async function filterCompletionProjectForVisibility(
  project: ProjectCompletionProjectRecord,
  user: ProjectCompletionWorkflowUser,
): Promise<ProjectCompletionProjectRecord> {
  if (
    canBypassCollaboratorVisibility(user, project.ownerId ?? "") ||
    hasProjectPermission(user, project, "completion.viewChecklist")
  ) {
    return project;
  }

  const visibilityState = await getProjectCollaboratorVisibilityState(
    project.id,
    user.id,
  );

  if (!visibilityState) {
    return project;
  }

  const hideAllVisibleFiles =
    visibilityState.chatVisibilityPaused &&
    visibilityState.visibilityPauses.length === 0;

  if (!hideAllVisibleFiles && visibilityState.visibilityPauses.length === 0) {
    return project;
  }

  const visibleArchiveFiles =
    project.archive?.files.filter((file) => {
      if (hideAllVisibleFiles) {
        return false;
      }

      return !isTimestampHiddenByPauseWindows(
        file.archivedAt,
        visibilityState.visibilityPauses,
      );
    }) ?? [];
  const visibleArchiveFileIds = new Set(visibleArchiveFiles.map((file) => file.id));
  const visibleDocuments =
    project.completionWorkflow?.documents.filter((document) => {
      if (hideAllVisibleFiles) {
        return false;
      }

      return !isTimestampHiddenByPauseWindows(
        document.uploadedAt,
        visibilityState.visibilityPauses,
      );
    }) ?? [];

  return {
    ...project,
    archive: project.archive
      ? {
          ...project.archive,
          files: visibleArchiveFiles,
        }
      : null,
    completionWorkflow: project.completionWorkflow
      ? {
          ...project.completionWorkflow,
          approvalSelectedArchivedFileIds:
            project.completionWorkflow.approvalSelectedArchivedFileIds.filter(
              (fileId) => visibleArchiveFileIds.has(fileId),
            ),
          documents: visibleDocuments,
        }
      : null,
  };
}

function validateContactSelection(
  contactOptions: ProjectCompletionContactOption[],
  contactUserId: string,
  label: string,
) {
  const selectedContact = contactOptions.find((contact) => contact.id === contactUserId);

  if (!selectedContact) {
    throw new Error(`Select a valid ${label} contact before continuing.`);
  }

  return selectedContact;
}

function buildCompletionDocumentStoragePrefix(
  projectId: string,
  documentType: ProjectCompletionDocumentType,
) {
  const placeholder = "__placeholder__";

  return buildProjectCompletionDocumentKey({
    projectId,
    documentType,
    safeFileName: placeholder,
  }).replace(placeholder, "");
}

export async function getProjectCompletionWorkflowForUser(
  user: ProjectCompletionWorkflowUser,
  projectId: string,
) {
  const project = await ensureProjectCompletionViewAccess(user, projectId);

  if (!project) {
    return null;
  }

  if (!project.completionWorkflow) {
    await ensureWorkflowExists(projectId);
    const refreshedProject = await getProjectCompletionProject(projectId);

    if (!refreshedProject?.completionWorkflow) {
      throw new Error("Unable to load the project completion workflow.");
    }

    return await mapWorkflowRecord(
      await filterCompletionProjectForVisibility(refreshedProject, user),
      user,
    );
  }

  return await mapWorkflowRecord(await filterCompletionProjectForVisibility(project, user), user);
}

export async function configureProjectCompletionWorkflow(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    approvalRequired: boolean;
    copyrightRequired: boolean;
    invoiceRequired: boolean;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);
  requireCompletionProjectPermission(
    project,
    user,
    "completion.setApprovalRequired",
    "You do not have permission to configure authority approval requirements.",
  );
  requireCompletionProjectPermission(
    project,
    user,
    "completion.setCopyrightRequired",
    "You do not have permission to configure copyright transfer requirements.",
  );

  if (isInternalCompletionProject(project)) {
    await withPrismaRetry(() =>
      prisma.$transaction(async (tx) => {
        await ensureWorkflowExistsTx(tx, project.id);
        await tx.projectCompletionWorkflow.update({
          where: {
            projectId: project.id,
          },
          data: getInternalCompletionWorkflowData(),
        });
      }),
    );

    const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

    if (!workflow) {
      throw new Error("Unable to load the updated project completion workflow.");
    }

    return workflow;
  }

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);
      const nextApprovalStatus = ensureRequirementChangeAllowed(
        "Authority approval",
        workflow.approvalRequired,
        workflow.approvalStatus,
        input.approvalRequired,
      );
      const nextCopyrightStatus = ensureRequirementChangeAllowed(
        "Copyright transfer",
        workflow.copyrightRequired,
        workflow.copyrightStatus,
        input.copyrightRequired,
      );
      const nextInvoiceStatus = getNextInvoiceStatus(
        ensureRequirementChangeAllowed(
          "Final invoice",
          workflow.invoiceRequired,
          workflow.invoiceStatus,
          input.invoiceRequired,
        ),
      );
      const completedAt = getWorkflowCompletedAtValue({
        approvalRequired: input.approvalRequired,
        approvalStatus: nextApprovalStatus,
        copyrightRequired: input.copyrightRequired,
        copyrightStatus: nextCopyrightStatus,
        invoiceRequired: input.invoiceRequired,
        invoiceStatus: nextInvoiceStatus,
      });

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          approvalRequired: input.approvalRequired,
          approvalStatus: nextApprovalStatus,
          approvalContactUserId:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          approvalNote:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          approvalSelectedArchivedFileIds:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? [] : undefined,
          approvalSelectedProjectFileIds:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? [] : undefined,
          approvalRequestedAt:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          approvalCompletedAt:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightRequired: input.copyrightRequired,
          copyrightStatus: nextCopyrightStatus,
          copyrightContactUserId:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightNote:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightRequestedAt:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightCompletedAt:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          invoiceRequired: input.invoiceRequired,
          invoiceStatus: nextInvoiceStatus,
          invoiceContactUserId:
            nextInvoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          invoiceNote:
            nextInvoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          invoiceRequestedAt:
            nextInvoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          invoiceCompletedAt:
            nextInvoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          completedAt,
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function prepareAuthorityApprovalRequest(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    selectedProjectFileIds: string[];
    note?: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);
  requireCompletionProjectPermission(
    project,
    user,
    "completion.prepareApproval",
    "You do not have permission to prepare authority approval requests.",
  );

  if (isInternalCompletionProject(project)) {
    throw new Error("Authority approval is not required for internal execution.");
  }

  const contactOptions = mapContactOptions(project);
  validateContactSelection(contactOptions, input.contactUserId, "approval");
  const finalApprovalFiles = await getPreArchiveFinalFileOptions(project);

  const selectedFileIds = Array.from(
    new Set(input.selectedProjectFileIds.map((value) => value.trim()).filter(Boolean)),
  );

  if (selectedFileIds.length === 0) {
    throw new Error("Select at least one final file for authority approval.");
  }

  const validFinalFileIds = new Set(finalApprovalFiles.map((file) => file.id));

  if (selectedFileIds.some((fileId) => !validFinalFileIds.has(fileId))) {
    throw new Error("One or more selected final files are no longer available.");
  }

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);

      if (workflow.approvalRequired === null) {
        throw new Error("Set the project completion checklist requirements first.");
      }

      if (!workflow.approvalRequired) {
        throw new Error("Authority approval is marked as not required for this project.");
      }

      if (workflow.approvalStatus === ProjectCompletionStepStatus.COMPLETED) {
        throw new Error("Authority approval has already been completed.");
      }

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          approvalStatus: ProjectCompletionStepStatus.PENDING,
          approvalContactUserId: input.contactUserId,
          approvalNote: sanitizeRichText(input.note) || null,
          approvalSelectedProjectFileIds: selectedFileIds,
          approvalSelectedArchivedFileIds: [],
          approvalRequestedAt: new Date(),
          approvalCompletedAt: null,
          invoiceStatus: getNextInvoiceStatus(workflow.invoiceStatus),
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function prepareCopyrightTransferRequest(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    note?: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);
  requireCompletionProjectPermission(
    project,
    user,
    "completion.prepareCopyrightTransfer",
    "You do not have permission to prepare copyright transfer requests.",
  );

  if (isInternalCompletionProject(project)) {
    throw new Error("Copyright transfer is not required for internal execution.");
  }

  const contactOptions = mapContactOptions(project);
  validateContactSelection(contactOptions, input.contactUserId, "copyright");

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);

      if (
        !isCompletionRequirementResolved({
          required: workflow.approvalRequired,
          status: workflow.approvalStatus,
        })
      ) {
        throw new Error(
          "Complete or mark authority approval as not required before preparing copyright transfer.",
        );
      }

      if (workflow.copyrightRequired === null) {
        throw new Error("Set the project completion checklist requirements first.");
      }

      if (!workflow.copyrightRequired) {
        throw new Error("Copyright transfer is marked as not required for this project.");
      }

      if (workflow.copyrightStatus === ProjectCompletionStepStatus.COMPLETED) {
        throw new Error("Copyright transfer has already been completed.");
      }

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          copyrightStatus: ProjectCompletionStepStatus.PENDING,
          copyrightContactUserId: input.contactUserId,
          copyrightNote: sanitizeRichText(input.note) || null,
          copyrightRequestedAt: new Date(),
          copyrightCompletedAt: null,
          invoiceStatus: getNextInvoiceStatus(workflow.invoiceStatus),
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function requestProjectFinalInvoice(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    note?: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);

  if (isInternalCompletionProject(project)) {
    throw new Error("Final invoice is not required for internal execution.");
  }

  const contactOptions = mapContactOptions(project);
  validateContactSelection(contactOptions, input.contactUserId, "invoice");

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);

      if (
        !isCompletionRequirementResolved({
          required: workflow.approvalRequired,
          status: workflow.approvalStatus,
        }) ||
        !isCompletionRequirementResolved({
          required: workflow.copyrightRequired,
          status: workflow.copyrightStatus,
        })
      ) {
        throw new Error(
          "Complete or skip authority approval and copyright transfer before requesting the final invoice.",
        );
      }

      if (workflow.invoiceRequired === null) {
        throw new Error("Set the project completion checklist requirements first.");
      }

      if (!workflow.invoiceRequired) {
        throw new Error("Final invoice is marked as not required for this project.");
      }

      if (workflow.invoiceStatus === ProjectCompletionStepStatus.COMPLETED) {
        throw new Error("Final invoice has already been completed.");
      }

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          invoiceStatus: ProjectCompletionStepStatus.PENDING,
          invoiceContactUserId: input.contactUserId,
          invoiceNote: sanitizeRichText(input.note) || null,
          invoiceRequestedAt: new Date(),
          invoiceCompletedAt: null,
          completedAt: null,
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function markProjectInvoiceNotRequired(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);

  if (isInternalCompletionProject(project)) {
    await withPrismaRetry(() =>
      prisma.$transaction(async (tx) => {
        await ensureWorkflowExistsTx(tx, project.id);
        await tx.projectCompletionWorkflow.update({
          where: {
            projectId: project.id,
          },
          data: getInternalCompletionWorkflowData(),
        });
      }),
    );

    const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

    if (!workflow) {
      throw new Error("Unable to load the updated project completion workflow.");
    }

    return workflow;
  }

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);

      if (
        !isCompletionRequirementResolved({
          required: workflow.approvalRequired,
          status: workflow.approvalStatus,
        }) ||
        !isCompletionRequirementResolved({
          required: workflow.copyrightRequired,
          status: workflow.copyrightStatus,
        })
      ) {
        throw new Error(
          "Complete or skip authority approval and copyright transfer before marking final invoice as not required.",
        );
      }

      if (workflow.invoiceStatus === ProjectCompletionStepStatus.COMPLETED) {
        throw new Error("Final invoice has already been completed.");
      }

      if (workflow.invoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED) {
        return;
      }

      const invoiceDocument = await tx.projectCompletionDocument.findUnique({
        where: {
          workflowId_type: {
            workflowId: workflow.id,
            type: ProjectCompletionDocumentType.INVOICE,
          },
        },
        select: {
          id: true,
        },
      });

      if (invoiceDocument) {
        throw new Error("A final invoice document has already been uploaded.");
      }

      const completedAt = new Date();

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          invoiceRequired: false,
          invoiceStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
          invoiceContactUserId: null,
          invoiceNote: null,
          invoiceRequestedAt: null,
          invoiceCompletedAt: null,
          completedAt,
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function requestProjectCompletionDocumentUpload(
  user: ProjectCompletionWorkflowUser,
  input: RequestProjectCompletionDocumentUploadInput,
): Promise<RequestProjectCompletionDocumentUploadResult> {
  if (!input.originalFileName.trim()) {
    throw new Error("A completion document file name is required.");
  }

  if (!input.mimeType.trim()) {
    throw new Error("A valid completion document MIME type is required.");
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    throw new Error("A valid completion document file size is required.");
  }

  if (input.fileSize > getMaxAssetUploadBytes()) {
    throw new Error("The selected file exceeds the upload size limit.");
  }

  if (!isAllowedProjectCompletionDocument(input.originalFileName, input.mimeType)) {
    throw new UploadFileTypeError(
      buildFileTypeNotAllowedPayload({
        fileName: input.originalFileName,
        mimeType: input.mimeType,
        allowedExtensions: COMPLETION_DOCUMENT_ALLOWED_EXTENSIONS,
        error: "Completion document file type is not allowed.",
      }),
    );
  }

  const project = await ensureProjectCompletionViewAccess(user, input.projectId);

  if (!project) {
    throw new Error("You do not have access to this completion workflow.");
  }

  if (isInternalCompletionProject(project)) {
    throw new Error("Completion documents are not required for internal execution.");
  }

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("You do not have access to this completion workflow.");
  }

  switch (input.documentType) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      if (!workflow.canUploadApprovalProof) {
        throw new Error("Only the selected approval contact can upload authority approval proof.");
      }

      if (workflow.approvalStatus !== ProjectCompletionStepStatus.PENDING) {
        throw new Error("Prepare the authority approval request before uploading proof.");
      }
      break;
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      if (!workflow.canUploadCopyrightDocument) {
        throw new Error("Only the selected copyright contact can upload copyright transfer documents.");
      }

      if (!workflow.isApprovalResolved) {
        throw new Error(
          "Complete authority approval before uploading the signed copyright transfer document.",
        );
      }

      if (workflow.copyrightStatus !== ProjectCompletionStepStatus.PENDING) {
        throw new Error("Prepare the copyright transfer request before uploading the signed document.");
      }
      break;
    case ProjectCompletionDocumentType.INVOICE:
      if (!workflow.canUploadInvoice) {
        throw new Error("Only the selected final invoice recipient can upload the final invoice.");
      }

      if (!workflow.isInvoiceUnlocked) {
        throw new Error(
          "Complete or skip authority approval and copyright transfer before uploading the final invoice.",
        );
      }

      if (workflow.invoiceStatus !== ProjectCompletionStepStatus.PENDING) {
        throw new Error("Final invoice must be requested before upload.");
      }
      break;
  }

  const safeFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(
    input.originalFileName,
  )}`;
  const storageKey = buildProjectCompletionDocumentKey({
    projectId: input.projectId,
    documentType: input.documentType,
    safeFileName,
  });
  const uploadUrl = await createPresignedUploadUrl({
    storageKey,
    mimeType: input.mimeType,
  });

  return {
    uploadUrl,
    storageKey,
  };
}

export async function finalizeProjectCompletionDocumentUpload(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    documentType: ProjectCompletionDocumentType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
    failed?: boolean;
  },
) {
  if (input.failed) {
    return;
  }

  if (!isAllowedProjectCompletionDocument(input.originalFileName, input.mimeType)) {
    throw new UploadFileTypeError(
      buildFileTypeNotAllowedPayload({
        fileName: input.originalFileName,
        mimeType: input.mimeType,
        allowedExtensions: COMPLETION_DOCUMENT_ALLOWED_EXTENSIONS,
        error: "Completion document file type is not allowed.",
      }),
    );
  }

  const expectedPrefix = buildCompletionDocumentStoragePrefix(
    input.projectId,
    input.documentType,
  );

  if (!input.storageKey.startsWith(expectedPrefix)) {
    throw new Error("Completion document storage key is invalid.");
  }

  await assertProjectAccess(user, input.projectId);

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          id: true,
          ownerId: true,
          coOwners: {
            select: { userId: true },
          },
          executors: {
            select: {
              userId: true,
            },
          },
          executionType: true,
          status: {
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  color: true,
                  isActive: true,
                },
              },
            },
          },
          archivedAt: true,
          completedAt: true,
          archive: {
            select: {
              id: true,
              status: true,
            },
          },
          stages: {
            where: { isTasker: false },
            select: {
              status: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error("Project not found.");
      }

      if (!canUseFinalCompletionWorkflow(project)) {
        throw new Error(
          "Complete the final stage before uploading completion documents.",
        );
      }

      if (project.executionType === ProjectExecutionType.INTERNAL) {
        throw new Error("Completion documents are not required for internal execution.");
      }

      const workflow = await ensureWorkflowExistsTx(tx, project.id);
      const canUploadApprovalProof = workflow.approvalContactUserId === user.id;
      const canUploadCopyrightDocument = workflow.copyrightContactUserId === user.id;
      const canUploadInvoice = workflow.invoiceContactUserId === user.id;
      const archiveFileName = input.originalFileName.trim();
      const uploadedAt = new Date();

      switch (input.documentType) {
        case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
          if (!canUploadApprovalProof) {
            throw new Error("Only the selected approval contact can upload authority approval proof.");
          }

          if (workflow.approvalStatus !== ProjectCompletionStepStatus.PENDING) {
            throw new Error("Prepare the authority approval request before uploading proof.");
          }

          await tx.projectCompletionDocument.upsert({
            where: {
              workflowId_type: {
                workflowId: workflow.id,
                type: ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF,
              },
            },
            update: {
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
            create: {
              projectId: project.id,
              workflowId: workflow.id,
              type: ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF,
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
          });

          await tx.projectCompletionWorkflow.update({
            where: {
              projectId: project.id,
            },
            data: {
              approvalStatus: ProjectCompletionStepStatus.COMPLETED,
              approvalCompletedAt: uploadedAt,
              invoiceStatus: getNextInvoiceStatus(workflow.invoiceStatus),
              completedAt: getWorkflowCompletedAtValue({
                approvalRequired: workflow.approvalRequired,
                approvalStatus: ProjectCompletionStepStatus.COMPLETED,
                copyrightRequired: workflow.copyrightRequired,
                copyrightStatus: workflow.copyrightStatus,
                invoiceRequired: workflow.invoiceRequired,
                invoiceStatus: getNextInvoiceStatus(workflow.invoiceStatus),
              }),
            },
          });
          break;
        case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
          if (!canUploadCopyrightDocument) {
            throw new Error("Only the selected copyright contact can upload copyright transfer documents.");
          }

          if (
            !isCompletionRequirementResolved({
              required: workflow.approvalRequired,
              status: workflow.approvalStatus,
            })
          ) {
            throw new Error(
              "Complete authority approval before uploading the signed copyright transfer document.",
            );
          }

          if (workflow.copyrightStatus !== ProjectCompletionStepStatus.PENDING) {
            throw new Error("Prepare the copyright transfer request before uploading the signed document.");
          }

          await tx.projectCompletionDocument.upsert({
            where: {
              workflowId_type: {
                workflowId: workflow.id,
                type: ProjectCompletionDocumentType.COPYRIGHT_TRANSFER,
              },
            },
            update: {
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
            create: {
              projectId: project.id,
              workflowId: workflow.id,
              type: ProjectCompletionDocumentType.COPYRIGHT_TRANSFER,
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
          });

          await tx.projectCompletionWorkflow.update({
            where: {
              projectId: project.id,
            },
            data: {
              copyrightStatus: ProjectCompletionStepStatus.COMPLETED,
              copyrightCompletedAt: uploadedAt,
              invoiceStatus: getNextInvoiceStatus(workflow.invoiceStatus),
              completedAt: getWorkflowCompletedAtValue({
                approvalRequired: workflow.approvalRequired,
                approvalStatus: workflow.approvalStatus,
                copyrightRequired: workflow.copyrightRequired,
                copyrightStatus: ProjectCompletionStepStatus.COMPLETED,
                invoiceRequired: workflow.invoiceRequired,
                invoiceStatus: getNextInvoiceStatus(workflow.invoiceStatus),
              }),
            },
          });
          break;
        case ProjectCompletionDocumentType.INVOICE:
          if (!canUploadInvoice) {
            throw new Error("Only the selected final invoice recipient can upload the final invoice.");
          }

          if (
            !isCompletionRequirementResolved({
              required: workflow.approvalRequired,
              status: workflow.approvalStatus,
            }) ||
            !isCompletionRequirementResolved({
              required: workflow.copyrightRequired,
              status: workflow.copyrightStatus,
            })
          ) {
            throw new Error(
              "Complete or skip authority approval and copyright transfer before uploading the final invoice.",
            );
          }

          if (workflow.invoiceStatus !== ProjectCompletionStepStatus.PENDING) {
            throw new Error("Final invoice must be requested before upload.");
          }

          await tx.projectCompletionDocument.upsert({
            where: {
              workflowId_type: {
                workflowId: workflow.id,
                type: ProjectCompletionDocumentType.INVOICE,
              },
            },
            update: {
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
            create: {
              projectId: project.id,
              workflowId: workflow.id,
              type: ProjectCompletionDocumentType.INVOICE,
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
          });

          await tx.projectCompletionWorkflow.update({
            where: {
              projectId: project.id,
            },
            data: {
              invoiceStatus: ProjectCompletionStepStatus.COMPLETED,
              invoiceCompletedAt: uploadedAt,
              completedAt: uploadedAt,
            },
          });
          break;
      }
    }),
  );

  switch (input.documentType) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      await runNotificationTask("approval-proof-uploaded", () =>
        notifyApprovalProofUploaded({
          projectId: input.projectId,
          actorId: user.id,
        }),
      );
      break;
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      await runNotificationTask("copyright-document-uploaded", () =>
        notifyCopyrightDocumentUploaded({
          projectId: input.projectId,
          actorId: user.id,
        }),
      );
      break;
    case ProjectCompletionDocumentType.INVOICE:
      await runNotificationTask("invoice-uploaded", () =>
        notifyInvoiceUploaded({
          projectId: input.projectId,
          actorId: user.id,
        }),
      );
      break;
  }
}

export async function getProjectCompletionDocumentDownloadUrlForUser(
  user: ProjectCompletionWorkflowUser,
  documentId: string,
) {
  const document = await ensureProjectCompletionDocumentAccess(user, documentId);

  return createPresignedDownloadUrl({
    bucket: document.bucket,
    storageKey: document.storageKey,
    fileName: document.archiveFileName,
    mimeType: document.mimeType,
  });
}

export async function getProjectCompletionDocumentPreviewUrlForUser(
  user: ProjectCompletionWorkflowUser,
  documentId: string,
) {
  const document = await ensureProjectCompletionDocumentAccess(user, documentId);

  return createPresignedPreviewUrl({
    bucket: document.bucket,
    storageKey: document.storageKey,
    fileName: document.archiveFileName,
    mimeType: document.mimeType,
  });
}
