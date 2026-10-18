import { runProjectMutation } from "@/lib/authorization/project-write";
import { refreshProjectReader, requireProjectResourceRead } from "@/lib/authorization/project-read";
import { canReadFullProject, projectReadActor } from "@/lib/authorization/project-read-rules";
import { completionDocumentEvent, prepareCompletionUpload, finishCompletionUpload } from "@/lib/completion-documents/service";

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
import type { PermissionKey } from "@/lib/permissions/definitions";
import type { PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { isProjectStatusCompleted } from "@/lib/project-statuses";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  getFileExtension,
} from "@/lib/storage/s3";
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

function canManageCompletionWorkflow(project: ProjectCompletionPermissionProject, user: ProjectCompletionWorkflowUser) {
  return canReadFullProject(user, project);
}

function requireCompletionProjectPermission(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
  _permissionKey: PermissionKey,
  message: string,
) {
  if (!canManageCompletionWorkflow(project, user)) {
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

export function isCompletionRequirementResolved(input: {
  required: boolean | null;
  status: ProjectCompletionStepStatus;
}) {
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
  if (input.executionType === ProjectExecutionType.INTERNAL && !input.workflow) {
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

function mapContactOptions(project: ProjectCompletionProjectRecord, actor: ProjectCompletionWorkflowUser) {
  const contactMap = new Map<string, ProjectCompletionContactOption>();

  const addContact = (
    user: { id: string; name: string | null; email: string; authorization: { businessRole: string | null; accountStatus: string } | null },
    roleLabel: string,
  ) => {
    if (user.authorization?.accountStatus === "ACTIVE" && ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(user.authorization.businessRole ?? "") && !contactMap.has(user.id)) {
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

  if (projectReadActor(actor)?.businessRole === "DIRECTOR") addContact({ ...actor, authorization: { businessRole: "DIRECTOR", accountStatus: "ACTIVE" } }, "Director");
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
  // The V2 seven-stage flow retains its final files on production units; a
  // legacy native ProjectStage is not required for those completion requests.
  const units = await prisma.projectProductionUnit.findMany({
    where: { projectId: project.id, status: { in: ["HANDOVER_READY", "HANDED_OVER"] } },
    orderBy: { id: "asc" },
    select: { sourceAttachment: true, files: { orderBy: { id: "asc" }, select: { attachment: true } } },
  });
  const productionFiles = new Map<string, ProjectCompletionArchivedFileOption>();
  for (const file of units.flatMap(unit => [unit.sourceAttachment, ...unit.files.map(row => row.attachment)])) {
    if (file.projectId !== project.id || file.status !== "READY" || ["PROJECT_PRIVATE_FILE", "PROJECT_RESEARCH_FILE"].includes(file.assetType)) continue;
    productionFiles.set(file.id, {
      id: file.id, sourceAttachmentId: file.id, finalArchiveFileName: file.originalFileName, originalFileName: file.originalFileName,
      fileTypeLabel: getCompletionFileTypeLabel(file.originalFileName, file.mimeType), mimeType: file.mimeType,
      fileSizeLabel: formatCompletionFileSize(file.fileSize), sourceLabel: "Final production file",
      previewPath: `/api/project-assets/${file.id}/preview`, downloadPath: `/api/project-assets/${file.id}/download`,
    });
  }
  const finalStage = project.stages.at(-1) ?? null;
  if (!finalStage) return Array.from(productionFiles.values());

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

  return Array.from(new Map([...approvedRevisionAttachments, ...approvedStageSubmissions, ...productionFiles.values()].map(file => [file.id, file])).values());
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
    uploadedBy: document.uploadedBy ? getUserDisplayName(document.uploadedBy) : `External recipient: ${document.externalSubmitterEmail ?? "unavailable"}`,
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
            authorization: { select: { businessRole: true, accountStatus: true } },
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
            authorization: { select: { businessRole: true, accountStatus: true } },
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
            authorization: { select: { businessRole: true, accountStatus: true } },
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
            authorization: { select: { businessRole: true, accountStatus: true } },
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
            authorization: { select: { businessRole: true, accountStatus: true } },
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
            authorization: { select: { businessRole: true, accountStatus: true } },
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
            authorization: { select: { businessRole: true, accountStatus: true } },
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
                externalSubmitterEmail: true,
                uploadedBy: {
                  select: {
                    name: true,
                    email: true,
            authorization: { select: { businessRole: true, accountStatus: true } },
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

async function ensureProjectCompletionManageAccess(user: ProjectCompletionWorkflowUser, projectId: string) {
  await requireProjectResourceRead("structured", projectId, "project.view", user);
  const project = await getProjectCompletionProject(projectId);
  if (!project || !canManageCompletionWorkflow(project, user) || isCompletedProject(project)) {
    throw new Error("Completion documentation requires an authorized manager of an active project.");
  }
  return project;
}

async function ensureProjectCompletionDocumentAccess(
  user: ProjectCompletionWorkflowUser,
  documentId: string,
) {
  user = await refreshProjectReader(user);
 const linked = await prisma.projectCompletionDocument.findUniqueOrThrow({where:{id:documentId},select:{projectId:true}});
  await requireProjectResourceRead("structured", linked.projectId, "project.view", user);

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



  return document;
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
      approvalNote: true,
      approvalRequestedAt: true,
      copyrightRequired: true,
      copyrightStatus: true,
      copyrightContactUserId: true,
      copyrightNote: true,
      copyrightRequestedAt: true,
      invoiceRequired: true,
      invoiceStatus: true,
      invoiceContactUserId: true,
      invoiceNote: true,
      invoiceRequestedAt: true,
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
  const documentByType = new Map([...documents].reverse().map((document) => [document.type, document] as const));
  const isInternalExecution = isInternalCompletionProject(project) &&
    [project.completionWorkflow.approvalRequired, project.completionWorkflow.copyrightRequired, project.completionWorkflow.invoiceRequired].every(value => value === false);
  const { approvalRequired, approvalStatus, approvalSelectedArchivedFileIds, approvalSelectedProjectFileIds,
    copyrightRequired, copyrightStatus, invoiceRequired, invoiceStatus } = project.completionWorkflow;
  const canManage = canManageCompletionWorkflow(project, user) && !isCompletedProject(project);
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
    canManage,
    canUploadApprovalProof: canManage && approvalStatus === "PENDING",
    canUploadCopyrightDocument: canManage && copyrightStatus === "PENDING",
    canUploadInvoice: canManage && invoiceStatus === "PENDING",
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
      (isApprovalResolved && isCopyrightResolved),
    availableContacts: mapContactOptions(project, user),
    finalArchivedFiles,
    approvalSelectedFiles,
    documents,
    approvalProofDocument:
      documentByType.get(ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF) ?? null,
    copyrightTransferDocument:
      documentByType.get(ProjectCompletionDocumentType.COPYRIGHT_TRANSFER) ?? null,
    invoiceDocument: documentByType.get(ProjectCompletionDocumentType.INVOICE) ?? null,
    archiveBlockers,
  } satisfies ProjectCompletionWorkflowRecord;
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

export async function getProjectCompletionWorkflowForUser(
  user: ProjectCompletionWorkflowUser,
  projectId: string,
) {
  user = await refreshProjectReader(user);
  await requireProjectResourceRead('structured', projectId, 'project.view', user);

  const project = await getProjectCompletionProject(projectId);

  if (!project) {
    return null;
  }

  if (!project.completionWorkflow) {
    const exempt = project.executionType === "INTERNAL";
    project.completionWorkflow = {
      id: "unconfigured", documents: [], approvalSelectedArchivedFileIds: [], approvalSelectedProjectFileIds: [],
      approvalRequired: exempt ? false : null, copyrightRequired: exempt ? false : null, invoiceRequired: exempt ? false : null,
      approvalStatus: exempt ? "NOT_REQUIRED" : "NOT_STARTED", copyrightStatus: exempt ? "NOT_REQUIRED" : "NOT_STARTED", invoiceStatus: exempt ? "NOT_REQUIRED" : "NOT_STARTED",
      approvalContactUserId: null, approvalContactUser: null, approvalNote: null, approvalRequestedAt: null, approvalCompletedAt: null,
      copyrightContactUserId: null, copyrightContactUser: null, copyrightNote: null, copyrightRequestedAt: null, copyrightCompletedAt: null,
      invoiceContactUserId: null, invoiceContactUser: null, invoiceNote: null, invoiceRequestedAt: null, invoiceCompletedAt: null, completedAt: null,
    };
  }
  return mapWorkflowRecord(project, user);
}

async function configureProjectCompletionWorkflowImplementation(
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



  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);
      if (workflow.approvalRequired === input.approvalRequired && workflow.copyrightRequired === input.copyrightRequired && workflow.invoiceRequired === input.invoiceRequired) return;
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

async function prepareAuthorityApprovalRequestImplementation(
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


  const contactOptions = mapContactOptions(project, user);
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

      if (workflow.approvalStatus === "PENDING" && workflow.approvalContactUserId === input.contactUserId && workflow.approvalNote === (sanitizeRichText(input.note) || null) && JSON.stringify([...workflow.approvalSelectedProjectFileIds].sort()) === JSON.stringify([...selectedFileIds].sort())) return;

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
          approvalRequestedAt: new Date(Math.max(Date.now(), (workflow.approvalRequestedAt?.getTime() ?? 0) + 1)),
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

async function prepareCopyrightTransferRequestImplementation(
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


  const contactOptions = mapContactOptions(project, user);
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

      if (workflow.copyrightStatus === "PENDING" && workflow.copyrightContactUserId === input.contactUserId && workflow.copyrightNote === (sanitizeRichText(input.note) || null)) return;

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          copyrightStatus: ProjectCompletionStepStatus.PENDING,
          copyrightContactUserId: input.contactUserId,
          copyrightNote: sanitizeRichText(input.note) || null,
          copyrightRequestedAt: new Date(Math.max(Date.now(), (workflow.copyrightRequestedAt?.getTime() ?? 0) + 1)),
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

async function requestProjectFinalInvoiceImplementation(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    note?: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);


  const contactOptions = mapContactOptions(project, user);
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

      if (workflow.invoiceStatus === "PENDING" && workflow.invoiceContactUserId === input.contactUserId && workflow.invoiceNote === (sanitizeRichText(input.note) || null)) return;

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          invoiceStatus: ProjectCompletionStepStatus.PENDING,
          invoiceContactUserId: input.contactUserId,
          invoiceNote: sanitizeRichText(input.note) || null,
          invoiceRequestedAt: new Date(Math.max(Date.now(), (workflow.invoiceRequestedAt?.getTime() ?? 0) + 1)),
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

async function markProjectInvoiceNotRequiredImplementation(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);



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

      ensureRequirementChangeAllowed("Final invoice", workflow.invoiceRequired, workflow.invoiceStatus, false);

      if (workflow.invoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED) {
        return;
      }

      const invoiceDocument = await tx.projectCompletionDocument.findFirst({
        where: { workflowId: workflow.id, type: ProjectCompletionDocumentType.INVOICE },
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

async function requestProjectCompletionDocumentUploadImplementation(user: ProjectCompletionWorkflowUser, input: RequestProjectCompletionDocumentUploadInput) {
  return prepareCompletionUpload({ userId: user.id }, input);
}
async function finalizeProjectCompletionDocumentUploadImplementation(user: ProjectCompletionWorkflowUser, input: RequestProjectCompletionDocumentUploadInput & { storageKey: string; failed?: boolean }) {
  return finishCompletionUpload({ userId: user.id }, input);
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

export async function configureProjectCompletionWorkflow(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    approvalRequired: boolean;
    copyrightRequired: boolean;
    invoiceRequired: boolean;
  },
) {
  return runProjectMutation(user, "configureProjectCompletionWorkflow", { kind: "structured", id: input.projectId }, async (trustedUser) => {
    const before = await prisma.projectCompletionWorkflow.findUnique({ where: { projectId: input.projectId } });
    const result = await configureProjectCompletionWorkflowImplementation(trustedUser, input);
    const after = await prisma.projectCompletionWorkflow.findUniqueOrThrow({ where: { projectId: input.projectId } });
    if (JSON.stringify(before) !== JSON.stringify(after)) await completionDocumentEvent({ userId: trustedUser.id }, after, "configureProjectCompletionWorkflow", { before, after });
    return result;
  }, input);
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
  return runProjectMutation(user, "prepareAuthorityApprovalRequest", { kind: "structured", id: input.projectId }, async (trustedUser) => {
    const before = await prisma.projectCompletionWorkflow.findUnique({ where: { projectId: input.projectId } });
    const result = await prepareAuthorityApprovalRequestImplementation(trustedUser, input);
    const after = await prisma.projectCompletionWorkflow.findUniqueOrThrow({ where: { projectId: input.projectId } });
    if (JSON.stringify(before) !== JSON.stringify(after)) await completionDocumentEvent({ userId: trustedUser.id }, after, "prepareAuthorityApprovalRequest", { before, after });
    return result;
  }, input);
}

export async function prepareCopyrightTransferRequest(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    note?: string;
  },
) {
  return runProjectMutation(user, "prepareCopyrightTransferRequest", { kind: "structured", id: input.projectId }, async (trustedUser) => {
    const before = await prisma.projectCompletionWorkflow.findUnique({ where: { projectId: input.projectId } });
    const result = await prepareCopyrightTransferRequestImplementation(trustedUser, input);
    const after = await prisma.projectCompletionWorkflow.findUniqueOrThrow({ where: { projectId: input.projectId } });
    if (JSON.stringify(before) !== JSON.stringify(after)) await completionDocumentEvent({ userId: trustedUser.id }, after, "prepareCopyrightTransferRequest", { before, after });
    return result;
  }, input);
}

export async function requestProjectFinalInvoice(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    note?: string;
  },
) {
  return runProjectMutation(user, "requestProjectFinalInvoice", { kind: "structured", id: input.projectId }, async (trustedUser) => {
    const before = await prisma.projectCompletionWorkflow.findUnique({ where: { projectId: input.projectId } });
    const result = await requestProjectFinalInvoiceImplementation(trustedUser, input);
    const after = await prisma.projectCompletionWorkflow.findUniqueOrThrow({ where: { projectId: input.projectId } });
    if (JSON.stringify(before) !== JSON.stringify(after)) await completionDocumentEvent({ userId: trustedUser.id }, after, "requestProjectFinalInvoice", { before, after });
    return result;
  }, input);
}

export async function markProjectInvoiceNotRequired(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
  },
) {
  return runProjectMutation(user, "markProjectInvoiceNotRequired", { kind: "structured", id: input.projectId }, async (trustedUser) => {
    const before = await prisma.projectCompletionWorkflow.findUnique({ where: { projectId: input.projectId } });
    const result = await markProjectInvoiceNotRequiredImplementation(trustedUser, input);
    const after = await prisma.projectCompletionWorkflow.findUniqueOrThrow({ where: { projectId: input.projectId } });
    if (JSON.stringify(before) !== JSON.stringify(after)) await completionDocumentEvent({ userId: trustedUser.id }, after, "markProjectInvoiceNotRequired", { before, after });
    return result;
  }, input);
}

export async function requestProjectCompletionDocumentUpload(
  user: ProjectCompletionWorkflowUser,
  input: RequestProjectCompletionDocumentUploadInput,
): Promise<RequestProjectCompletionDocumentUploadResult> {
  return runProjectMutation(user, "requestProjectCompletionDocumentUpload", { kind: "structured", id: input.projectId }, async (trustedUser) =>
    requestProjectCompletionDocumentUploadImplementation(trustedUser, input), input);
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
  return runProjectMutation(user, "finalizeProjectCompletionDocumentUpload", { kind: "structured", id: input.projectId }, async (trustedUser) =>
    finalizeProjectCompletionDocumentUploadImplementation(trustedUser, input), input);
}
