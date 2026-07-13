import { FluxAiMessageRole, Prisma } from "@prisma/client";

import type {
  FluxAIChatResponse,
  FluxAIConversationDetail,
  FluxAIConversationMessage,
  FluxAIConversationSummary,
  FluxAIDraftProject,
  FluxAIArchiveAssetResult,
  FluxAIProjectResult,
} from "@/lib/flux-ai/types";
import { prisma, withPrismaRetry } from "@/lib/prisma";

const DEFAULT_CONVERSATION_TITLE = "New Flux AI Chat";
const MAX_CONVERSATION_TITLE_LENGTH = 48;
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONVERSATION = 120;

const sensitivePayloadKeys = new Set([
  "passwordHash",
  "token",
  "sessionToken",
  "authToken",
  "inviteToken",
  "resetToken",
  "privateKey",
  "apiKey",
  "secret",
  "storageKey",
  "bucket",
  "downloadUrl",
  "previewUrl",
  "downloadPath",
  "previewPath",
  "systemPrompt",
  "developerPrompt",
]);

type ConversationUser = {
  id: string;
};

type FluxAiConversationRecord = {
  id: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export class FluxAIConversationAccessError extends Error {
  constructor(message = "Flux AI conversation not found.") {
    super(message);
    this.name = "FluxAIConversationAccessError";
  }
}

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function generateFluxAIConversationTitle(message: string | null | undefined) {
  const normalizedMessage = normalizeTitle(message ?? "");

  if (!normalizedMessage) {
    return DEFAULT_CONVERSATION_TITLE;
  }

  const withoutCreateLead = normalizedMessage.replace(
    /^(?:please\s+)?(?:find|show|view|summarize|create|prepare|draft|what\s+is|how\s+many)\s+/i,
    "",
  );
  const title = normalizeTitle(withoutCreateLead || normalizedMessage);

  return title.length > MAX_CONVERSATION_TITLE_LENGTH
    ? `${title.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3).trimEnd()}...`
    : title;
}

function toSummary(conversation: FluxAiConversationRecord): FluxAIConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripSensitivePayloadKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitivePayloadKeys);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, nestedValue]) =>
        !sensitivePayloadKeys.has(key) && typeof nestedValue !== "undefined",
      )
      .map(([key, nestedValue]) => [key, stripSensitivePayloadKeys(nestedValue)]),
  );
}

function sanitizeProjectResultForPersistence(
  project: FluxAIProjectResult,
): FluxAIProjectResult {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    href: project.href,
    category: project.category,
    status: project.status,
    statusGroup: project.statusGroup,
    currentStage: project.currentStage,
    owner: project.owner,
    executor: project.executor,
    deadline: project.deadline,
    overdueStages: project.overdueStages?.map((stage) => ({
      id: stage.id,
      name: stage.name,
      status: stage.status,
      dueDate: stage.dueDate,
    })),
    archiveBlockers: project.archiveBlockers ? [...project.archiveBlockers] : undefined,
    blockersSummary: project.blockersSummary ?? null,
    readyForArchive: project.readyForArchive,
  };
}

function sanitizeArchiveAssetForPersistence(
  asset: FluxAIArchiveAssetResult,
): FluxAIArchiveAssetResult {
  return {
    id: asset.id,
    recordType: asset.recordType,
    title: asset.title,
    fileName: asset.fileName,
    originalFileName: asset.originalFileName,
    artworkId: asset.artworkId,
    archiveCategory: asset.archiveCategory,
    brandSubBrand: asset.brandSubBrand,
    fileType: asset.fileType,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    linkedProject: asset.linkedProject,
    archivedAt: asset.archivedAt,
    status: asset.status,
    viewHref: asset.viewHref,
    downloadHref: asset.downloadHref ?? null,
  };
}

function sanitizeDraftProjectForPersistence(
  draftProject: FluxAIDraftProject | null | undefined,
) {
  if (!draftProject) {
    return draftProject ?? null;
  }

  return {
    ...draftProject,
    mainExecutorMatch: draftProject.mainExecutorMatch
      ? {
          ...draftProject.mainExecutorMatch,
          selectedEmail: null,
          candidates: draftProject.mainExecutorMatch.candidates.map((candidate) => ({
            ...candidate,
            email: "",
          })),
        }
      : draftProject.mainExecutorMatch,
    collaboratorMatches: draftProject.collaboratorMatches?.map((match) => ({
      ...match,
      selectedEmail: null,
      candidates: match.candidates.map((candidate) => ({
        ...candidate,
        email: "",
      })),
    })),
  } satisfies FluxAIDraftProject;
}

export function sanitizeFluxAIResponseForPersistence(
  response: FluxAIChatResponse,
): FluxAIChatResponse {
  const sanitized: FluxAIChatResponse = {
    type: response.type,
    intent: response.intent,
    assistantMessage: response.assistantMessage,
    createdProjectId: response.createdProjectId,
    createdProjectHref: response.createdProjectHref,
    projects: response.projects?.map(sanitizeProjectResultForPersistence),
    archiveAssets: response.archiveAssets?.map(sanitizeArchiveAssetForPersistence),
    draftProject: sanitizeDraftProjectForPersistence(response.draftProject),
    statusSummary: response.statusSummary ? { ...response.statusSummary } : undefined,
    projectStatus: response.projectStatus
      ? {
          ...response.projectStatus,
          blockers: [...response.projectStatus.blockers],
        }
      : response.projectStatus,
    blockers: response.blockers ? [...response.blockers] : undefined,
    missingFields: response.missingFields ? [...response.missingFields] : undefined,
    warnings: response.warnings ? [...response.warnings] : undefined,
    suggestions: response.suggestions ? [...response.suggestions] : undefined,
  };

  return stripSensitivePayloadKeys(sanitized) as FluxAIChatResponse;
}

function toMessageRole(role: FluxAiMessageRole) {
  switch (role) {
    case FluxAiMessageRole.USER:
      return "user";
    case FluxAiMessageRole.SYSTEM_EVENT:
      return "system_event";
    default:
      return "assistant";
  }
}

function toConversationMessage(message: {
  id: string;
  role: FluxAiMessageRole;
  content: string;
  responseType: string | null;
  structuredPayload: Prisma.JsonValue | null;
  createdAt: Date;
}): FluxAIConversationMessage {
  return {
    id: message.id,
    role: toMessageRole(message.role),
    content: message.content,
    responseType: message.responseType,
    structuredPayload: message.structuredPayload as FluxAIChatResponse | null,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function listFluxAIConversationsForUser(user: ConversationUser) {
  const conversations = await withPrismaRetry(() =>
    prisma.fluxAiConversation.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      orderBy: {
        lastMessageAt: "desc",
      },
      take: MAX_CONVERSATIONS,
      select: {
        id: true,
        title: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );

  return {
    conversations: conversations.map(toSummary),
    latestConversationId: conversations[0]?.id ?? null,
  };
}

export async function createFluxAIConversationForUser(input: {
  user: ConversationUser;
  title?: string | null;
}) {
  const conversation = await withPrismaRetry(() =>
    prisma.fluxAiConversation.create({
      data: {
        userId: input.user.id,
        title: normalizeTitle(input.title ?? "") || DEFAULT_CONVERSATION_TITLE,
      },
      select: {
        id: true,
        title: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );

  return toSummary(conversation);
}

export async function getFluxAIConversationForUser(input: {
  user: ConversationUser;
  conversationId: string;
}) {
  const conversation = await withPrismaRetry(() =>
    prisma.fluxAiConversation.findFirst({
      where: {
        id: input.conversationId,
        userId: input.user.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        title: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );

  if (!conversation) {
    throw new FluxAIConversationAccessError();
  }

  return toSummary(conversation);
}

export async function getOrCreateFluxAIConversationForUser(input: {
  user: ConversationUser;
  conversationId?: string | null;
  firstMessage?: string | null;
}) {
  if (input.conversationId) {
    return getFluxAIConversationForUser({
      user: input.user,
      conversationId: input.conversationId,
    });
  }

  return createFluxAIConversationForUser({
    user: input.user,
    title: generateFluxAIConversationTitle(input.firstMessage),
  });
}

export async function getFluxAIConversationDetailForUser(input: {
  user: ConversationUser;
  conversationId: string;
}): Promise<FluxAIConversationDetail> {
  const conversation = await getFluxAIConversationForUser(input);
  const messages = await withPrismaRetry(() =>
    prisma.fluxAiMessage.findMany({
      where: {
        conversationId: input.conversationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: MAX_MESSAGES_PER_CONVERSATION,
      select: {
        id: true,
        role: true,
        content: true,
        responseType: true,
        structuredPayload: true,
        createdAt: true,
      },
    }),
  );
  const chronologicalMessages = [...messages].reverse();
  const latestStructuredMessage = messages.find((message) =>
    Boolean(message.structuredPayload),
  );

  return {
    conversation,
    messages: chronologicalMessages.map(toConversationMessage),
    latestResponse:
      (latestStructuredMessage?.structuredPayload as FluxAIChatResponse | null) ?? null,
  };
}

export async function archiveFluxAIConversationForUser(input: {
  user: ConversationUser;
  conversationId: string;
}) {
  await getFluxAIConversationForUser(input);

  await withPrismaRetry(() =>
    prisma.fluxAiConversation.update({
      where: {
        id: input.conversationId,
      },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    }),
  );
}

export async function deleteFluxAIConversationForUser(input: {
  user: ConversationUser;
  conversationId: string;
}) {
  await archiveFluxAIConversationForUser(input);
}

export async function persistFluxAIUserMessage(input: {
  user: ConversationUser;
  conversationId?: string | null;
  content: string;
}) {
  const conversation = await getOrCreateFluxAIConversationForUser({
    user: input.user,
    conversationId: input.conversationId,
    firstMessage: input.content,
  });
  const now = new Date();

  const message = await withPrismaRetry(() =>
    prisma.fluxAiMessage.create({
      data: {
        conversationId: conversation.id,
        role: FluxAiMessageRole.USER,
        content: input.content,
      },
      select: {
        id: true,
        role: true,
        content: true,
        responseType: true,
        structuredPayload: true,
        createdAt: true,
      },
    }),
  );

  await withPrismaRetry(() =>
    prisma.fluxAiConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        title:
          conversation.title === DEFAULT_CONVERSATION_TITLE
            ? generateFluxAIConversationTitle(input.content)
            : conversation.title,
      },
    }),
  );

  return {
    conversation: {
      ...conversation,
      title:
        conversation.title === DEFAULT_CONVERSATION_TITLE
          ? generateFluxAIConversationTitle(input.content)
          : conversation.title,
    },
    message: toConversationMessage(message),
  };
}

export async function persistFluxAIAssistantMessage(input: {
  user: ConversationUser;
  conversationId: string;
  response: FluxAIChatResponse;
}) {
  await getFluxAIConversationForUser({
    user: input.user,
    conversationId: input.conversationId,
  });

  const safeResponse = sanitizeFluxAIResponseForPersistence(input.response);
  const message = await withPrismaRetry(() =>
    prisma.fluxAiMessage.create({
      data: {
        conversationId: input.conversationId,
        role: FluxAiMessageRole.ASSISTANT,
        content: safeResponse.assistantMessage,
        responseType: safeResponse.type,
        structuredPayload: safeResponse as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        role: true,
        content: true,
        responseType: true,
        structuredPayload: true,
        createdAt: true,
      },
    }),
  );

  await withPrismaRetry(() =>
    prisma.fluxAiConversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: message.createdAt,
      },
    }),
  );

  return toConversationMessage(message);
}

export async function persistFluxAISystemEvent(input: {
  user: ConversationUser;
  conversationId: string;
  response: FluxAIChatResponse;
}) {
  await getFluxAIConversationForUser({
    user: input.user,
    conversationId: input.conversationId,
  });

  const safeResponse = sanitizeFluxAIResponseForPersistence(input.response);
  const message = await withPrismaRetry(() =>
    prisma.fluxAiMessage.create({
      data: {
        conversationId: input.conversationId,
        role: FluxAiMessageRole.SYSTEM_EVENT,
        content: safeResponse.assistantMessage,
        responseType: safeResponse.type,
        structuredPayload: safeResponse as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        role: true,
        content: true,
        responseType: true,
        structuredPayload: true,
        createdAt: true,
      },
    }),
  );

  await withPrismaRetry(() =>
    prisma.fluxAiConversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: message.createdAt,
      },
    }),
  );

  return toConversationMessage(message);
}
