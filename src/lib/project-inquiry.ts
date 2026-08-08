import {
  AttachmentAssetType,
  AttachmentStatus,
  Prisma,
  ProjectInquiryAttachmentField,
  ProjectInquiryClientOrigin,
  ProjectInquiryPartyRole,
  ProjectInquiryPartySource,
  ProjectInquiryPriority,
  ProjectInquiryTargetMarketKind,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import { getUserDisplayName } from "@/lib/auth";
import type { CollaboratorRecord } from "@/lib/collaboration";
import {
  getCollaboratorTypeGroup,
  getDefaultProjectCollaboratorParticipantType,
  isProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import { normalizeProjectCollaboratorPermissions } from "@/lib/project-collaborator-permissions";
import {
  type ProjectContactInput,
  validateProjectContactInput,
} from "@/lib/project-contact-validation";
import {
  isProjectInquiryCountryLabel,
  PROJECT_INQUIRY_COUNTRY_OPTIONS,
  PROJECT_INQUIRY_GLOBAL_MARKET_LABEL,
} from "@/lib/project-inquiry-countries";
import {
  hasPermission,
  hasProjectPermission,
  type ProjectPermissionContext,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { ensureProjectResearchWorkspaceTx } from "@/lib/project-research";
import type { ProjectAccessUser } from "@/lib/projects";
import {
  getInitialProjectWorkflowStageData,
  PROJECT_WORKFLOW_STAGE_DEFINITIONS,
} from "@/lib/project-workflow";

const MAX_TEXT_LENGTH = 10_000;
const MAX_LABEL_LENGTH = 160;
const MAX_SELECTION_COUNT = 50;
const MAX_COLLABORATOR_COUNT = 100;
const MAX_ATTACHMENT_COUNT = 60;

const projectAccessSelect = {
  id: true,
  name: true,
  createdAt: true,
  ownerId: true,
  coOwners: {
    select: {
      userId: true,
    },
  },
  executors: {
    select: {
      userId: true,
    },
  },
  collaborators: {
    select: {
      userId: true,
      canInteract: true,
      canAddCaptions: true,
      canDownloadFiles: true,
      canViewBudget: true,
      canViewVendorInfo: true,
      canAccessProjectArchives: true,
    },
  },
} satisfies Prisma.ProjectSelect;

type ProjectAccessRecord = Prisma.ProjectGetPayload<{
  select: typeof projectAccessSelect;
}>;

export type ProjectInquiryPartyOption = {
  source: ProjectInquiryPartySource;
  id: string;
  name: string;
  company: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
};

export type ProjectInquiryPartySelection = Pick<
  ProjectInquiryPartyOption,
  "source" | "id" | "name" | "company" | "position" | "email" | "phone"
>;

export type ProjectInquiryTargetMarketInput = {
  label: string;
  kind?: ProjectInquiryTargetMarketKind | null;
};

export type ProjectInquiryAttachmentRecord = {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
};

export type ProjectInquiryRecord = {
  client: ProjectInquiryPartySelection | null;
  finalBeneficiary: ProjectInquiryPartySelection | null;
  clientOrigin: ProjectInquiryClientOrigin | null;
  targetMarkets: ProjectInquiryTargetMarketInput[];
  initialBrief: string;
  businessObjectives: string;
  collaboratorIds: string[];
  deliverables: string[];
  inquiryDate: string;
  deadline: string;
  legalNotes: string;
  priority: ProjectInquiryPriority | null;
  attachments: Record<
    ProjectInquiryAttachmentField,
    ProjectInquiryAttachmentRecord[]
  >;
};

export type ProjectInquiryPageData = {
  inquiry: ProjectInquiryRecord | null;
  partyOptions: ProjectInquiryPartyOption[];
  targetMarketSuggestions: ProjectInquiryTargetMarketInput[];
  countryOptions: string[];
  deliverableSuggestions: string[];
  availableCollaborators: CollaboratorRecord[];
  projectCollaboratorIds: string[];
  canEdit: boolean;
  canInviteCollaborator: boolean;
};

export type CompleteProjectInquiryInput = {
  projectId: string;
  client: Pick<ProjectInquiryPartySelection, "source" | "id"> | null;
  finalBeneficiary: Pick<ProjectInquiryPartySelection, "source" | "id"> | null;
  clientOrigin?: ProjectInquiryClientOrigin | null;
  targetMarkets?: ProjectInquiryTargetMarketInput[];
  initialBrief?: string;
  businessObjectives?: string;
  collaboratorIds?: string[];
  deliverables?: string[];
  inquiryDate?: string;
  deadline?: string;
  legalNotes?: string;
  priority?: ProjectInquiryPriority | null;
  attachmentIds?: Partial<Record<ProjectInquiryAttachmentField, string[]>>;
};

export type ProjectInquiryFieldErrors = Partial<
  Record<
    | "client"
    | "finalBeneficiary"
    | "clientOrigin"
    | "targetMarkets"
    | "initialBrief"
    | "businessObjectives"
    | "collaboratorIds"
    | "deliverables"
    | "inquiryDate"
    | "deadline"
    | "legalNotes"
    | "priority"
    | "attachments",
    string
  >
>;

export type CompleteProjectInquiryResult =
  | { success: true }
  | { error: string; fieldErrors?: ProjectInquiryFieldErrors };

export type CreateContactDirectoryEntryInput = ProjectContactInput;

export type CreateContactDirectoryEntryResult =
  | { contact: ProjectInquiryPartyOption }
  | { error: string; fieldErrors?: Partial<Record<keyof CreateContactDirectoryEntryInput, string>> };

function toPermissionContext(project: ProjectAccessRecord): ProjectPermissionContext {
  return {
    ownerId: project.ownerId,
    coOwners: project.coOwners,
    executors: project.executors,
    collaborators: project.collaborators,
  };
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeProjectInquiryLabel(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase("en");
}

function normalizeOptionalText(
  value: string | undefined,
  field: keyof ProjectInquiryFieldErrors,
  fieldErrors: ProjectInquiryFieldErrors,
) {
  const normalized = value?.trim() ?? "";

  if (normalized.length > MAX_TEXT_LENGTH) {
    fieldErrors[field] = `Keep this field under ${MAX_TEXT_LENGTH.toLocaleString()} characters.`;
  }

  return normalized || null;
}

function parseDateOnly(
  value: string | undefined,
  field: "inquiryDate" | "deadline",
  fieldErrors: ProjectInquiryFieldErrors,
) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    fieldErrors[field] = "Enter a valid calendar date.";
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    fieldErrors[field] = "Enter a valid calendar date.";
    return null;
  }

  return date;
}

function formatDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function emptyAttachmentRecord(): ProjectInquiryRecord["attachments"] {
  return {
    INITIAL_BRIEF: [],
    BUSINESS_OBJECTIVES: [],
    LEGAL_NOTES: [],
  };
}

function mapPartyOptionFromUser(user: {
  id: string;
  name: string | null;
  email: string;
  department: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
}): ProjectInquiryPartyOption {
  return {
    source: ProjectInquiryPartySource.USER,
    id: user.id,
    name: getUserDisplayName(user),
    company: user.department,
    position: user.jobTitle,
    email: user.email,
    phone: user.phoneNumber,
  };
}

function mapPartyOptionFromContact(contact: {
  id: string;
  name: string;
  company: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
}): ProjectInquiryPartyOption {
  return {
    source: ProjectInquiryPartySource.MANUAL_CONTACT,
    id: contact.id,
    name: contact.name,
    company: contact.company,
    position: contact.position,
    email: contact.email,
    phone: contact.phone,
  };
}

function mapSavedParty(party: {
  source: ProjectInquiryPartySource;
  userId: string | null;
  contactId: string | null;
  snapshotName: string;
  snapshotCompany: string | null;
  snapshotPosition: string | null;
  snapshotEmail: string | null;
  snapshotPhone: string | null;
}): ProjectInquiryPartySelection {
  return {
    source: party.source,
    id:
      party.source === ProjectInquiryPartySource.USER
        ? party.userId ?? ""
        : party.contactId ?? "",
    name: party.snapshotName,
    company: party.snapshotCompany,
    position: party.snapshotPosition,
    email: party.snapshotEmail,
    phone: party.snapshotPhone,
  };
}

async function getProjectAccessRecord(projectId: string) {
  return withPrismaRetry(() =>
    prisma.project.findUnique({
      where: { id: projectId },
      select: projectAccessSelect,
    }),
  );
}

export async function createContactDirectoryEntry(
  user: ProjectAccessUser,
  projectId: string,
  input: CreateContactDirectoryEntryInput,
): Promise<CreateContactDirectoryEntryResult> {
  const project = await getProjectAccessRecord(projectId);

  if (!project) {
    return { error: "Project not found." };
  }

  if (!hasProjectPermission(user, toPermissionContext(project), "project.update")) {
    return { error: "You do not have permission to edit Project Inquiry." };
  }

  const validation = validateProjectContactInput(input);

  if (Object.keys(validation.fieldErrors).length > 0) {
    return {
      error: "Review the highlighted contact fields.",
      fieldErrors: validation.fieldErrors,
    };
  }

  const contact = await withPrismaRetry(() =>
    prisma.contactDirectoryEntry.create({
      data: {
        name: validation.data.name,
        company: validation.data.company || null,
        position: validation.data.position || null,
        email: validation.data.email || null,
        phone: validation.data.phone || null,
        createdById: user.id,
      },
      select: {
        id: true,
        name: true,
        company: true,
        position: true,
        email: true,
        phone: true,
      },
    }),
  );

  return {
    contact: mapPartyOptionFromContact(contact),
  };
}

export async function getProjectInquiryPageData(
  user: ProjectAccessUser,
  projectId: string,
  availableCollaborators: CollaboratorRecord[],
): Promise<ProjectInquiryPageData> {
  const project = await getProjectAccessRecord(projectId);

  if (!project || !hasProjectPermission(user, toPermissionContext(project), "stage.view")) {
    throw new Error("Project Inquiry is unavailable.");
  }

  const [inquiry, users, contacts, targetMarketHistory, deliverableHistory] =
    await withPrismaRetry(() =>
      prisma.$transaction([
        prisma.projectInquiry.findUnique({
          where: { projectId },
          include: {
            parties: true,
            targetMarkets: {
              orderBy: { createdAt: "asc" },
            },
            deliverables: {
              orderBy: { createdAt: "asc" },
            },
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                attachment: {
                  select: {
                    id: true,
                    originalFileName: true,
                    mimeType: true,
                    fileSize: true,
                    status: true,
                  },
                },
              },
            },
          },
        }),
        prisma.user.findMany({
          orderBy: [{ name: "asc" }, { email: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
            jobTitle: true,
            phoneNumber: true,
          },
        }),
        prisma.contactDirectoryEntry.findMany({
          orderBy: [{ name: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            company: true,
            position: true,
            email: true,
            phone: true,
          },
        }),
        prisma.projectInquiryTargetMarket.findMany({
          distinct: ["normalizedLabel"],
          orderBy: [{ normalizedLabel: "asc" }, { createdAt: "desc" }],
          select: {
            label: true,
            kind: true,
            normalizedLabel: true,
          },
        }),
        prisma.projectInquiryDeliverable.findMany({
          distinct: ["normalizedLabel"],
          orderBy: [{ normalizedLabel: "asc" }, { createdAt: "desc" }],
          select: {
            label: true,
            normalizedLabel: true,
          },
        }),
      ]),
    );

  let mappedInquiry: ProjectInquiryRecord | null = null;

  if (inquiry) {
    const client = inquiry.parties.find(
      (party) => party.role === ProjectInquiryPartyRole.CLIENT,
    );
    const finalBeneficiary = inquiry.parties.find(
      (party) => party.role === ProjectInquiryPartyRole.FINAL_BENEFICIARY,
    );
    const attachments = emptyAttachmentRecord();

    for (const association of inquiry.attachments) {
      if (association.attachment.status !== AttachmentStatus.READY) {
        continue;
      }

      attachments[association.field].push({
        id: association.attachment.id,
        originalFileName: association.attachment.originalFileName,
        mimeType: association.attachment.mimeType,
        fileSize: association.attachment.fileSize,
      });
    }

    mappedInquiry = {
      client: client ? mapSavedParty(client) : null,
      finalBeneficiary: finalBeneficiary ? mapSavedParty(finalBeneficiary) : null,
      clientOrigin: inquiry.clientOrigin,
      targetMarkets: inquiry.targetMarkets.map((market) => ({
        label: market.label,
        kind: market.kind,
      })),
      initialBrief: inquiry.initialBrief ?? "",
      businessObjectives: inquiry.businessObjectives ?? "",
      collaboratorIds: project.collaborators.map((collaborator) => collaborator.userId),
      deliverables: inquiry.deliverables.map((deliverable) => deliverable.label),
      inquiryDate: formatDateOnly(inquiry.inquiryDate),
      deadline: formatDateOnly(inquiry.deadline),
      legalNotes: inquiry.legalNotes ?? "",
      priority: inquiry.priority,
      attachments,
    };
  }

  return {
    inquiry: mappedInquiry,
    partyOptions: [
      ...users.map(mapPartyOptionFromUser),
      ...contacts.map(mapPartyOptionFromContact),
    ],
    targetMarketSuggestions: targetMarketHistory.map((market) => ({
      label: market.label,
      kind: market.kind,
    })),
    countryOptions: [
      PROJECT_INQUIRY_GLOBAL_MARKET_LABEL,
      ...PROJECT_INQUIRY_COUNTRY_OPTIONS,
    ],
    deliverableSuggestions: deliverableHistory.map((deliverable) => deliverable.label),
    availableCollaborators,
    projectCollaboratorIds: project.collaborators.map(
      (collaborator) => collaborator.userId,
    ),
    canEdit: hasProjectPermission(user, toPermissionContext(project), "project.update"),
    canInviteCollaborator: hasPermission(user, "collaboration.createUser"),
  };
}

function validatePartyInput(
  value: CompleteProjectInquiryInput["client"],
  field: "client" | "finalBeneficiary",
  fieldErrors: ProjectInquiryFieldErrors,
) {
  if (!value?.id?.trim()) {
    fieldErrors[field] =
      field === "client" ? "Select a client." : "Select a final beneficiary.";
    return null;
  }

  if (!Object.values(ProjectInquiryPartySource).includes(value.source)) {
    fieldErrors[field] = "Select a valid saved party.";
    return null;
  }

  return {
    source: value.source,
    id: value.id.trim(),
  };
}

function normalizeTargetMarkets(
  values: ProjectInquiryTargetMarketInput[] | undefined,
  fieldErrors: ProjectInquiryFieldErrors,
) {
  const requestedValues = values ?? [];

  if (requestedValues.length > MAX_SELECTION_COUNT) {
    fieldErrors.targetMarkets = `Select no more than ${MAX_SELECTION_COUNT} target markets.`;
    return [];
  }

  const normalizedValues = requestedValues
    .map((value) => {
      const label = normalizeWhitespace(value.label);

      if (!label || label.length > MAX_LABEL_LENGTH) {
        return null;
      }

      const normalizedLabel = normalizeProjectInquiryLabel(label);
      const kind =
        normalizedLabel ===
        normalizeProjectInquiryLabel(PROJECT_INQUIRY_GLOBAL_MARKET_LABEL)
          ? ProjectInquiryTargetMarketKind.GLOBAL
          : isProjectInquiryCountryLabel(label)
            ? ProjectInquiryTargetMarketKind.COUNTRY
            : ProjectInquiryTargetMarketKind.REGION;

      return { label, normalizedLabel, kind };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (normalizedValues.length !== requestedValues.length) {
    fieldErrors.targetMarkets = `Every target market must be between 1 and ${MAX_LABEL_LENGTH} characters.`;
  }

  if (new Set(normalizedValues.map((value) => value.normalizedLabel)).size !== normalizedValues.length) {
    fieldErrors.targetMarkets = "Target markets cannot contain duplicates.";
  }

  return normalizedValues;
}

function normalizeDeliverables(
  values: string[] | undefined,
  fieldErrors: ProjectInquiryFieldErrors,
) {
  const requestedValues = values ?? [];

  if (requestedValues.length > MAX_SELECTION_COUNT) {
    fieldErrors.deliverables = `Add no more than ${MAX_SELECTION_COUNT} deliverables.`;
    return [];
  }

  const normalizedValues = requestedValues
    .map((value) => {
      const label = normalizeWhitespace(value);
      return label && label.length <= MAX_LABEL_LENGTH
        ? { label, normalizedLabel: normalizeProjectInquiryLabel(label) }
        : null;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (normalizedValues.length !== requestedValues.length) {
    fieldErrors.deliverables = `Every deliverable must be between 1 and ${MAX_LABEL_LENGTH} characters.`;
  }

  if (new Set(normalizedValues.map((value) => value.normalizedLabel)).size !== normalizedValues.length) {
    fieldErrors.deliverables = "Deliverables cannot contain duplicates.";
  }

  return normalizedValues;
}

function normalizeIds(
  values: string[] | undefined,
  maxCount: number,
  field: "collaboratorIds" | "attachments",
  fieldErrors: ProjectInquiryFieldErrors,
) {
  const normalized = (values ?? []).map((value) => value.trim()).filter(Boolean);

  if (normalized.length > maxCount) {
    fieldErrors[field] = `Select no more than ${maxCount} items.`;
  } else if (new Set(normalized).size !== normalized.length) {
    fieldErrors[field] = "Duplicate selections are not allowed.";
  }

  return normalized;
}

async function resolvePartySnapshot(
  tx: Prisma.TransactionClient,
  value: NonNullable<ReturnType<typeof validatePartyInput>>,
) {
  if (value.source === ProjectInquiryPartySource.USER) {
    const selectedUser = await tx.user.findUnique({
      where: { id: value.id },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        jobTitle: true,
        phoneNumber: true,
      },
    });

    if (!selectedUser) {
      return null;
    }

    return {
      source: ProjectInquiryPartySource.USER,
      userId: selectedUser.id,
      contactId: null,
      snapshotName: getUserDisplayName(selectedUser),
      snapshotCompany: selectedUser.department,
      snapshotPosition: selectedUser.jobTitle,
      snapshotEmail: selectedUser.email,
      snapshotPhone: selectedUser.phoneNumber,
    };
  }

  const contact = await tx.contactDirectoryEntry.findUnique({
    where: { id: value.id },
    select: {
      id: true,
      name: true,
      company: true,
      position: true,
      email: true,
      phone: true,
    },
  });

  if (!contact) {
    return null;
  }

  return {
    source: ProjectInquiryPartySource.MANUAL_CONTACT,
    userId: null,
    contactId: contact.id,
    snapshotName: contact.name,
    snapshotCompany: contact.company,
    snapshotPosition: contact.position,
    snapshotEmail: contact.email,
    snapshotPhone: contact.phone,
  };
}

export async function completeProjectInquiry(
  user: ProjectAccessUser,
  input: CompleteProjectInquiryInput,
): Promise<CompleteProjectInquiryResult> {
  const projectId = input.projectId.trim();
  const fieldErrors: ProjectInquiryFieldErrors = {};
  const client = validatePartyInput(input.client, "client", fieldErrors);
  const finalBeneficiary = validatePartyInput(
    input.finalBeneficiary,
    "finalBeneficiary",
    fieldErrors,
  );
  const initialBrief = normalizeOptionalText(input.initialBrief, "initialBrief", fieldErrors);
  const businessObjectives = normalizeOptionalText(
    input.businessObjectives,
    "businessObjectives",
    fieldErrors,
  );
  const legalNotes = normalizeOptionalText(input.legalNotes, "legalNotes", fieldErrors);
  const inquiryDate = parseDateOnly(input.inquiryDate, "inquiryDate", fieldErrors);
  const deadline = parseDateOnly(input.deadline, "deadline", fieldErrors);
  const targetMarkets = normalizeTargetMarkets(input.targetMarkets, fieldErrors);
  const deliverables = normalizeDeliverables(input.deliverables, fieldErrors);
  const collaboratorIds = normalizeIds(
    input.collaboratorIds,
    MAX_COLLABORATOR_COUNT,
    "collaboratorIds",
    fieldErrors,
  );
  const attachmentSelections = Object.values(ProjectInquiryAttachmentField).flatMap(
    (field) =>
      normalizeIds(
        input.attachmentIds?.[field],
        MAX_ATTACHMENT_COUNT,
        "attachments",
        fieldErrors,
      ).map((attachmentId) => ({ attachmentId, field })),
  );

  if (!projectId) {
    return { error: "Project not found." };
  }

  if (
    input.clientOrigin != null &&
    !Object.values(ProjectInquiryClientOrigin).includes(input.clientOrigin)
  ) {
    fieldErrors.clientOrigin = "Select a valid client origin.";
  }

  if (
    input.priority != null &&
    !Object.values(ProjectInquiryPriority).includes(input.priority)
  ) {
    fieldErrors.priority = "Select a valid priority.";
  }

  if (Object.keys(fieldErrors).length > 0 || !client || !finalBeneficiary) {
    return {
      error: "Review the highlighted Stage 1 fields.",
      fieldErrors,
    };
  }

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: projectAccessSelect,
      });

      if (!project) {
        return { error: "Project not found." } as const;
      }

      if (!hasProjectPermission(user, toPermissionContext(project), "project.update")) {
        return {
          error: "You do not have permission to complete Project Inquiry.",
        } as const;
      }

      const clientSnapshot = await resolvePartySnapshot(tx, client);
      const finalBeneficiarySnapshot = await resolvePartySnapshot(
        tx,
        finalBeneficiary,
      );

      if (!clientSnapshot || !finalBeneficiarySnapshot) {
        return {
          error: "One or more selected parties are no longer available.",
          fieldErrors: {
            ...(!clientSnapshot ? { client: "Select a valid client." } : {}),
            ...(!finalBeneficiarySnapshot
              ? { finalBeneficiary: "Select a valid final beneficiary." }
              : {}),
          },
        } as const;
      }

      const uniqueCollaboratorIds = [...new Set(collaboratorIds)];
      const collaboratorUsers = uniqueCollaboratorIds.length
        ? await tx.user.findMany({
            where: {
              id: { in: uniqueCollaboratorIds },
              role: UserRole.COLLABORATOR,
            },
            select: {
              id: true,
              collaboratorType: true,
            },
          })
        : [];

      if (collaboratorUsers.length !== uniqueCollaboratorIds.length) {
        return {
          error: "One or more collaborators are no longer eligible.",
          fieldErrors: {
            collaboratorIds: "Select only eligible application collaborators.",
          },
        } as const;
      }

      const uniqueAttachmentIds = [
        ...new Set(attachmentSelections.map((selection) => selection.attachmentId)),
      ];

      if (uniqueAttachmentIds.length !== attachmentSelections.length) {
        return {
          error: "An attachment can only be assigned to one Stage 1 field.",
          fieldErrors: { attachments: "Remove duplicate attachment selections." },
        } as const;
      }

      const attachments = uniqueAttachmentIds.length
        ? await tx.projectAttachment.findMany({
            where: {
              id: { in: uniqueAttachmentIds },
              projectId,
              status: AttachmentStatus.READY,
              assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET,
              stageId: null,
              revisionId: null,
              commentId: null,
            },
            select: { id: true },
          })
        : [];

      if (attachments.length !== uniqueAttachmentIds.length) {
        return {
          error: "One or more Stage 1 attachments are invalid.",
          fieldErrors: {
            attachments: "Use only ready attachments uploaded to this project.",
          },
        } as const;
      }

      await tx.projectWorkflowStage.createMany({
        data: getInitialProjectWorkflowStageData(project.createdAt).map((stage) => ({
          projectId,
          ...stage,
        })),
        skipDuplicates: true,
      });

      const currentWorkflowStages = await tx.projectWorkflowStage.findMany({
        where: {
          projectId,
          stageKey: {
            in: [
              ProjectWorkflowStageKey.PROJECT_INQUIRY,
              ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
            ],
          },
        },
      });
      const stageOne = currentWorkflowStages.find(
        (stage) => stage.stageKey === ProjectWorkflowStageKey.PROJECT_INQUIRY,
      );
      const stageTwo = currentWorkflowStages.find(
        (stage) =>
          stage.stageKey === ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
      );

      if (!stageOne || !stageTwo) {
        throw new Error("The fixed project workflow could not be initialized.");
      }

      const inquiry = await tx.projectInquiry.upsert({
        where: { projectId },
        create: {
          projectId,
          clientOrigin: input.clientOrigin ?? null,
          initialBrief,
          businessObjectives,
          inquiryDate,
          deadline,
          legalNotes,
          priority: input.priority ?? null,
        },
        update: {
          clientOrigin: input.clientOrigin ?? null,
          initialBrief,
          businessObjectives,
          inquiryDate,
          deadline,
          legalNotes,
          priority: input.priority ?? null,
        },
        select: { id: true },
      });

      await tx.projectInquiryParty.deleteMany({
        where: { inquiryId: inquiry.id },
      });
      await tx.projectInquiryParty.createMany({
        data: [
          {
            inquiryId: inquiry.id,
            role: ProjectInquiryPartyRole.CLIENT,
            ...clientSnapshot,
          },
          {
            inquiryId: inquiry.id,
            role: ProjectInquiryPartyRole.FINAL_BENEFICIARY,
            ...finalBeneficiarySnapshot,
          },
        ],
      });

      await tx.projectInquiryTargetMarket.deleteMany({
        where: { inquiryId: inquiry.id },
      });
      if (targetMarkets.length > 0) {
        await tx.projectInquiryTargetMarket.createMany({
          data: targetMarkets.map((market) => ({
            inquiryId: inquiry.id,
            ...market,
          })),
        });
      }

      await tx.projectInquiryDeliverable.deleteMany({
        where: { inquiryId: inquiry.id },
      });
      if (deliverables.length > 0) {
        await tx.projectInquiryDeliverable.createMany({
          data: deliverables.map((deliverable) => ({
            inquiryId: inquiry.id,
            ...deliverable,
          })),
        });
      }

      await tx.projectInquiryAttachment.deleteMany({
        where: { inquiryId: inquiry.id },
      });
      if (attachmentSelections.length > 0) {
        await tx.projectInquiryAttachment.createMany({
          data: attachmentSelections.map((selection) => ({
            inquiryId: inquiry.id,
            ...selection,
          })),
        });
      }

      const existingCollaboratorIds = new Set(
        project.collaborators.map((collaborator) => collaborator.userId),
      );
      const newCollaborators = collaboratorUsers.filter(
        (collaborator) => !existingCollaboratorIds.has(collaborator.id),
      );
      const requestedCollaboratorIds = new Set(
        collaboratorUsers.map((collaborator) => collaborator.id),
      );
      const protectedParticipantIds = new Set([
        ...(project.ownerId ? [project.ownerId] : []),
        ...project.coOwners.map((coOwner) => coOwner.userId),
        ...project.executors.map((executor) => executor.userId),
      ]);
      const removableCollaboratorIds = project.collaborators
        .map((collaborator) => collaborator.userId)
        .filter(
          (userId) =>
            !requestedCollaboratorIds.has(userId) &&
            !protectedParticipantIds.has(userId),
        );

      if (removableCollaboratorIds.length > 0) {
        await tx.projectCollaborator.deleteMany({
          where: {
            projectId,
            userId: { in: removableCollaboratorIds },
          },
        });
      }

      if (newCollaborators.length > 0) {
        const notificationRecipientIds: string[] = [];

        for (const collaborator of newCollaborators) {
          const participantType = isProjectCollaboratorParticipantType(
            collaborator.collaboratorType,
          )
            ? collaborator.collaboratorType
            : getDefaultProjectCollaboratorParticipantType(
                getCollaboratorTypeGroup(collaborator.collaboratorType),
              );
          const created = await tx.projectCollaborator.createMany({
            data: [
              {
                projectId,
                userId: collaborator.id,
                addedById: user.id,
                participantType,
                ...normalizeProjectCollaboratorPermissions(null, participantType),
              },
            ],
            skipDuplicates: true,
          });

          if (created.count === 1 && collaborator.id !== user.id) {
            notificationRecipientIds.push(collaborator.id);
          }

          if (created.count === 1) {
            await ensureProjectResearchWorkspaceTx(tx, projectId, collaborator.id);
          }
        }

        if (notificationRecipientIds.length > 0) {
          const now = new Date();
          await tx.notification.createMany({
            data: notificationRecipientIds.map((userId) => ({
              userId,
              type: "COLLABORATOR_ADDED",
              title: "Added to project",
              message: `You have been added to ${project.name}.`,
              entityType: "PROJECT",
              entityId: projectId,
              projectId,
              url: `/projects/${projectId}/stages/1`,
              createdAt: now,
              updatedAt: now,
            })),
          });
        }
      }

      const completedAt = stageOne.completedAt ?? new Date();
      await tx.projectWorkflowStage.update({
        where: {
          projectId_stageKey: {
            projectId,
            stageKey: ProjectWorkflowStageKey.PROJECT_INQUIRY,
          },
        },
        data: {
          status: ProjectWorkflowStageStatus.COMPLETED,
          unlockedAt: stageOne.unlockedAt ?? project.createdAt,
          completedAt,
        },
      });

      if (stageTwo.status !== ProjectWorkflowStageStatus.COMPLETED) {
        await tx.projectWorkflowStage.update({
          where: {
            projectId_stageKey: {
              projectId,
              stageKey: ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
            },
          },
          data: {
            status: ProjectWorkflowStageStatus.AVAILABLE,
            unlockedAt: stageTwo.unlockedAt ?? completedAt,
          },
        });
      }

      return { success: true } as const;
    }, {
      maxWait: 10_000,
      timeout: 30_000,
    }),
  );
}

export function getProjectWorkflowStageKeys() {
  return PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((stage) => stage.key);
}
