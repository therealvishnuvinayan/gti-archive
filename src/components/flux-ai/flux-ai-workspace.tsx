"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  FileText,
  Download,
  Languages,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";

import { AppDatePicker } from "@/components/calendar/app-date-picker";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ChatLanguagePicker } from "@/components/projects/chat-language-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_CHAT_LANGUAGE,
  SUPPORTED_CHAT_LANGUAGES,
  getSupportedLanguageByCode,
} from "@/lib/ai/languages";
import type { CollaboratorRecord } from "@/lib/collaboration";
import type {
  FluxAIChatResponse,
  FluxAIArchiveAssetResult,
  FluxAICollaboratorPermissions,
  FluxAIConversationDetail,
  FluxAIConversationSummary,
  FluxAIDraftProject,
  FluxAIPersonCandidate,
  FluxAIPersonMatch,
  FluxAIProjectResult,
  FluxAIProjectStatusSummary,
} from "@/lib/flux-ai/types";
import {
  isClientOfGtiParticipantType,
  normalizeProjectCollaboratorPermissions,
  projectCollaboratorPermissionKeys,
  projectCollaboratorPermissionLabels,
  type ProjectCollaboratorPermissionKey,
} from "@/lib/project-collaborator-permissions";
import {
  PROJECT_CURRENCY_OPTIONS,
  resolveProjectCurrency,
} from "@/lib/project-currencies";
import {
  DEFAULT_PROJECT_PRIORITY,
  formatProjectPriority,
  projectPriorityOptions,
  type ProjectPriorityValue,
} from "@/lib/project-priority";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const promptChips = [
  "Show overdue stages",
  "View projects waiting for approval",
  "Find projects ready for archive",
];
const COLLAPSED_MESSAGE_LINE_LIMIT = 6;
const COLLAPSED_MESSAGE_CHARACTER_LIMIT = 760;
const MAX_RECORDING_DURATION_MS = 60_000;
const MAX_DRAFT_TAGS = 5;

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
};

type ProjectCardView = {
  name: string;
  category: string;
  status: string;
  statusClass: string;
  stage: string;
  stageClass: string;
  stageDotClass: string;
  owner: string;
  ownerInitials: string;
  ownerAvatarClass: string;
  executor: string;
  deadline: string;
  href: string;
  meta?: string[];
};

type TranslateApiResponse = {
  sourceLanguageCode: string;
  sourceLanguageName: string;
  targetLanguageCode: string;
  translatedText: string;
  error?: string;
};

type TranscribeApiResponse = {
  detectedSourceLanguage: string;
  detectedSourceLanguageCode: string;
  transcriptOriginal: string;
  translatedText: string;
  targetLanguageCode: string;
  error?: string;
};

type ConversationsListApiResponse = {
  conversations: FluxAIConversationSummary[];
  latestConversationId: string | null;
};

type CreateConversationApiResponse = {
  conversation: FluxAIConversationSummary;
};

type FluxAIDraftStatusOption = {
  id: string;
  name: string;
  slug: string;
  color: string;
  groupId: string | null;
  groupName: string;
  groupSlug: string;
  groupColor: string;
  groupIsActive: boolean;
  isActive: boolean;
};

type FluxAIDraftOptions = {
  categories: string[];
  statuses: FluxAIDraftStatusOption[];
  tags: string[];
  collaborators: CollaboratorRecord[];
  canManageProjectMasterData: boolean;
};

type FluxAiWorkspaceProps = {
  draftOptions?: FluxAIDraftOptions;
};

const emptyDraftOptions: FluxAIDraftOptions = {
  categories: [],
  statuses: [],
  tags: [],
  collaborators: [],
  canManageProjectMasterData: false,
};

const initialChatMessages: ChatEntry[] = [
  {
    id: "flux-ai-welcome",
    role: "assistant",
    content: "Welcome to Flux AI. Ask me to find projects, summarize status, or prepare a project draft.",
    time: "Now",
  },
];

function cloneDraftProject(draftProject: FluxAIDraftProject) {
  return {
    ...draftProject,
    tags: [...draftProject.tags],
    collaborators: [...draftProject.collaborators],
    stages: draftProject.stages.map((stage) => ({ ...stage })),
    collaboratorMatches: draftProject.collaboratorMatches?.map((match) => ({
      ...match,
      permissions: match.permissions ? { ...match.permissions } : match.permissions,
      candidates: match.candidates.map((candidate) => ({ ...candidate })),
    })),
    mainExecutorMatch: draftProject.mainExecutorMatch
      ? {
          ...draftProject.mainExecutorMatch,
          permissions: draftProject.mainExecutorMatch.permissions
            ? { ...draftProject.mainExecutorMatch.permissions }
            : draftProject.mainExecutorMatch.permissions,
          candidates: draftProject.mainExecutorMatch.candidates.map((candidate) => ({
            ...candidate,
          })),
        }
      : draftProject.mainExecutorMatch,
    missingFields: draftProject.missingFields ? [...draftProject.missingFields] : undefined,
    warnings: draftProject.warnings ? [...draftProject.warnings] : undefined,
  } satisfies FluxAIDraftProject;
}

function parseOptionalNumber(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue.replace(/,/g, ""));

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function normalizeComparable(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function findKnownOption(value: string | null | undefined, options: string[]) {
  const normalizedValue = normalizeComparable(value);

  if (!normalizedValue) {
    return null;
  }

  return options.find((option) => normalizeComparable(option) === normalizedValue) ?? null;
}

function hasKnownOption(value: string | null | undefined, options: string[]) {
  return Boolean(findKnownOption(value, options));
}

function collaboratorToFluxCandidate(
  collaborator: CollaboratorRecord,
): FluxAIPersonCandidate {
  return {
    id: collaborator.id,
    name: collaborator.name,
    email: collaborator.email,
    type: collaborator.type,
    typeLabel: collaborator.typeLabel,
    typeGroup: collaborator.typeGroup,
  };
}

function getSelectedCandidate(match: FluxAIPersonMatch | null | undefined) {
  if (!match?.selectedUserId) {
    return null;
  }

  return (
    match.candidates.find((candidate) => candidate.id === match.selectedUserId) ??
    match.candidates[0] ??
    null
  );
}

function getMatchPermissions(
  match: FluxAIPersonMatch | null | undefined,
  candidate: FluxAIPersonCandidate | null | undefined,
): FluxAICollaboratorPermissions {
  return normalizeProjectCollaboratorPermissions(
    match?.permissions ?? null,
    candidate?.type ?? null,
  );
}

function buildMatchedPersonFromCollaborator(
  collaborator: CollaboratorRecord,
  existingMatch?: FluxAIPersonMatch | null,
): FluxAIPersonMatch {
  const candidate = collaboratorToFluxCandidate(collaborator);

  return buildMatchedPersonFromCandidate(candidate, existingMatch);
}

function buildMatchedPersonFromCandidate(
  candidate: FluxAIPersonCandidate,
  existingMatch?: FluxAIPersonMatch | null,
): FluxAIPersonMatch {
  return {
    requestedName: existingMatch?.requestedName || candidate.name,
    status: "matched",
    selectedUserId: candidate.id,
    selectedName: candidate.name,
    selectedEmail: candidate.email,
    candidates: [candidate],
    permissions: normalizeProjectCollaboratorPermissions(
      existingMatch?.permissions ?? null,
      candidate.type,
    ),
  };
}

function findCollaboratorByCandidate(
  candidate: FluxAIPersonCandidate,
  collaborators: CollaboratorRecord[],
) {
  return collaborators.find((collaborator) => collaborator.id === candidate.id) ?? null;
}

function filterCollaboratorOptions(input: {
  collaborators: CollaboratorRecord[];
  query: string;
  excludedIds?: Set<string>;
  limit?: number;
}) {
  const normalizedQuery = normalizeComparable(input.query);
  const limit = input.limit ?? 8;

  return input.collaborators
    .filter((collaborator) => !input.excludedIds?.has(collaborator.id))
    .filter((collaborator) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        collaborator.name,
        collaborator.email,
        collaborator.typeLabel,
      ].some((value) => normalizeComparable(value).includes(normalizedQuery));
    })
    .slice(0, limit);
}

function getDraftStatusLabel(
  statusId: string | null | undefined,
  statuses: FluxAIDraftStatusOption[],
) {
  return statuses.find((status) => status.id === statusId)?.name ?? null;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function isLongChatContent(content: string) {
  return (
    content.length > COLLAPSED_MESSAGE_CHARACTER_LIMIT ||
    content.split(/\r?\n/).length > COLLAPSED_MESSAGE_LINE_LIMIT
  );
}

function getCollapsedChatContent(content: string) {
  const lines = content.split(/\r?\n/);
  const previewByLines = lines.slice(0, COLLAPSED_MESSAGE_LINE_LIMIT).join("\n");

  if (lines.length > COLLAPSED_MESSAGE_LINE_LIMIT) {
    return previewByLines;
  }

  if (content.length > COLLAPSED_MESSAGE_CHARACTER_LIMIT) {
    return `${content.slice(0, COLLAPSED_MESSAGE_CHARACTER_LIMIT).trimEnd()}...`;
  }

  return content;
}

function formatChatTime() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function formatConversationTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPersistedChatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapConversationMessagesToChatEntries(
  detail: FluxAIConversationDetail,
): ChatEntry[] {
  const entries = detail.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
      time: formatPersistedChatTime(message.createdAt),
    }) satisfies ChatEntry);

  return entries.length > 0 ? entries : initialChatMessages;
}

function getConversationIdFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  return new URL(window.location.href).searchParams.get("conversation");
}

function replaceConversationUrl(conversationId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (conversationId) {
    url.searchParams.set("conversation", conversationId);
  } else {
    url.searchParams.delete("conversation");
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function getInitials(value: string) {
  const words = value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "AI";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function getStatusTone(status: string, statusGroup: string | null) {
  const statusValue = `${status} ${statusGroup ?? ""}`.toLowerCase();

  if (statusValue.includes("hold")) {
    return {
      statusClass: "bg-[#fff1da] text-[#b66b14]",
      stageClass: "text-[#5d4826]",
      stageDotClass: "bg-[#f0a23b]",
    };
  }

  if (statusValue.includes("pending") || statusValue.includes("approval")) {
    return {
      statusClass: "bg-[#e0f0fb] text-[#166cae]",
      stageClass: "text-[#176dab]",
      stageDotClass: "bg-[#69b9ef]",
    };
  }

  if (statusValue.includes("completed") || statusValue.includes("archive")) {
    return {
      statusClass: "bg-[#eef0ef] text-[#506057]",
      stageClass: "text-[#506057]",
      stageDotClass: "bg-[#a8b2aa]",
    };
  }

  return {
    statusClass: "bg-[#e4f6e9] text-[#1f7a4c]",
    stageClass: "text-[#236c49]",
    stageDotClass: "bg-[#36a767]",
  };
}

function mapProjectResultToCard(
  project: FluxAIProjectResult,
  index: number,
): ProjectCardView {
  const tone = getStatusTone(project.status, project.statusGroup);
  const meta = [
    project.budgetLabel ? `Budget ${project.budgetLabel}` : null,
    project.readyForArchive ? "Ready for archive" : null,
    project.overdueStages?.length
      ? `${project.overdueStages.length} overdue stage${project.overdueStages.length === 1 ? "" : "s"}`
      : null,
    project.blockersSummary
      ? project.blockersSummary
      : project.archiveBlockers?.length
        ? `${project.archiveBlockers.length} archive blocker${project.archiveBlockers.length === 1 ? "" : "s"}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    name: project.name,
    category: project.category,
    status: project.status,
    owner: project.owner,
    ownerInitials: getInitials(project.owner),
    ownerAvatarClass:
      index % 3 === 0
        ? "bg-[#f3d7c9] text-[#7c3f28]"
        : index % 3 === 1
          ? "bg-[#e6d7c9] text-[#5a3925]"
          : "bg-[#f2dfb9] text-[#6f501a]",
    executor: project.executor,
    deadline: project.deadline,
    stage: project.currentStage,
    href: project.href,
    meta,
    ...tone,
  };
}

function getDraftCollaboratorLabels(draftProject: FluxAIDraftProject | null | undefined) {
  if (!draftProject?.collaboratorMatches?.length) {
    return draftProject?.collaborators ?? [];
  }

  return draftProject.collaboratorMatches.map(
    (match) => match.selectedName || match.requestedName || "Unresolved collaborator",
  );
}

function getDraftWarnings(response: FluxAIChatResponse | null) {
  return [
    ...(response?.warnings ?? []),
    ...(response?.draftProject?.warnings ?? []),
  ].filter((warning, index, warnings) => warnings.indexOf(warning) === index);
}

function hasFluxResultContent(response: FluxAIChatResponse | null) {
  if (!response) {
    return false;
  }

  return Boolean(
    shouldShowProjectMatches(response) ||
      shouldShowArchiveMatches(response) ||
      response.projectStatus ||
      response.type === "created_project" ||
      response.draftProject ||
      response.blockers?.length,
  );
}

function shouldShowArchiveMatches(response: FluxAIChatResponse | null) {
  if (!response) {
    return false;
  }

  return (
    response.type === "archive_results" ||
    response.intent === "archive_search" ||
    Boolean(response.archiveAssets?.length)
  );
}

function shouldShowProjectMatches(response: FluxAIChatResponse | null) {
  if (!response || response.intent === "project_count_summary") {
    return false;
  }

  return (
    response.type === "project_results" ||
    response.intent === "project_search" ||
    response.intent === "ready_for_archive" ||
    response.intent === "overdue_stages" ||
    response.intent === "archive_blockers"
  );
}

function getPreferredMatchesTab(response: FluxAIChatResponse | null): FluxMatchesTab | null {
  if (shouldShowArchiveMatches(response) && !shouldShowProjectMatches(response)) {
    return "archives";
  }

  if (shouldShowProjectMatches(response)) {
    return "projects";
  }

  return null;
}

function getArchiveAssetMimeType(asset: FluxAIArchiveAssetResult) {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  const fileType = asset.fileType.toLowerCase();

  if (fileType === "pdf") {
    return "application/pdf";
  }

  if (["png", "jpg", "jpeg", "webp", "gif"].includes(fileType)) {
    return `image/${fileType === "jpg" ? "jpeg" : fileType}`;
  }

  return "application/octet-stream";
}

type FluxMatchesTab = "projects" | "archives";

function CompactProjectMatchCard({ project }: { project: ProjectCardView }) {
  return (
    <article className="rounded-[16px] border border-[#e3e9e2] bg-white p-3 shadow-[0_8px_20px_rgba(23,39,28,0.035)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-extrabold leading-5 text-[#111712]">
            {project.name}
          </h3>
          <p className="mt-1 truncate text-[11px] font-semibold text-[#6f7a72]">
            Project · {project.category}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold",
            project.statusClass,
          )}
        >
          {project.status}
        </span>
      </div>
      <p className="mt-2 truncate text-[11px] font-semibold text-[#657069]">
        {project.stage}
      </p>
      <Button asChild variant="outline" size="sm" className="mt-3 min-h-9 w-full text-[12px]">
        <Link href={project.href}>View</Link>
      </Button>
    </article>
  );
}

function CompactArchiveMatchCard({ asset }: { asset: FluxAIArchiveAssetResult }) {
  const mimeType = getArchiveAssetMimeType(asset);

  return (
    <article className="rounded-[16px] border border-[#e3e9e2] bg-white p-3 shadow-[0_8px_20px_rgba(23,39,28,0.035)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-extrabold leading-5 text-[#111712]">
            {asset.title}
          </h3>
          <p className="mt-1 truncate text-[11px] font-semibold text-[#6f7a72]">
            {asset.fileName}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#eef8ef] px-2.5 py-1 text-[10px] font-extrabold text-[#2f7f53]">
          {asset.status}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[11px] font-semibold leading-4 text-[#657069]">
        <p className="truncate">
          {asset.fileType}
          {asset.fileSize ? ` · ${asset.fileSize}` : ""}
          {asset.archiveCategory ? ` · ${asset.archiveCategory}` : ""}
        </p>
        {asset.artworkId ? <p className="truncate">Artwork ID: {asset.artworkId}</p> : null}
        {asset.brandSubBrand ? <p className="truncate">Brand: {asset.brandSubBrand}</p> : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <AssetPreviewButton
          fileName={asset.fileName}
          mimeType={mimeType}
          previewPath={asset.viewHref}
          downloadPath={asset.downloadHref}
          triggerClassName="min-h-9 w-full justify-center rounded-md border border-brand/35 bg-white px-3 text-[12px] font-semibold text-brand hover:bg-brand-soft/60"
          iconOnly={false}
        />
        {asset.downloadHref ? (
          <Button asChild variant="outline" size="sm" className="min-h-9 text-[12px]">
            <Link href={asset.downloadHref} target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" />
              Download
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function FluxMatchesPanel({
  activeTab,
  onTabChange,
  projectCards,
  archiveAssets,
  hasProjectQuery,
  hasArchiveQuery,
  isSubmitting,
}: {
  activeTab: FluxMatchesTab;
  onTabChange: (tab: FluxMatchesTab) => void;
  projectCards: ProjectCardView[];
  archiveAssets: FluxAIArchiveAssetResult[];
  hasProjectQuery: boolean;
  hasArchiveQuery: boolean;
  isSubmitting: boolean;
}) {
  const isProjectsTab = activeTab === "projects";
  const count = isProjectsTab ? projectCards.length : archiveAssets.length;

  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <PanelIcon>
          <Search className="h-5 w-5" />
        </PanelIcon>
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
            Matches
          </h2>
          <p className="text-[12px] font-semibold text-[#667168]">
            {count ? `${count} result${count === 1 ? "" : "s"}` : "Latest Flux AI context"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 rounded-[14px] bg-[#f5f8f4] p-1">
        {[
          ["projects", `Projects${projectCards.length ? ` ${projectCards.length}` : ""}`],
          ["archives", `Archives${archiveAssets.length ? ` ${archiveAssets.length}` : ""}`],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab as FluxMatchesTab)}
            className={cn(
              "min-h-9 rounded-[11px] px-3 text-[12px] font-extrabold transition-colors",
              activeTab === tab
                ? "bg-white text-brand shadow-[0_8px_18px_rgba(23,39,28,0.06)]"
                : "text-[#687269] hover:text-[#1f2a23]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="mt-4 max-h-[390px] space-y-2 overflow-y-auto pr-1"
        aria-label={isProjectsTab ? "Project Matches" : "Archive Matches"}
      >
        {isProjectsTab ? (
          projectCards.length ? (
            projectCards.slice(0, 8).map((project) => (
              <CompactProjectMatchCard key={project.name} project={project} />
            ))
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#d9e4d9] bg-[#fbfcfa] px-4 py-5 text-center">
              <p className="text-[13px] font-extrabold text-[#263129]">
                {isSubmitting
                  ? "Searching projects..."
                  : hasProjectQuery
                    ? "No projects found."
                    : "No project query yet."}
              </p>
              <p className="mt-1.5 text-[12px] font-medium text-[#758078]">
                {hasProjectQuery || isSubmitting
                  ? "Try searching by project name, executor, category, tag, or status."
                  : "Ask Flux AI to find projects and real matches will appear here."}
              </p>
            </div>
          )
        ) : archiveAssets.length ? (
          archiveAssets.slice(0, 8).map((asset) => (
            <div key={`${asset.recordType}-${asset.id}`} aria-label="Archive Match">
              <CompactArchiveMatchCard asset={asset} />
            </div>
          ))
        ) : (
          <div className="rounded-[16px] border border-dashed border-[#d9e4d9] bg-[#fbfcfa] px-4 py-5 text-center">
            <p className="text-[13px] font-extrabold text-[#263129]">
              {isSubmitting
                ? "Searching archive assets..."
                : hasArchiveQuery
                  ? "No archive assets found."
                  : "No archive search yet."}
            </p>
            <p className="mt-1.5 text-[12px] font-medium text-[#758078]">
              Try searching by file name, artwork ID, brand, archive category, project name, or file type.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function FluxRecentChatsPanel({
  conversations,
  activeConversationId,
  activeConversationTitle,
  isBusy,
  conversationError,
  onNewChat,
  onLoadConversation,
  onDeleteConversation,
}: {
  conversations: FluxAIConversationSummary[];
  activeConversationId: string | null;
  activeConversationTitle: string;
  isBusy: boolean;
  conversationError: string | null;
  onNewChat: () => void;
  onLoadConversation: (conversationId: string) => void;
  onDeleteConversation: (conversation: FluxAIConversationSummary) => void;
}) {
  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
            Recent Chats
          </h2>
          <p className="text-[12px] font-semibold text-[#667168]">
            Conversation history
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-9 shrink-0 text-[12px]"
          onClick={onNewChat}
          disabled={isBusy}
        >
          <Plus className="h-3.5 w-3.5" />
          New Chat
        </Button>
      </div>

      {conversationError ? (
        <p className="mb-3 rounded-[14px] border border-[#f0d4d2] bg-[#fff5f4] px-3 py-2 text-[12px] font-semibold text-[#bd4d45]">
          {conversationError}
        </p>
      ) : null}

      <div className="mb-3 rounded-[14px] border border-[#e1e8df] bg-[#fbfcfa] px-3 py-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#78837b]">
          Current Chat
        </p>
        <p className="mt-1 truncate text-[12px] font-extrabold text-[#1f2a23]">
          {activeConversationTitle}
        </p>
      </div>

      {conversations.length ? (
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;

            return (
              <div
                key={conversation.id}
                className={cn(
                  "group flex min-w-0 items-start gap-2 rounded-[16px] border p-2.5 transition-colors",
                  isActive
                    ? "border-brand/25 bg-[#edf8ef]"
                    : "border-[#e0e7de] bg-white hover:bg-[#f5f8f4]",
                )}
              >
                <button
                  type="button"
                  disabled={isBusy || isActive}
                  onClick={() => onLoadConversation(conversation.id)}
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-75"
                >
                  <span className="block truncate text-[13px] font-extrabold text-[#263129]">
                    {conversation.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[11px] font-semibold leading-4 text-[#7a847c]">
                    {isActive ? "Current Chat" : "Open this Flux AI conversation"}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold text-[#7a847c]">
                    {formatConversationTime(conversation.lastMessageAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-[#8b5a55] opacity-100 transition-colors hover:bg-[#fff1f0] hover:text-[#b83d36] disabled:cursor-not-allowed disabled:opacity-45 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  aria-label={`Delete Flux AI chat ${conversation.title}`}
                  disabled={isBusy}
                  onClick={() => onDeleteConversation(conversation)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-[#d9e4d9] bg-[#fbfcfa] px-4 py-5 text-center">
          <p className="text-[13px] font-extrabold text-[#263129]">
            No recent chats yet.
          </p>
          <p className="mt-1.5 text-[12px] font-medium text-[#758078]">
            Start a conversation and it will appear here.
          </p>
        </div>
      )}
    </Panel>
  );
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[26px] border border-white/75 bg-white shadow-[0_22px_55px_rgba(23,39,28,0.06)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-[#e5f3e8] text-brand shadow-[inset_0_0_0_1px_rgba(43,128,85,0.08)]">
      {children}
    </span>
  );
}

function ChatMessage({
  role,
  content,
  time,
}: {
  role: "user" | "assistant";
  content: string;
  time: string;
}) {
  const isUser = role === "user";
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongMessage = isLongChatContent(content);
  const displayContent =
    isLongMessage && !isExpanded ? getCollapsedChatContent(content) : content;

  return (
    <div
      className={cn(
        "flex items-end gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser ? (
        <span className="grid size-12 shrink-0 place-items-center rounded-full border border-brand/25 bg-white text-brand shadow-[0_12px_28px_rgba(43,128,85,0.08)]">
          <Sparkles className="h-5 w-5" />
        </span>
      ) : null}

      <div
        className={cn(
          "min-w-0 max-w-[620px] rounded-[22px] border px-5 py-4 text-[14px] leading-6 shadow-[0_14px_34px_rgba(23,39,28,0.04)]",
          isUser
            ? "border-[#d9e7d9] bg-[#f4faf4] text-[#1f2a23]"
            : "border-[#e4e9e2] bg-white text-[#4d5850]",
        )}
      >
        <p className="whitespace-pre-line break-words">{displayContent}</p>
        {isLongMessage ? (
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="mt-3 text-[12px] font-extrabold text-brand transition-colors hover:text-[#123f2d]"
          >
            {isExpanded ? "Show less" : "Show full message"}
          </button>
        ) : null}
        <div
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[11px]",
            isUser ? "justify-end text-[#6d7b70]" : "justify-end text-[#89928a]",
          )}
        >
          <span>{time}</span>
          {isUser ? <span className="font-semibold text-brand">Sent</span> : null}
        </div>
      </div>
    </div>
  );
}

function StatusSummaryPanel({
  status,
  blockers,
}: {
  status: FluxAIProjectStatusSummary;
  blockers: string[];
}) {
  const readinessLabel: Record<FluxAIProjectStatusSummary["archiveReadiness"], string> = {
    ready: "Ready for archive",
    blocked: "Blocked",
    completed: "Completed",
    restricted: "Restricted",
    not_ready: "Not ready",
  };

  return (
    <Panel className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PanelIcon>
            <ClipboardCheck className="h-5 w-5" />
          </PanelIcon>
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
              Status Summary
            </h2>
            <p className="truncate text-[13px] font-medium text-[#667168]">
              {status.projectName}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="min-h-10 shrink-0">
          <Link href={status.href}>View Project</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Current Stage", status.currentStage],
          ["Stage Status", status.stageStatus],
          ["Pending Review", status.pendingReviewLabel],
          ["Archive", readinessLabel[status.archiveReadiness]],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-[#e2e9e0] bg-[#f9fbf8] p-4">
            <p className="text-[12px] font-semibold text-[#7a847c]">{label}</p>
            <p className="mt-1 text-[14px] font-extrabold text-[#17211a]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {[
          ["Approval", status.approvalStatus],
          ["Copyright", status.copyrightStatus],
          ["Invoice", status.invoiceStatus],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-[#e2e9e0] bg-white p-4">
            <p className="text-[12px] font-semibold text-[#7a847c]">{label}</p>
            <p className="mt-1 text-[14px] font-extrabold text-[#17211a]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[16px] border border-[#dfe8dd] bg-[#fbfcfa] p-4">
        <p className="text-[12px] font-semibold text-[#7a847c]">Next Action</p>
        <p className="mt-1 text-[14px] font-bold leading-6 text-[#263129]">
          {status.nextRecommendedAction}
        </p>
      </div>

      {blockers.length > 0 ? (
        <div className="mt-4 rounded-[18px] bg-[#fff4f4] p-4">
          <h3 className="text-[13px] font-extrabold text-[#bd4d45]">Blockers</h3>
          <ul className="mt-3 space-y-2 text-[12px] font-semibold text-[#5b403d]">
            {blockers.map((blocker) => (
              <li key={blocker} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d45e55]" />
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function CreatedProjectPanel({
  href,
}: {
  href: string | undefined;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <PanelIcon>
          <ClipboardCheck className="h-5 w-5" />
        </PanelIcon>
        <div className="min-w-0">
          <h2 className="text-[18px] font-extrabold leading-tight text-[#111712]">
            Project Created
          </h2>
          <p className="mt-1 text-[13px] font-medium leading-5 text-[#667168]">
            The project was created after confirmation.
          </p>
        </div>
      </div>

      {href ? (
        <Button asChild size="sm" className="mt-5 min-h-11 w-full">
          <Link href={href}>View Project</Link>
        </Button>
      ) : null}
    </Panel>
  );
}

function DraftSection({
  title,
  children,
  missingFields = [],
}: {
  title: string;
  children: React.ReactNode;
  missingFields?: string[];
}) {
  return (
    <section className="rounded-[20px] border border-[#e3eae1] bg-[#fbfcfa] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-extrabold text-[#17211a]">{title}</h3>
      </div>
      {children}
      {missingFields.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {missingFields.map((field) => (
            <span
              key={field}
              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#bd4d45]"
            >
              {field}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DraftDetail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold text-[#7a847c]">{label}</p>
      <div className="mt-1 break-words text-[13px] font-extrabold leading-5 text-[#202922]">
        {value || "Not set"}
      </div>
    </div>
  );
}

const draftMissingFieldOrder: RegExp[] = [
  /^Project Name$/i,
  /^Category$/i,
  /^Valid Category$/i,
  /^Execution Type$/i,
  /^Valid Project Status$/i,
  /^Project Tags$/i,
  /^Valid Project Tags$/i,
  /^Project Brief$/i,
  /^Start Date$/i,
  /^Valid Start Date$/i,
  /^End Date$/i,
  /^Valid End Date$/i,
  /^Valid Project Timeline$/i,
  /^Budget$/i,
  /^Valid Budget$/i,
  /^Currency$/i,
  /^Valid Currency$/i,
  /^Stage Budgets$/i,
  /^Stage Budget Allocation$/i,
  /^Executor$/i,
  /^Choose Executor$/i,
  /^Valid Executor$/i,
  /^Resolve Collaborators$/i,
  /^Stages$/i,
  /^Stage \d+ Name$/i,
  /^Stage \d+ Brief$/i,
  /^Stage \d+ Start Date$/i,
  /^Valid Stage \d+ Start Date$/i,
  /^Stage \d+ Due Date$/i,
  /^Valid Stage \d+ Due Date$/i,
  /^Stage \d+ Timeline$/i,
  /^Valid Stage \d+ Timeline$/i,
  /^Stage \d+ Timeline Within Project$/i,
];

function getDraftMissingFieldOrderIndex(field: string) {
  const index = draftMissingFieldOrder.findIndex((pattern) => pattern.test(field));

  return index === -1 ? draftMissingFieldOrder.length : index;
}

function sortDraftMissingFields(missingFields: string[]) {
  return [...missingFields].sort((leftField, rightField) => {
    const orderDelta =
      getDraftMissingFieldOrderIndex(leftField) - getDraftMissingFieldOrderIndex(rightField);

    return orderDelta || leftField.localeCompare(rightField);
  });
}

function getSectionMissingFields(missingFields: string[], patterns: RegExp[]) {
  return sortDraftMissingFields(
    missingFields.filter((field) => patterns.some((pattern) => pattern.test(field))),
  );
}

function DraftProjectPreviewPanel({
  draftProject,
  missingFields,
  warnings,
  createError,
  canCreateDraftProject,
  isCreatingProject,
  onCreate,
  onEdit,
  onCancel,
}: {
  draftProject: FluxAIDraftProject;
  missingFields: string[];
  warnings: string[];
  createError: string | null;
  canCreateDraftProject: boolean;
  isCreatingProject: boolean;
  onCreate: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const collaboratorLabels = getDraftCollaboratorLabels(draftProject);
  const orderedMissingFields = sortDraftMissingFields(missingFields);
  const statusIsReady = Boolean(draftProject.canCreate) && missingFields.length === 0;
  const projectMissing = getSectionMissingFields(orderedMissingFields, [
    /^Project Name$/i,
    /^Category$/i,
    /^Valid Category$/i,
    /^Project Tags$/i,
    /^Valid Project Tags$/i,
    /^Execution Type$/i,
    /^Valid Project Status$/i,
    /^Project Brief$/i,
  ]);
  const timelineMissing = getSectionMissingFields(orderedMissingFields, [
    /^Start Date$/i,
    /^Valid Start Date$/i,
    /^End Date$/i,
    /^Valid End Date$/i,
    /^Valid Project Timeline$/i,
    /^Budget$/i,
    /^Valid Budget$/i,
    /^Currency$/i,
    /^Valid Currency$/i,
    /^Stage Budgets$/i,
    /^Stage Budget Allocation$/i,
  ]);
  const executorMissing = getSectionMissingFields(orderedMissingFields, [
    /^Executor$/i,
    /^Choose Executor$/i,
    /^Valid Executor$/i,
  ]);
  const collaboratorMissing = getSectionMissingFields(orderedMissingFields, [
    /^Resolve Collaborators$/i,
  ]);
  const stageMissing = getSectionMissingFields(orderedMissingFields, [
    /^Stages$/i,
    /^Stage \d+ /i,
  ]);

  return (
    <Panel className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PanelIcon>
            <FileText className="h-5 w-5" />
          </PanelIcon>
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
              Draft Project Preview
            </h2>
            <p className="text-[13px] font-medium text-[#667168]">
              Review extracted details before creating.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-[12px] font-extrabold",
            statusIsReady ? "bg-[#e4f6e9] text-[#1f7a4c]" : "bg-[#fff0ef] text-[#bd4d45]",
          )}
        >
          {statusIsReady
            ? "Ready to create"
            : `Missing ${missingFields.length} field${missingFields.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {missingFields.length ? (
        <div className="mb-4 rounded-[18px] border border-[#f2d2d0] bg-[#fff6f5] p-4">
          <h3 className="text-[13px] font-extrabold text-[#bd4d45]">Missing Fields</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {orderedMissingFields.map((field) => (
              <span
                key={field}
                className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#bd4d45]"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <DraftSection title="Project Details" missingFields={projectMissing}>
          <div className="grid gap-3 sm:grid-cols-2">
            <DraftDetail label="Project Name" value={draftProject.projectName} />
            <DraftDetail label="Category" value={draftProject.category} />
            <DraftDetail
              label="Execution"
              value={
                draftProject.executionType === "INTERNAL"
                  ? "Internal"
                  : draftProject.executionType === "EXTERNAL"
                    ? "External"
                    : "Not set"
              }
            />
            <DraftDetail
              label="Tags"
              value={draftProject.tags.length ? draftProject.tags.join(", ") : "Not set"}
            />
            <DraftDetail label="Status" value={draftProject.statusName} />
            <DraftDetail
              label="Priority"
              value={formatProjectPriority(draftProject.priority)}
            />
          </div>
          <div className="mt-3">
            <DraftDetail label="Project Brief" value={draftProject.projectBrief} />
          </div>
        </DraftSection>

        <DraftSection title="Timeline & Budget" missingFields={timelineMissing}>
          <div className="grid gap-3 sm:grid-cols-2">
            <DraftDetail label="Start Date" value={draftProject.startDate} />
            <DraftDetail label="End Date" value={draftProject.endDate} />
            <DraftDetail
              label="Budget Required"
              value={draftProject.budgetRequired === false ? "No" : "Yes"}
            />
            <DraftDetail
              label="Budget"
              value={
                draftProject.budgetRequired
                  ? `${draftProject.budget?.toLocaleString("en-US") ?? "Not set"} ${draftProject.currency ?? ""}`.trim()
                  : "Not required"
              }
            />
          </div>
        </DraftSection>

        <DraftSection title="Executor" missingFields={executorMissing}>
          <DraftDetail
            label="Executor"
            value={
              draftProject.mainExecutorMatch?.selectedName ||
              draftProject.mainExecutor ||
              "Not set"
            }
          />
          {draftProject.mainExecutorMatch?.status &&
          draftProject.mainExecutorMatch.status !== "matched" ? (
            <p className="mt-2 text-[12px] font-semibold text-[#9a681b]">
              Match status: {draftProject.mainExecutorMatch.status.replace("_", " ")}
            </p>
          ) : null}
        </DraftSection>

        <DraftSection title="Collaborators" missingFields={collaboratorMissing}>
          {collaboratorLabels.length ? (
            <div className="flex flex-wrap gap-2">
              {collaboratorLabels.map((collaborator) => (
                <span
                  key={collaborator}
                  className="rounded-full border border-brand/15 bg-white px-3 py-1.5 text-[12px] font-extrabold text-[#236c49]"
                >
                  {collaborator}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] font-semibold text-[#6f7a72]">
              No collaborators extracted.
            </p>
          )}
        </DraftSection>

        <DraftSection title="Stages" missingFields={stageMissing}>
          {draftProject.stages.length ? (
            <ol className="space-y-3">
              {draftProject.stages.map((stage, index) => (
                <li
                  key={`${stage.name || "stage"}-${index}`}
                  className="rounded-[16px] border border-[#e1e8df] bg-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e4f4e8] text-[12px] font-extrabold text-brand">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[14px] font-extrabold text-[#202922]">
                        {stage.name || `Stage ${index + 1}`}
                      </p>
                      {stage.brief ? (
                        <p className="mt-1 break-words text-[12px] font-semibold leading-5 text-[#667168]">
                          {stage.brief}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[12px] font-semibold text-[#7a847c]">
                        {[stage.startDate && stage.dueDate
                          ? `${stage.startDate} to ${stage.dueDate}`
                          : null,
                        stage.budget
                          ? `${stage.budget.toLocaleString("en-US")} ${draftProject.currency ?? ""}`.trim()
                          : null,
                        stage.invoiceRequired === false ? "Invoice not required" : "Invoice required",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] font-semibold text-[#6f7a72]">
              No stages extracted.
            </p>
          )}
        </DraftSection>

        {warnings.length ? (
          <DraftSection title="Warnings">
            <ul className="space-y-2 text-[12px] font-semibold text-[#6a4d22]">
              {warnings.slice(0, 6).map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#c98523]" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </DraftSection>
        ) : null}
      </div>

      {createError ? (
        <p className="mt-4 rounded-[14px] bg-[#fff4f4] px-4 py-3 text-[12px] font-semibold text-[#bd4d45]">
          {createError}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          disabled={!canCreateDraftProject}
          onClick={onCreate}
        >
          {isCreatingProject ? "Creating..." : "Create Project"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={onEdit}
        >
          Edit Details
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </Panel>
  );
}

function DraftProjectEditorPanel({
  draftProject,
  draftOptions,
  error,
  isSaving,
  onChange,
  onSave,
  onCancel,
}: {
  draftProject: FluxAIDraftProject;
  draftOptions: FluxAIDraftOptions;
  error: string | null;
  isSaving: boolean;
  onChange: (draftProject: FluxAIDraftProject) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [mainExecutorQuery, setMainExecutorQuery] = useState("");
  const [collaboratorQuery, setCollaboratorQuery] = useState("");
  const knownCategory = findKnownOption(draftProject.category, draftOptions.categories);
  const categoryIsUnresolved = Boolean(draftProject.category && !knownCategory);
  const selectedCurrency = resolveProjectCurrency(draftProject.currency ?? "");
  const currencyIsUnresolved = Boolean(
    draftProject.currency && !selectedCurrency && draftProject.budgetRequired !== false,
  );
  const selectedPriority = draftProject.priority ?? DEFAULT_PROJECT_PRIORITY;
  const selectedStatusId =
    draftProject.statusId ?? draftOptions.statuses[0]?.id ?? "";
  const selectedStatusName = getDraftStatusLabel(selectedStatusId, draftOptions.statuses);
  const statusIsUnresolved = Boolean(
    selectedStatusId && !draftOptions.statuses.some((status) => status.id === selectedStatusId),
  );
  const mainExecutorMatch = draftProject.mainExecutorMatch ?? null;
  const selectedMainExecutorCandidate = getSelectedCandidate(mainExecutorMatch);
  const collaboratorMatches = draftProject.collaboratorMatches ?? [];
  const selectedCollaboratorIds = new Set(
    [
      ...collaboratorMatches.map((match) => match.selectedUserId),
      selectedMainExecutorCandidate?.id,
    ].filter((value): value is string => Boolean(value)),
  );
  const selectedTagCount = draftProject.tags.length;
  const tagSelectOptions = draftOptions.tags.filter(
    (tag) => !draftProject.tags.some((selectedTag) => normalizeComparable(selectedTag) === normalizeComparable(tag)),
  );
  const mainExecutorOptions = filterCollaboratorOptions({
    collaborators: draftOptions.collaborators,
    query: mainExecutorQuery,
    limit: mainExecutorQuery ? 8 : 5,
  });
  const collaboratorOptions = filterCollaboratorOptions({
    collaborators: draftOptions.collaborators,
    query: collaboratorQuery,
    excludedIds: selectedCollaboratorIds,
    limit: collaboratorQuery ? 8 : 5,
  });

  function updateDraft(patch: Partial<FluxAIDraftProject>) {
    onChange({ ...draftProject, ...patch });
  }

  function updateTags(nextTags: string[]) {
    updateDraft({
      tags: nextTags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, MAX_DRAFT_TAGS),
    });
  }

  function addTag(tag: string) {
    if (
      selectedTagCount >= MAX_DRAFT_TAGS ||
      draftProject.tags.some((selectedTag) => normalizeComparable(selectedTag) === normalizeComparable(tag))
    ) {
      return;
    }

    updateTags([...draftProject.tags, tag]);
  }

  function removeTag(tag: string) {
    updateTags(
      draftProject.tags.filter(
        (selectedTag) => normalizeComparable(selectedTag) !== normalizeComparable(tag),
      ),
    );
  }

  function updateCollaboratorMatches(nextMatches: FluxAIPersonMatch[]) {
    updateDraft({
      collaboratorMatches: nextMatches,
      collaborators: nextMatches
        .map((match) => match.selectedName || match.requestedName)
        .map((name) => name.trim())
        .filter(Boolean),
    });
  }

  function selectMainExecutor(candidate: FluxAIPersonCandidate, match = mainExecutorMatch) {
    const collaborator = findCollaboratorByCandidate(candidate, draftOptions.collaborators);
    const nextMatch = collaborator
      ? buildMatchedPersonFromCollaborator(collaborator, match)
      : buildMatchedPersonFromCandidate(candidate, match);

    updateDraft({
      mainExecutor: nextMatch.selectedName,
      mainExecutorMatch: nextMatch,
    });
    setMainExecutorQuery("");
  }

  function selectMainExecutorRecord(collaborator: CollaboratorRecord) {
    const nextMatch = buildMatchedPersonFromCollaborator(collaborator, mainExecutorMatch);

    updateDraft({
      mainExecutor: nextMatch.selectedName,
      mainExecutorMatch: nextMatch,
    });
    setMainExecutorQuery("");
  }

  function clearMainExecutor() {
    updateDraft({
      mainExecutor: null,
      mainExecutorMatch: {
        requestedName: "",
        status: "missing",
        selectedUserId: null,
        selectedName: null,
        selectedEmail: null,
        candidates: [],
      },
    });
  }

  function addCollaborator(collaborator: CollaboratorRecord) {
    const nextMatch = buildMatchedPersonFromCollaborator(collaborator);
    const nextMatches = [
      ...collaboratorMatches.filter((match) => match.selectedUserId !== collaborator.id),
      nextMatch,
    ];

    updateCollaboratorMatches(nextMatches);
    setCollaboratorQuery("");
  }

  function selectCollaboratorCandidate(index: number, candidate: FluxAIPersonCandidate) {
    const currentMatch = collaboratorMatches[index] ?? null;
    const collaborator = findCollaboratorByCandidate(candidate, draftOptions.collaborators);
    const nextMatch = collaborator
      ? buildMatchedPersonFromCollaborator(collaborator, currentMatch)
      : buildMatchedPersonFromCandidate(candidate, currentMatch);

    updateCollaboratorMatches(
      collaboratorMatches.map((match, matchIndex) =>
        matchIndex === index ? nextMatch : match,
      ),
    );
  }

  function removeCollaborator(index: number) {
    updateCollaboratorMatches(
      collaboratorMatches.filter((_, matchIndex) => matchIndex !== index),
    );
  }

  function updateCollaboratorPermission(
    index: number,
    permissionKey: ProjectCollaboratorPermissionKey,
    checked: boolean,
  ) {
    updateCollaboratorMatches(
      collaboratorMatches.map((match, matchIndex) => {
        if (matchIndex !== index) {
          return match;
        }

        const candidate = getSelectedCandidate(match);
        const currentPermissions = getMatchPermissions(match, candidate);
        const nextPermissions = normalizeProjectCollaboratorPermissions(
          {
            ...currentPermissions,
            [permissionKey]: checked,
          },
          candidate?.type ?? null,
        );

        return {
          ...match,
          permissions: nextPermissions,
        };
      }),
    );
  }

  function updateStage(index: number, patch: Partial<FluxAIDraftProject["stages"][number]>) {
    updateDraft({
      stages: draftProject.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    });
  }

  function addStage() {
    updateDraft({
      stages: [
        ...draftProject.stages,
        {
          name: "",
          brief: "",
          budget: null,
          startDate: null,
          dueDate: null,
          invoiceRequired: draftProject.executionType === "EXTERNAL",
        },
      ],
    });
  }

  function removeStage(index: number) {
    updateDraft({
      stages: draftProject.stages.filter((_, stageIndex) => stageIndex !== index),
    });
  }

  return (
    <Panel className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PanelIcon>
            <FileText className="h-5 w-5" />
          </PanelIcon>
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
              Edit Draft Details
            </h2>
            <p className="text-[13px] font-medium text-[#667168]">
              Update the draft preview. This does not create a project.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-[14px] bg-[#fff4f4] px-4 py-3 text-[12px] font-semibold text-[#bd4d45]">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        <DraftSection title="Project Details">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Project name
              <Input
                value={draftProject.projectName}
                onChange={(event) => updateDraft({ projectName: event.target.value })}
                disabled={isSaving}
              />
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Category
              <Select
                key={`flux-draft-category-${knownCategory ?? "unresolved"}-${draftOptions.categories.join("\u001f")}`}
                value={knownCategory ?? ""}
                disabled={isSaving || draftOptions.categories.length === 0}
                onValueChange={(value) => updateDraft({ category: value })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue
                    placeholder={
                      draftOptions.categories.length ? "Select project category" : "No categories available"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {draftOptions.categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoryIsUnresolved ? (
                <span className="block rounded-[12px] bg-[#fff7e7] px-3 py-2 text-[11px] font-semibold leading-4 text-[#8a621f]">
                  {`"${draftProject.category}" is not an active category. Select an existing category before creating.`}{" "}
                  {draftOptions.canManageProjectMasterData
                    ? "Create new categories from Project Master Data when needed."
                    : "Ask an admin to add new categories when needed."}
                </span>
              ) : null}
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Execution type
              <Select
                value={draftProject.executionType ?? "EXTERNAL"}
                disabled={isSaving}
                onValueChange={(value) =>
                  updateDraft({
                    executionType: value === "INTERNAL" ? "INTERNAL" : "EXTERNAL",
                  })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXTERNAL">External</SelectItem>
                  <SelectItem value="INTERNAL">Internal</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Project status
              <Select
                key={`flux-draft-status-${selectedStatusId}-${draftOptions.statuses.map((status) => status.id).join("\u001f")}`}
                value={selectedStatusId}
                disabled={isSaving || draftOptions.statuses.length === 0}
                onValueChange={(value) => {
                  const status = draftOptions.statuses.find((option) => option.id === value);

                  updateDraft({
                    statusId: value,
                    statusName: status?.name ?? null,
                  });
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue
                    placeholder={
                      draftOptions.statuses.length ? "Select project status" : "No statuses available"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {draftOptions.statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      <span className="flex items-center gap-2">
                        {status.color ? (
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: status.color }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span>{status.name}</span>
                        <span className="text-[11px] text-[#8a938b]">
                          {status.groupName}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStatusName && !statusIsUnresolved ? (
                <span className="block text-[11px] font-semibold text-[#7a847c]">
                  Selected status: {selectedStatusName}
                </span>
              ) : null}
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Project priority
              <Select
                value={selectedPriority}
                disabled={isSaving}
                onValueChange={(value) =>
                  updateDraft({ priority: value as ProjectPriorityValue })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectPriorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="block text-[11px] font-semibold text-[#7a847c]">
                {formatProjectPriority(selectedPriority)}
              </span>
            </label>
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-[12px] font-bold text-[#667168]">Tags</p>
              {draftProject.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {draftProject.tags.map((tag) => {
                    const knownTag = hasKnownOption(tag, draftOptions.tags);

                    return (
                      <span
                        key={tag}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold",
                          knownTag
                            ? "border-[#cde6d3] bg-[#edf7ef] text-[#2d8055]"
                            : "border-[#f1d7aa] bg-[#fff7e7] text-[#8a621f]",
                        )}
                      >
                        <span className="truncate">{tag}</span>
                        {!knownTag ? (
                          <span className="text-[10px] uppercase tracking-[0.08em]">
                            Needs selection
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors hover:bg-white"
                          aria-label={`Remove ${tag}`}
                          disabled={isSaving}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <Select
                key={`flux-draft-tags-${draftProject.tags.join("\u001f") || "empty"}-${draftOptions.tags.join("\u001f")}`}
                value=""
                disabled={isSaving || selectedTagCount >= MAX_DRAFT_TAGS || tagSelectOptions.length === 0}
                onValueChange={(value) => {
                  if (value) {
                    addTag(value);
                  }
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue
                    placeholder={
                      selectedTagCount >= MAX_DRAFT_TAGS
                        ? "Maximum tags selected"
                        : tagSelectOptions.length
                          ? "Select project tags"
                          : "No more tags available"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {tagSelectOptions.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      <span className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 opacity-0" />
                        <span>{tag}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] font-semibold text-[#7a847c]">
                Select up to {MAX_DRAFT_TAGS} active tags. Unknown AI-extracted tags stay unresolved until replaced.
                {" "}
                {draftOptions.canManageProjectMasterData
                  ? "Create new tags from Project Master Data when needed."
                  : "Ask an admin to add new tags when needed."}
              </p>
            </div>
          </div>
          <label className="mt-3 block space-y-1.5 text-[12px] font-bold text-[#667168]">
            Project brief
            <Textarea
              value={draftProject.projectBrief}
              onChange={(event) => updateDraft({ projectBrief: event.target.value })}
              disabled={isSaving}
              className="min-h-28 bg-white"
            />
          </label>
        </DraftSection>

        <DraftSection title="Timeline & Budget">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Start date
              <AppDatePicker
                value={toDateInputValue(draftProject.startDate)}
                onChange={(value) => updateDraft({ startDate: value || null })}
                placeholder="Select start date"
                disabled={isSaving}
                clearable
              />
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              End date
              <AppDatePicker
                value={toDateInputValue(draftProject.endDate)}
                onChange={(value) => updateDraft({ endDate: value || null })}
                placeholder="Select end date"
                disabled={isSaving}
                clearable
              />
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Budget required
              <Select
                value={draftProject.budgetRequired === false ? "false" : "true"}
                disabled={isSaving}
                onValueChange={(value) =>
                  updateDraft({ budgetRequired: value === "true" })
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Budget
              <Input
                inputMode="numeric"
                value={formatOptionalNumber(draftProject.budget)}
                onChange={(event) => updateDraft({ budget: parseOptionalNumber(event.target.value) })}
                disabled={isSaving || draftProject.budgetRequired === false}
              />
            </label>
            <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
              Currency
              <Select
                key={`flux-draft-currency-${selectedCurrency ?? "unresolved"}`}
                value={selectedCurrency ?? ""}
                disabled={isSaving || draftProject.budgetRequired === false}
                onValueChange={(value) => updateDraft({ currency: value })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_CURRENCY_OPTIONS.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currencyIsUnresolved ? (
                <span className="block rounded-[12px] bg-[#fff7e7] px-3 py-2 text-[11px] font-semibold leading-4 text-[#8a621f]">
                  {`"${draftProject.currency}" is not supported. Select AED, USD, or EUR.`}
                </span>
              ) : null}
            </label>
          </div>
        </DraftSection>

        <DraftSection title="Executor & Collaborators">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[12px] font-bold text-[#667168]">Main executor</p>
              {selectedMainExecutorCandidate ? (
                <div className="rounded-[16px] border border-[#dce8de] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-extrabold text-[#17211a]">
                        {selectedMainExecutorCandidate.name}
                      </p>
                      <p className="truncate text-[12px] font-semibold text-[#667168]">
                        {selectedMainExecutorCandidate.email}
                      </p>
                      <span className="mt-2 inline-flex rounded-full bg-[#eef8f0] px-2.5 py-1 text-[11px] font-bold text-[#2d8055]">
                        {selectedMainExecutorCandidate.typeLabel}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-[#bd4d45]"
                      onClick={clearMainExecutor}
                      disabled={isSaving}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : null}
              {mainExecutorMatch?.status === "multiple" ? (
                <div className="rounded-[16px] border border-[#f1d7aa] bg-[#fffaf0] p-3">
                  <p className="text-[12px] font-extrabold text-[#8a621f]">
                    {`Multiple matches for "${mainExecutorMatch.requestedName}"`}
                  </p>
                  <div className="mt-3 space-y-2">
                    {mainExecutorMatch.candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#e1e8df] bg-white px-3 py-2 text-left transition hover:border-brand/60"
                        onClick={() => selectMainExecutor(candidate)}
                        disabled={isSaving}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-extrabold text-[#17211a]">
                            {candidate.name}
                          </span>
                          <span className="block truncate text-[11px] font-semibold text-[#667168]">
                            {candidate.email}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold text-[#2d8055]">
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : mainExecutorMatch?.status === "not_found" ? (
                <p className="rounded-[14px] bg-[#fff7e7] px-3 py-2 text-[11px] font-semibold text-[#8a621f]">
                  {`No existing collaborator matched "${mainExecutorMatch.requestedName}". Search and select a collaborator.`}
                </p>
              ) : null}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a938b]" />
                <Input
                  value={mainExecutorQuery}
                  onChange={(event) => setMainExecutorQuery(event.target.value)}
                  disabled={isSaving}
                  placeholder="Search existing executor..."
                  className="pl-9"
                />
              </div>
              <div className="space-y-2">
                {mainExecutorOptions.map((collaborator) => (
                  <button
                    key={collaborator.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#e1e8df] bg-white px-3 py-2 text-left transition hover:border-brand/60"
                    onClick={() => selectMainExecutorRecord(collaborator)}
                    disabled={isSaving}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-extrabold text-[#17211a]">
                        {collaborator.name}
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-[#667168]">
                        {collaborator.email}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[#f2f7f3] px-2.5 py-1 text-[11px] font-bold text-[#467356]">
                      {collaborator.typeLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[12px] font-bold text-[#667168]">Collaborators</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a938b]" />
                <Input
                  value={collaboratorQuery}
                  onChange={(event) => setCollaboratorQuery(event.target.value)}
                  disabled={isSaving}
                  placeholder="Search existing collaborators..."
                  className="pl-9"
                />
              </div>
              <div className="space-y-2">
                {collaboratorOptions.map((collaborator) => (
                  <button
                    key={collaborator.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#e1e8df] bg-white px-3 py-2 text-left transition hover:border-brand/60"
                    onClick={() => addCollaborator(collaborator)}
                    disabled={isSaving}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-extrabold text-[#17211a]">
                        {collaborator.name}
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-[#667168]">
                        {collaborator.email}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-brand" />
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {collaboratorMatches.map((match, index) => {
                  const selectedCandidate = getSelectedCandidate(match);

                  if (!selectedCandidate) {
                    return (
                      <div
                        key={`${match.requestedName || "unresolved"}-${index}`}
                        className="rounded-[16px] border border-[#f1d7aa] bg-[#fffaf0] p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-extrabold text-[#8a621f]">
                              {match.requestedName || "Unresolved collaborator"}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-[#8a621f]">
                              {match.status === "multiple"
                                ? "Choose one existing collaborator."
                                : "Search and select an existing collaborator."}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[#bd4d45]"
                            onClick={() => removeCollaborator(index)}
                            disabled={isSaving}
                          >
                            Remove
                          </Button>
                        </div>
                        {match.candidates.length ? (
                          <div className="mt-3 space-y-2">
                            {match.candidates.map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#e1e8df] bg-white px-3 py-2 text-left transition hover:border-brand/60"
                                onClick={() => selectCollaboratorCandidate(index, candidate)}
                                disabled={isSaving}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-extrabold text-[#17211a]">
                                    {candidate.name}
                                  </span>
                                  <span className="block truncate text-[11px] font-semibold text-[#667168]">
                                    {candidate.email}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[11px] font-bold text-[#2d8055]">
                                  Select
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  const permissions = getMatchPermissions(match, selectedCandidate);
                  const isClientOfGti = isClientOfGtiParticipantType(selectedCandidate.type);

                  return (
                    <div
                      key={`${selectedCandidate.id}-${index}`}
                      className="rounded-[16px] border border-[#dce8de] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-extrabold text-[#17211a]">
                            {selectedCandidate.name}
                          </p>
                          <p className="truncate text-[12px] font-semibold text-[#667168]">
                            {selectedCandidate.email}
                          </p>
                          <span className="mt-2 inline-flex rounded-full bg-[#eef8f0] px-2.5 py-1 text-[11px] font-bold text-[#2d8055]">
                            {selectedCandidate.typeLabel}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[#bd4d45]"
                          onClick={() => removeCollaborator(index)}
                          disabled={isSaving}
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {projectCollaboratorPermissionKeys.map((permissionKey) => {
                          const archiveRestricted =
                            permissionKey === "canAccessProjectArchives" && isClientOfGti;

                          return (
                            <label
                              key={permissionKey}
                              className={cn(
                                "flex items-center justify-between gap-3 rounded-[12px] border border-[#edf1ec] bg-[#fbfcfa] px-3 py-2 text-[11px] font-bold text-[#526057]",
                                archiveRestricted ? "opacity-70" : "",
                              )}
                            >
                              <span>{projectCollaboratorPermissionLabels[permissionKey]}</span>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[#1f7a4c]"
                                checked={
                                  archiveRestricted ? false : permissions[permissionKey]
                                }
                                disabled={isSaving || archiveRestricted}
                                onChange={(event) =>
                                  updateCollaboratorPermission(
                                    index,
                                    permissionKey,
                                    event.target.checked,
                                  )
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                      {isClientOfGti ? (
                        <p className="mt-2 text-[11px] font-semibold text-[#8a621f]">
                          Client of GTI collaborators cannot access project archives.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DraftSection>

        <DraftSection title="Stages">
          <div className="space-y-3">
            {draftProject.stages.map((stage, index) => (
              <div
                key={`${stage.name || "stage"}-${index}`}
                className="rounded-[18px] border border-[#e1e8df] bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-[13px] font-extrabold text-[#17211a]">
                    Stage {index + 1}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-[#bd4d45]"
                    onClick={() => removeStage(index)}
                    disabled={isSaving || draftProject.stages.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
                    Stage name
                    <Input
                      value={stage.name}
                      onChange={(event) => updateStage(index, { name: event.target.value })}
                      disabled={isSaving}
                    />
                  </label>
                  <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
                    Stage budget
                    <Input
                      inputMode="numeric"
                      value={formatOptionalNumber(stage.budget)}
                      onChange={(event) =>
                        updateStage(index, { budget: parseOptionalNumber(event.target.value) })
                      }
                      disabled={isSaving || draftProject.budgetRequired === false}
                    />
                  </label>
                  <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
                    Start date
                    <AppDatePicker
                      value={toDateInputValue(stage.startDate)}
                      onChange={(value) => updateStage(index, { startDate: value || null })}
                      placeholder="Select stage start"
                      disabled={isSaving}
                      clearable
                    />
                  </label>
                  <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
                    Due date
                    <AppDatePicker
                      value={toDateInputValue(stage.dueDate)}
                      onChange={(value) => updateStage(index, { dueDate: value || null })}
                      placeholder="Select due date"
                      disabled={isSaving}
                      clearable
                    />
                  </label>
                  <label className="space-y-1.5 text-[12px] font-bold text-[#667168]">
                    Invoice required
                    <Select
                      value={stage.invoiceRequired === false ? "false" : "true"}
                      disabled={isSaving || draftProject.executionType === "INTERNAL"}
                      onValueChange={(value) =>
                        updateStage(index, { invoiceRequired: value === "true" })
                      }
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <label className="mt-3 block space-y-1.5 text-[12px] font-bold text-[#667168]">
                  Stage brief
                  <Textarea
                    value={stage.brief}
                    onChange={(event) => updateStage(index, { brief: event.target.value })}
                    disabled={isSaving}
                    className="min-h-24 bg-white"
                  />
                </label>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 min-h-10 w-full"
            onClick={addStage}
            disabled={isSaving}
          >
            <Plus className="h-4 w-4" />
            Add Stage
          </Button>
        </DraftSection>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button type="button" size="sm" className="min-h-11" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Details"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel Edit
        </Button>
      </div>
    </Panel>
  );
}

export function FluxAiWorkspace({
  draftOptions = emptyDraftOptions,
}: FluxAiWorkspaceProps) {
  const [messages, setMessages] = useState<ChatEntry[]>(initialChatMessages);
  const [conversations, setConversations] = useState<FluxAIConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationTitle, setActiveConversationTitle] =
    useState("New Flux AI Chat");
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [conversationPendingDelete, setConversationPendingDelete] =
    useState<FluxAIConversationSummary | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [deleteConversationError, setDeleteConversationError] =
    useState<string | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [fluxResponse, setFluxResponse] = useState<FluxAIChatResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isResultPanelOpen, setIsResultPanelOpen] = useState(false);
  const [activeMatchesTab, setActiveMatchesTab] = useState<FluxMatchesTab>("projects");
  const [draftEditValue, setDraftEditValue] = useState<FluxAIDraftProject | null>(null);
  const [draftEditError, setDraftEditError] = useState<string | null>(null);
  const [isValidatingDraftEdit, setIsValidatingDraftEdit] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedOutputLanguageCode, setSelectedOutputLanguageCode] = useState(
    DEFAULT_CHAT_LANGUAGE.code,
  );
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const composerValueRef = useRef(composerValue);
  const draftProject = fluxResponse?.draftProject ?? null;
  const projectCards = useMemo(
    () => (fluxResponse?.projects ?? []).map(mapProjectResultToCard),
    [fluxResponse],
  );
  const archiveAssets = fluxResponse?.archiveAssets ?? [];
  const missingFields =
    draftProject
      ? fluxResponse?.missingFields ?? draftProject.missingFields ?? []
      : [];
  const draftWarnings = getDraftWarnings(fluxResponse);
  const blockers = useMemo(
    () =>
      fluxResponse?.blockers?.length
        ? fluxResponse.blockers
        : fluxResponse?.projects
            ?.flatMap((project) => project.archiveBlockers ?? [])
            .filter(Boolean) ?? [],
    [fluxResponse],
  );
  const shouldShowProjectMatchesPanel = shouldShowProjectMatches(fluxResponse);
  const shouldShowArchiveMatchesPanel = shouldShowArchiveMatches(fluxResponse);
  const shouldShowStatusSummaryPanel = Boolean(fluxResponse?.projectStatus);
  const shouldShowCreatedProjectPanel = fluxResponse?.type === "created_project";
  const shouldShowDraftPanel =
    Boolean(draftProject) && !shouldShowCreatedProjectPanel;
  const shouldShowStandaloneBlockersPanel =
    blockers.length > 0 && !shouldShowStatusSummaryPanel && !shouldShowDraftPanel;
  const hasResultContent = hasFluxResultContent(fluxResponse);
  const shouldShowResultPanel = hasResultContent && isResultPanelOpen;
  const hasUserStartedConversation = messages.some((message) => message.role === "user");
  const canCreateDraftProject =
    Boolean(draftProject?.canCreate) && missingFields.length === 0 && !isCreatingProject;
  const selectedOutputLanguage =
    getSupportedLanguageByCode(selectedOutputLanguageCode) ?? DEFAULT_CHAT_LANGUAGE;

  function applyFluxResponse(payload: FluxAIChatResponse | null) {
    setFluxResponse(payload);
    setIsResultPanelOpen(hasFluxResultContent(payload));

    const preferredTab = getPreferredMatchesTab(payload);
    if (preferredTab) {
      setActiveMatchesTab(preferredTab);
    }
  }

  useEffect(() => {
    composerValueRef.current = composerValue;
  }, [composerValue]);

  useEffect(() => {
    return () => {
      clearRecorderResources();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    void loadInitialConversation();
    // Restore the URL-selected/latest conversation once on page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetToWelcomeState() {
    setMessages(initialChatMessages);
    applyFluxResponse(null);
    setActiveMatchesTab("projects");
    setDraftEditValue(null);
    setDraftEditError(null);
    setCreateError(null);
    setComposerError(null);
  }

  async function refreshConversationList() {
    const response = await fetch("/api/flux-ai/conversations", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to load Flux AI conversations.");
    }

    const payload = (await response.json()) as ConversationsListApiResponse;
    setConversations(payload.conversations);

    return payload;
  }

  async function loadConversation(
    conversationId: string,
    options: { updateUrl?: boolean; manageLoading?: boolean } = {},
  ) {
    if (options.manageLoading ?? true) {
      setIsLoadingConversation(true);
    }

    setConversationError(null);

    try {
      const response = await fetch(
        `/api/flux-ai/conversations/${encodeURIComponent(conversationId)}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Flux AI conversation not found."
            : "Unable to load Flux AI conversation.",
        );
      }

      const detail = (await response.json()) as FluxAIConversationDetail;

      setActiveConversationId(detail.conversation.id);
      setActiveConversationTitle(detail.conversation.title);
      setMessages(mapConversationMessagesToChatEntries(detail));
      applyFluxResponse(detail.latestResponse);
      setDraftEditValue(null);
      setDraftEditError(null);
      setCreateError(null);
      setComposerError(null);

      if (options.updateUrl ?? true) {
        replaceConversationUrl(detail.conversation.id);
      }
    } catch (error) {
      resetToWelcomeState();
      setActiveConversationId(null);
      setActiveConversationTitle("New Flux AI Chat");
      replaceConversationUrl(null);
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to load Flux AI conversation.",
      );
    } finally {
      if (options.manageLoading ?? true) {
        setIsLoadingConversation(false);
      }
    }
  }

  async function loadInitialConversation() {
    setIsLoadingConversation(true);
    setConversationError(null);

    try {
      const payload = await refreshConversationList();
      const requestedConversationId = getConversationIdFromUrl();
      const targetConversationId =
        requestedConversationId ?? payload.latestConversationId;

      if (!targetConversationId) {
        resetToWelcomeState();
        setActiveConversationId(null);
        setActiveConversationTitle("New Flux AI Chat");
        replaceConversationUrl(null);
        return;
      }

      await loadConversation(targetConversationId, {
        updateUrl: true,
        manageLoading: false,
      });
    } catch (error) {
      resetToWelcomeState();
      setActiveConversationId(null);
      setActiveConversationTitle("New Flux AI Chat");
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to load Flux AI conversations.",
      );
    } finally {
      setIsLoadingConversation(false);
    }
  }

  async function startNewConversation() {
    if (isSubmitting || isCreatingProject) {
      return;
    }

    setIsLoadingConversation(true);
    setConversationError(null);

    try {
      const response = await fetch("/api/flux-ai/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Unable to start a new Flux AI chat.");
      }

      const payload = (await response.json()) as CreateConversationApiResponse;

      setConversations((current) => [
        payload.conversation,
        ...current.filter((conversation) => conversation.id !== payload.conversation.id),
      ]);
      setActiveConversationId(payload.conversation.id);
      setActiveConversationTitle(payload.conversation.title);
      replaceConversationUrl(payload.conversation.id);
      resetToWelcomeState();
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to start a new Flux AI chat.",
      );
    } finally {
      setIsLoadingConversation(false);
    }
  }

  async function clearPersistedConversationState() {
    if (!activeConversationId) {
      return;
    }

    await fetch(
      `/api/flux-ai/conversations/${encodeURIComponent(activeConversationId)}/clear-state`,
      {
        method: "POST",
      },
    ).catch(() => undefined);
    void refreshConversationList().catch(() => undefined);
  }

  async function confirmDeleteConversation() {
    if (!conversationPendingDelete || isDeletingConversation) {
      return;
    }

    const conversationToDelete = conversationPendingDelete;

    setIsDeletingConversation(true);
    setDeleteConversationError(null);

    try {
      const response = await fetch(
        `/api/flux-ai/conversations/${encodeURIComponent(conversationToDelete.id)}`,
        {
          method: "DELETE",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete Flux AI chat.");
      }

      const remainingConversations = conversations.filter(
        (conversation) => conversation.id !== conversationToDelete.id,
      );

      setConversations(remainingConversations);
      setConversationPendingDelete(null);
      showSuccessToast("Flux AI chat deleted.");

      if (conversationToDelete.id !== activeConversationId) {
        return;
      }

      const nextConversation = remainingConversations[0] ?? null;

      if (nextConversation) {
        await loadConversation(nextConversation.id, {
          updateUrl: true,
          manageLoading: true,
        });
        return;
      }

      resetToWelcomeState();
      setActiveConversationId(null);
      setActiveConversationTitle("New Flux AI Chat");
      replaceConversationUrl(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete Flux AI chat.";

      setDeleteConversationError(message);
      showErrorToast("Unable to delete Flux AI chat.", message);
    } finally {
      setIsDeletingConversation(false);
    }
  }

  function clearRecorderResources() {
    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
  }

  const translateComposerText = useCallback(async () => {
    const sourceText = composerValueRef.current.trim();

    if (!sourceText) {
      setComposerError("Enter a message to translate.");
      return;
    }

    setComposerError(null);
    setAiStatus("Translating...");
    setIsTranslating(true);

    try {
      const response = await fetch("/api/ai/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: sourceText,
          targetLanguageCode: selectedOutputLanguage.code,
          targetLanguageName: selectedOutputLanguage.name,
        }),
      });
      const payload = (await response.json()) as TranslateApiResponse;

      if (!response.ok || !payload.translatedText) {
        throw new Error(payload.error || "Unable to translate the message right now.");
      }

      if (composerValueRef.current.trim() === sourceText) {
        setComposerValue(payload.translatedText);
      }
    } catch (error) {
      setComposerError(
        error instanceof Error
          ? error.message
          : "Unable to translate the message right now.",
      );
    } finally {
      setIsTranslating(false);
      setAiStatus(null);
    }
  }, [selectedOutputLanguage.code, selectedOutputLanguage.name]);

  function getRecordingMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }

    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];

    return (
      preferredTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ""
    );
  }

  async function handleRecordedAudio(blob: Blob) {
    const extension = blob.type.includes("mp4")
      ? "m4a"
      : blob.type.includes("ogg")
        ? "ogg"
        : "webm";
    const audioFile = new File([blob], `flux-ai-${Date.now()}.${extension}`, {
      type: blob.type || "audio/webm",
    });

    setIsTranscribing(true);
    setAiStatus("Transcribing...");
    setComposerError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("targetLanguageCode", selectedOutputLanguage.code);
      formData.append("targetLanguageName", selectedOutputLanguage.name);

      const response = await fetch("/api/ai/transcribe", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as TranscribeApiResponse;

      if (!response.ok || !payload.translatedText) {
        throw new Error(payload.error || "Unable to transcribe the recording right now.");
      }

      setComposerValue((current) =>
        current.trim() ? `${current.trim()}\n${payload.translatedText}` : payload.translatedText,
      );
    } catch (error) {
      setComposerError(
        error instanceof Error
          ? error.message
          : "Unable to transcribe the recording right now.",
      );
    } finally {
      setIsTranscribing(false);
      setAiStatus(null);
    }
  }

  async function handleMicrophoneToggle() {
    if (isTranscribing || isTranslating) {
      return;
    }

    if (isListening) {
      setAiStatus("Transcribing...");
      mediaRecorderRef.current?.stop();
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setComposerError(
        "Voice input is not supported in this browser. Try Chrome, Edge, or Safari with microphone access enabled.",
      );
      return;
    }

    try {
      setComposerError(null);
      setAiStatus("Requesting microphone...");

      if ("permissions" in navigator && navigator.permissions?.query) {
        try {
          const permissionStatus = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });

          if (permissionStatus.state === "denied") {
            setAiStatus(null);
            setComposerError(
              "Microphone permission is blocked in the browser. Allow microphone access in site settings and try again.",
            );
            return;
          }
        } catch {
          // Browser support for querying microphone permission varies.
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setAiStatus("Listening...");
      setIsListening(true);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        setIsListening(false);
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        clearRecorderResources();

        if (!audioBlob.size) {
          setAiStatus(null);
          setComposerError("No speech was captured. Please try again.");
          return;
        }

        void handleRecordedAudio(audioBlob);
      });

      recorder.start();
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          setAiStatus("Transcribing...");
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_DURATION_MS);
    } catch (error) {
      setIsListening(false);
      setAiStatus(null);
      clearRecorderResources();
      setComposerError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : error instanceof DOMException && error.name === "NotFoundError"
            ? "No microphone was found on this device."
            : error instanceof DOMException && error.name === "NotReadableError"
              ? "The microphone is already being used by another application."
              : "Unable to access the microphone right now.",
      );
    }
  }

  function openDraftEditor() {
    if (!draftProject) {
      return;
    }

    setDraftEditError(null);
    setDraftEditValue(cloneDraftProject(draftProject));
  }

  function cancelDraftEdit() {
    setDraftEditValue(null);
    setDraftEditError(null);
  }

  async function saveDraftEdit() {
    if (!draftEditValue || isValidatingDraftEdit) {
      return;
    }

    setIsValidatingDraftEdit(true);
    setDraftEditError(null);
    setCreateError(null);

    try {
      const response = await fetch("/api/flux-ai/validate-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftProject: draftEditValue,
          conversationId: activeConversationId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | FluxAIChatResponse
        | null;

      if (!payload) {
        throw new Error("Flux AI returned an invalid draft validation response.");
      }

      if (!response.ok || !payload.draftProject) {
        throw new Error(payload.assistantMessage || "Unable to validate the draft.");
      }

      applyFluxResponse(payload);
      setDraftEditValue(null);
      void refreshConversationList().catch(() => undefined);
    } catch (error) {
      setDraftEditError(
        error instanceof Error
          ? error.message
          : "Unable to validate the draft right now.",
      );
    } finally {
      setIsValidatingDraftEdit(false);
    }
  }

  async function submitPrompt(nextPrompt?: string) {
    const prompt = (nextPrompt ?? composerValue).trim();

    if (!prompt || isSubmitting || isLoadingConversation) {
      return;
    }

    const userMessage: ChatEntry = {
      id: createMessageId(),
      role: "user",
      content: prompt,
      time: formatChatTime(),
    };
    const nextMessages = [...messages, userMessage];
    const thinkingMessage: ChatEntry = {
      id: createMessageId(),
      role: "assistant",
      content: "Flux AI is thinking...",
      time: formatChatTime(),
    };

    setMessages([...nextMessages, thinkingMessage]);
    setComposerValue("");
    setComposerError(null);
    setCreateError(null);
    setFluxResponse(null);
    setIsResultPanelOpen(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/flux-ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          conversationId: activeConversationId,
          conversation: messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          draftProject,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | FluxAIChatResponse
        | null;

      if (!payload) {
        throw new Error("Flux AI returned an invalid response.");
      }

      if (payload.conversationId) {
        setActiveConversationId(payload.conversationId);
        replaceConversationUrl(payload.conversationId);
      }

      if (payload.conversationTitle) {
        setActiveConversationTitle(payload.conversationTitle);
      }

      applyFluxResponse(payload);
      setMessages([
        ...nextMessages,
        {
          id: createMessageId(),
          role: "assistant",
          content: payload.assistantMessage,
          time: formatChatTime(),
        },
      ]);

      if (!response.ok) {
        setComposerError(payload.assistantMessage);
      }

      void refreshConversationList().catch(() => undefined);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Flux AI could not process the request right now.";

      setComposerError(message);
      setFluxResponse(null);
      setIsResultPanelOpen(false);
      setMessages([
        ...nextMessages,
        {
          id: createMessageId(),
          role: "assistant",
          content: message,
          time: formatChatTime(),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createDraftProject() {
    if (!draftProject || !canCreateDraftProject) {
      return;
    }

    setIsCreatingProject(true);
    setCreateError(null);
    setComposerError(null);

    try {
      const response = await fetch("/api/flux-ai/create-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftProject,
          conversationId: activeConversationId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | FluxAIChatResponse
        | null;

      if (!payload) {
        throw new Error("Flux AI returned an invalid project creation response.");
      }

      if (payload.conversationId) {
        setActiveConversationId(payload.conversationId);
        replaceConversationUrl(payload.conversationId);
      }

      applyFluxResponse(payload);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: "assistant",
          content: payload.assistantMessage,
          time: formatChatTime(),
        },
      ]);

      if (!response.ok) {
        setCreateError(payload.assistantMessage);
      }

      void refreshConversationList().catch(() => undefined);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Flux AI could not create the project right now.";

      setCreateError(message);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: "assistant",
          content: message,
          time: formatChatTime(),
        },
      ]);
    } finally {
      setIsCreatingProject(false);
    }
  }

  return (
    <>
      <div className="min-w-0">
        <div
        className={cn(
          "grid min-w-0 gap-5 xl:h-[calc(100vh-180px)] xl:min-h-[640px] xl:overflow-hidden",
          "xl:grid-cols-[minmax(0,1fr)_minmax(340px,390px)] 2xl:grid-cols-[minmax(0,1fr)_420px]",
        )}
      >
        <Panel className="flex min-h-[680px] flex-col overflow-hidden p-5 sm:p-7 lg:p-8 xl:h-full xl:min-h-0">
          <header className="mb-6 shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[42px] font-extrabold leading-none tracking-normal text-[#121714] sm:text-[54px]">
                Flux AI
              </h1>
              <Sparkles className="h-8 w-8 text-[#173f2d] sm:h-9 sm:w-9" />
            </div>
            <p className="mt-3 max-w-[620px] text-[15px] leading-6 text-[#4f5a52]">
              Ask, find, create, and manage projects with AI.
            </p>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-5">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              {isLoadingConversation ? (
                <ChatMessage
                  role="assistant"
                  content="Loading Flux AI conversation..."
                  time="Now"
                />
              ) : null}
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  time={message.time}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {!hasUserStartedConversation ? (
              <div className="flex flex-wrap justify-center gap-3 pt-5">
                {promptChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isSubmitting || isLoadingConversation}
                    onClick={() => {
                      void submitPrompt(chip);
                    }}
                    className="min-h-10 rounded-full border border-brand/25 bg-white px-4 text-[12px] font-extrabold text-[#1f704a] shadow-[0_10px_24px_rgba(43,128,85,0.05)] transition-colors hover:bg-[#f2faf4] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className="rounded-[24px] border border-brand/25 bg-white p-4 shadow-[0_14px_34px_rgba(23,39,28,0.04)]"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPrompt();
              }}
            >
              {aiStatus ? (
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#dbe6da] bg-[#f7fbf6] px-3 py-1.5 text-[12px] font-semibold text-[#31523f]">
                  {isListening ? (
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d9645b] opacity-70" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-[#d9645b]" />
                    </span>
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {aiStatus}
                </div>
              ) : null}

              {composerError ? (
                <p className="mb-3 rounded-[16px] border border-[#f0d4d2] bg-[#fff5f4] px-4 py-3 text-[12px] font-semibold text-[#bd4d45]">
                  {composerError}
                </p>
              ) : null}

              <div className="rounded-[20px] border border-[#dde6dd] bg-[#fbfcfa] p-3">
                <Textarea
                  aria-label="Ask Flux AI"
                  placeholder="Ask Flux AI anything about projects, stages, approvals, invoices, or archives..."
                  value={composerValue}
                  onChange={(event) => {
                    setComposerValue(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitPrompt();
                    }
                  }}
                  disabled={isLoadingConversation || isSubmitting}
                  className="max-h-[220px] min-h-[84px] resize-y border-0 bg-transparent px-1 py-2 text-[14px] leading-6 text-[#202922] shadow-none placeholder:text-[#8c948d] focus-visible:ring-0"
                />

                <div className="mt-2 flex w-full min-w-0 flex-nowrap items-center justify-end gap-1 overflow-x-auto border-t border-[#e5ece5] pt-2 sm:flex-wrap sm:gap-2 sm:overflow-visible">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2 text-[11px] font-[700] text-[#5083ff] sm:px-2.5"
                    aria-label="Translate"
                    title="Translate"
                    onClick={() => {
                      void translateComposerText();
                    }}
                    disabled={
                      isLoadingConversation ||
                      isSubmitting ||
                      isTranslating ||
                      isListening ||
                      isTranscribing
                    }
                  >
                    {isTranslating ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Languages className="h-5 w-5" />
                    )}
                    <span className="hidden sm:inline">Translate</span>
                  </Button>
                  <ChatLanguagePicker
                    languages={SUPPORTED_CHAT_LANGUAGES}
                    selectedLanguage={selectedOutputLanguage}
                    disabled={
                      isLoadingConversation ||
                      isSubmitting ||
                      isTranslating ||
                      isListening ||
                      isTranscribing
                    }
                    onSelect={(language) => setSelectedOutputLanguageCode(language.code)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-8",
                      isListening
                        ? "bg-[#fff1ef] text-[#d9645b] hover:bg-[#ffe7e3]"
                        : "text-brand",
                    )}
                    aria-label={isListening ? "Stop recording" : "Start voice input"}
                    onClick={() => {
                      void handleMicrophoneToggle();
                    }}
                    disabled={
                      isLoadingConversation ||
                      isSubmitting ||
                      isTranscribing ||
                      isTranslating
                    }
                  >
                    {isTranscribing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : isListening ? (
                      <Square className="h-4 w-4 fill-current" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-brand"
                    aria-label="Attach file"
                    title="Attachment support is not enabled for Flux AI yet."
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[12px] sm:px-4"
                    disabled={
                      isLoadingConversation ||
                      isSubmitting ||
                      isListening ||
                      isTranscribing ||
                      !composerValue.trim()
                    }
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            </form>

            <p className="text-center text-[11px] text-[#9aa199]">
              Flux AI can make mistakes. Always review important information.
            </p>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4 xl:h-full xl:overflow-y-auto xl:pr-1">
          {shouldShowResultPanel ? (
            <div className="grid min-w-0 content-start gap-4">
              {shouldShowStatusSummaryPanel && fluxResponse?.projectStatus ? (
                <StatusSummaryPanel status={fluxResponse.projectStatus} blockers={blockers} />
              ) : null}

              {shouldShowCreatedProjectPanel ? (
                <CreatedProjectPanel href={fluxResponse?.createdProjectHref} />
              ) : null}

              {shouldShowDraftPanel && draftProject ? (
                draftEditValue ? (
                  <DraftProjectEditorPanel
                    draftProject={draftEditValue}
                    draftOptions={draftOptions}
                    error={draftEditError}
                    isSaving={isValidatingDraftEdit}
                    onChange={setDraftEditValue}
                    onSave={() => {
                      void saveDraftEdit();
                    }}
                    onCancel={cancelDraftEdit}
                  />
                ) : (
                  <DraftProjectPreviewPanel
                    draftProject={draftProject}
                    missingFields={missingFields}
                    warnings={draftWarnings}
                    createError={createError}
                    canCreateDraftProject={canCreateDraftProject}
                    isCreatingProject={isCreatingProject}
                    onCreate={() => {
                      void createDraftProject();
                    }}
                    onEdit={openDraftEditor}
                    onCancel={() => {
                      void clearPersistedConversationState();
                      setFluxResponse(null);
                      setIsResultPanelOpen(false);
                      setCreateError(null);
                      setComposerError(null);
                      setDraftEditValue(null);
                      setDraftEditError(null);
                    }}
                  />
                )
              ) : shouldShowStandaloneBlockersPanel ? (
                <Panel className="p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <PanelIcon>
                      <AlertTriangle className="h-5 w-5" />
                    </PanelIcon>
                    <div>
                      <h2 className="text-[18px] font-extrabold leading-tight text-[#111712]">
                        Blockers
                      </h2>
                      <p className="text-[13px] font-medium text-[#667168]">
                        Read-only blocker summary
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-[13px] font-semibold text-[#5b403d]">
                    {blockers.slice(0, 8).map((blocker) => (
                      <li key={blocker} className="flex items-start gap-2 rounded-[14px] bg-[#fff4f4] p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d45e55]" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          ) : null}

          <FluxMatchesPanel
            activeTab={activeMatchesTab}
            onTabChange={setActiveMatchesTab}
            projectCards={projectCards}
            archiveAssets={archiveAssets}
            hasProjectQuery={shouldShowProjectMatchesPanel}
            hasArchiveQuery={shouldShowArchiveMatchesPanel}
            isSubmitting={isSubmitting}
          />

          <FluxRecentChatsPanel
            conversations={conversations}
            activeConversationId={activeConversationId}
            activeConversationTitle={activeConversationTitle}
            isBusy={
              isLoadingConversation ||
              isSubmitting ||
              isCreatingProject ||
              isDeletingConversation
            }
            conversationError={conversationError}
            onNewChat={() => {
              void startNewConversation();
            }}
            onLoadConversation={(conversationId) => {
              void loadConversation(conversationId);
            }}
            onDeleteConversation={(conversation) => {
              setDeleteConversationError(null);
              setConversationPendingDelete(conversation);
            }}
          />
        </aside>
        </div>
      </div>
      <ConfirmationDialog
        isOpen={Boolean(conversationPendingDelete)}
        title="Delete this Flux AI chat?"
        description="This will remove the conversation from your Flux AI history."
        confirmLabel="Delete Chat"
        cancelLabel="Cancel"
        tone="destructive"
        pending={isDeletingConversation}
        error={deleteConversationError ?? undefined}
        onConfirm={() => {
          void confirmDeleteConversation();
        }}
        onClose={() => {
          if (isDeletingConversation) {
            return;
          }

          setConversationPendingDelete(null);
          setDeleteConversationError(null);
        }}
      />
    </>
  );
}
