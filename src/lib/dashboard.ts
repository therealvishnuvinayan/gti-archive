import {
  ProductionApprovalStepStatus,
  ProductionDispatchStatus,
  ProductionHandoverDeliveryStatus,
  ProductionSampleRoundStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestWorkflowStatus,
  ProjectProductionUnitStatus,
  ProjectRevisionStatus,
  ProjectWorkflowStageKey,
  StageStatus,
  UserRole,
  type Prisma,
  type User,
} from "@prisma/client";

import {
  deriveProjectListWorkflowState,
  type ProjectListWorkflowState,
} from "@/lib/project-list-workflow";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "@/lib/project-workflow";
import {
  hasPermission,
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { STAGE_FIVE_FIELD_LABELS } from "@/lib/stage-five-fields";

type DashboardUser = Pick<User, "id" | "role" | "collaboratorType"> &
  PermissionUser;

export type DashboardKpiIcon =
  | "projects"
  | "active"
  | "attention"
  | "completed";

export type DashboardKpi = {
  label: string;
  value: number;
  note: string;
  href: string;
  icon: DashboardKpiIcon;
  tone: "green" | "amber";
};

export type DashboardAttentionItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  kind:
    | "deadline"
    | "review"
    | "revision"
    | "request"
    | "approval";
  title: string;
  detail: string;
  projectName: string;
  href: string;
  actionLabel: string;
  sortAt: string;
};

export type DashboardDeadlineItem = {
  id: string;
  projectName: string;
  detail: string;
  stageLabel: string;
  dateLabel: string;
  statusLabel: string;
  tone: "critical" | "warning" | "standard";
  href: string;
  dueAt: string;
};

export type DashboardStageSummary = {
  number: number;
  name: string;
  count: number;
  href: string;
};

export type DashboardWorkSummaryItem = {
  id: string;
  label: string;
  count: number;
  href: string;
  tone: "blue" | "amber" | "red" | "green";
};

export type DashboardRecentProject = {
  id: string;
  name: string;
  href: string;
  stageNumber: number | null;
  stageName: string | null;
  businessStatus: ProjectListWorkflowState["businessStatus"];
  workflowDiagnosticLabel: ProjectListWorkflowState["workflowDiagnosticLabel"];
  ownerName: string;
  ownerInitials: string;
  updatedLabel: string;
};

export type DashboardSnapshot = {
  kpis: DashboardKpi[];
  attention: DashboardAttentionItem[];
  attentionCount: number;
  deadlines: DashboardDeadlineItem[];
  stages: DashboardStageSummary[];
  myWork: DashboardWorkSummaryItem[];
  recentProjects: DashboardRecentProject[];
  scopeLabel: string;
};

const projectSelect = {
  id: true,
  name: true,
  ownerId: true,
  completedAt: true,
  archivedAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, email: true } },
  closure: { select: { id: true } },
  inquiry: { select: { deadline: true } },
  coOwners: { select: { userId: true } },
  executors: { select: { userId: true } },
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
  workflowStages: { select: { stageKey: true, status: true } },
} satisfies Prisma.ProjectSelect;

type DashboardProject = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

type ProjectSummary = {
  project: DashboardProject;
  workflow: ProjectListWorkflowState;
};

type DeadlineCandidate = Omit<DashboardDeadlineItem, "dateLabel" | "statusLabel" | "tone"> & {
  dueAtDate: Date;
};

type WorkCounter = {
  id: string;
  label: string;
  count: number;
  href: string;
  tone: DashboardWorkSummaryItem["tone"];
};

const attentionRank: Record<DashboardAttentionItem["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function dashboardProjectWhere(user: DashboardUser): Prisma.ProjectWhereInput {
  if (
    !hasPermission(user, "project.list") &&
    !hasPermission(user, "project.view")
  ) {
    return { id: "__dashboard_permission_denied__" };
  }

  if (user.role === UserRole.SUPER_ADMIN) return {};

  return {
    OR: [
      { ownerId: user.id },
      { coOwners: { some: { userId: user.id } } },
      { executors: { some: { userId: user.id } } },
      { collaborators: { some: { userId: user.id } } },
    ],
  };
}

function toDate(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayDifference(from: Date, to: Date) {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  );
}

function formatDeadline(dueAt: Date, now: Date) {
  const days = dayDifference(now, dueAt);
  const dateLabel =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : dueAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            ...(dueAt.getFullYear() !== now.getFullYear()
              ? { year: "numeric" as const }
              : {}),
          });

  if (days < 0) {
    const overdueDays = Math.abs(days);
    return {
      dateLabel,
      statusLabel: `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`,
      tone: "critical" as const,
    };
  }

  if (days === 0) {
    return { dateLabel, statusLabel: "Due today", tone: "critical" as const };
  }

  if (days === 1) {
    return { dateLabel, statusLabel: "Due tomorrow", tone: "warning" as const };
  }

  return {
    dateLabel,
    statusLabel: `Due in ${days} days`,
    tone: "standard" as const,
  };
}

function formatRecentTime(value: Date | string | number, now: Date) {
  const date = toDate(value);
  const days = dayDifference(now, date);
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (days === 0) return `Today, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function displayName(person: { name: string | null; email: string } | null) {
  return person?.name?.trim() || person?.email || "Unassigned";
}

function initials(name: string) {
  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return value || "—";
}

function stageNumberForConcept(key: ProjectWorkflowStageKey) {
  return key === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT ? 4 : 3;
}

function sampleRoundLabel(round: {
  sequence: number;
  type: string;
  customTypeName: string | null;
}) {
  if (round.customTypeName?.trim()) return round.customTypeName.trim();
  const label = round.type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${label} ${round.sequence}`;
}

function addWork(counter: Map<string, WorkCounter>, item: WorkCounter) {
  const existing = counter.get(item.id);
  counter.set(item.id, {
    ...item,
    count: (existing?.count ?? 0) + item.count,
    href: existing?.href ?? item.href,
  });
}

function addAttention(
  items: DashboardAttentionItem[],
  item: DashboardAttentionItem,
) {
  if (!items.some((existing) => existing.id === item.id)) items.push(item);
}

function buildKpis(input: {
  user: DashboardUser;
  summaries: ProjectSummary[];
  attentionCount: number;
  assignedConceptCount: number;
  openRequestCount: number;
  completedRequestCount: number;
}) {
  const { user, summaries } = input;
  const active = summaries.filter(
    (item) =>
      item.workflow.businessStatus === "ACTIVE" && !item.project.archivedAt,
  ).length;
  const completed = summaries.filter(
    (item) => item.workflow.businessStatus === "COMPLETED",
  ).length;
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const isManager = summaries.some(
    ({ project }) =>
      project.ownerId === user.id ||
      project.coOwners.some((coOwner) => coOwner.userId === user.id),
  );
  const isExecutor = summaries.some(({ project }) =>
    project.executors.some((executor) => executor.userId === user.id),
  );
  const isCollaborator = summaries.some(({ project }) =>
    project.collaborators.some((collaborator) => collaborator.userId === user.id),
  );
  const relationshipCount = [isManager, isExecutor, isCollaborator].filter(Boolean).length;

  let totalLabel = "Accessible Projects";
  let activeLabel = "Active Work";
  let activeValue = active;
  let activeNote = "Across your project relationships";
  let completedLabel = "Completed Work";
  let completedValue = completed;
  let completedNote = "Finished accessible projects";

  if (isSuperAdmin) {
    totalLabel = "Total Projects";
    activeLabel = "Active Projects";
    activeNote = "Currently in progress";
    completedLabel = "Completed";
    completedNote = "Finished projects";
  } else if (relationshipCount === 1 && isManager) {
    totalLabel = "My Projects";
    activeLabel = "Active Projects";
    activeNote = "You own or co-own";
    completedLabel = "Completed";
    completedNote = "Delivered projects";
  } else if (relationshipCount === 1 && isExecutor) {
    activeLabel = "Active Assignments";
    activeValue = input.assignedConceptCount;
    activeNote = "Concept briefs and revisions";
    completedNote = "Finished project assignments";
  } else if (relationshipCount === 1 && isCollaborator) {
    activeLabel = "Open Requests";
    activeValue = input.openRequestCount;
    activeNote = "Waiting for your response";
    completedLabel = "Completed Requests";
    completedValue = input.completedRequestCount;
    completedNote = "Requests you have finished";
  }

  return [
    {
      label: totalLabel,
      value: summaries.length,
      note: isSuperAdmin ? "Global V2 portfolio" : "Based on your relationships",
      href: "/projects?status=ALL&sort=updated",
      icon: "projects" as const,
      tone: "green" as const,
    },
    {
      label: activeLabel,
      value: activeValue,
      note: activeNote,
      href: "/projects?status=ACTIVE&sort=updated",
      icon: "active" as const,
      tone: "green" as const,
    },
    {
      label: "Needs Attention",
      value: input.attentionCount,
      note:
        input.attentionCount === 0
          ? "Nothing waiting on you"
          : "Actionable by you now",
      href: "#needs-attention",
      icon: "attention" as const,
      tone: "amber" as const,
    },
    {
      label: completedLabel,
      value: completedValue,
      note: completedNote,
      href: "/projects?status=COMPLETED&sort=updated",
      icon: "completed" as const,
      tone: "green" as const,
    },
  ];
}

/**
 * Builds the V2 operational dashboard from the same workflow rows used by the
 * project workspaces. ADMIN is deliberately relationship-scoped here; only
 * SUPER_ADMIN receives a global portfolio.
 */
export async function getDashboardSnapshot(
  user: DashboardUser,
  now = new Date(),
): Promise<DashboardSnapshot> {
  const projects = await withPrismaRetry(() =>
    prisma.project.findMany({
      where: dashboardProjectWhere(user),
      select: projectSelect,
      orderBy: { updatedAt: "desc" },
    }),
  );
  const summaries: ProjectSummary[] = projects.map((project) => ({
    project,
    workflow: deriveProjectListWorkflowState(project),
  }));
  const projectById = new Map(summaries.map((item) => [item.project.id, item]));
  const activeProjectIds = summaries
    .filter(
      (item) =>
        item.workflow.businessStatus === "ACTIVE" && !item.project.archivedAt,
    )
    .map((item) => item.project.id);

  const [conceptFolders, checklistRequests, productionUnits, sampleRounds] =
    activeProjectIds.length === 0
      ? [[], [], [], []] as const
      : await Promise.all([
          withPrismaRetry(() =>
            prisma.projectConceptFolder.findMany({
              where: {
                projectId: { in: activeProjectIds },
                workflowStageKey: {
                  in: [
                    ProjectWorkflowStageKey.CONCEPT_CREATION,
                    ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
                  ],
                },
              },
              select: {
                id: true,
                projectId: true,
                name: true,
                workflowStageKey: true,
                assignedExecutorId: true,
                approvedAt: true,
                taskerStage: {
                  select: {
                    actualStartedAt: true,
                    plannedDueAt: true,
                    status: true,
                    revisions: {
                      orderBy: { revisionNumber: "desc" },
                      take: 1,
                      select: {
                        id: true,
                        revisionNumber: true,
                        status: true,
                        rejectionReason: true,
                        createdAt: true,
                        updatedAt: true,
                        createdBy: { select: { name: true, email: true } },
                      },
                    },
                  },
                },
              },
            }),
          ),
          withPrismaRetry(() =>
            prisma.projectFileChecklistRequest.findMany({
              where: { projectId: { in: activeProjectIds } },
              select: {
                id: true,
                projectId: true,
                fieldKey: true,
                channel: true,
                recipientUserId: true,
                workflowStatus: true,
                requestedAt: true,
                completedAt: true,
                updatedAt: true,
                checklist: {
                  select: {
                    handoffId: true,
                    sourceAttachment: { select: { originalFileName: true } },
                  },
                },
              },
            }),
          ),
          withPrismaRetry(() =>
            prisma.projectProductionUnit.findMany({
              where: { projectId: { in: activeProjectIds } },
              select: {
                id: true,
                projectId: true,
                status: true,
                updatedAt: true,
                sourceAttachment: { select: { originalFileName: true } },
                approvalSteps: {
                  select: {
                    id: true,
                    status: true,
                    dispatchStatus: true,
                    recipientUserId: true,
                    updatedAt: true,
                    failureMessage: true,
                  },
                  orderBy: { sequence: "asc" },
                },
                handover: {
                  select: {
                    deliveryStatus: true,
                    failedAt: true,
                    failureMessage: true,
                    updatedAt: true,
                  },
                },
              },
            }),
          ),
          withPrismaRetry(() =>
            prisma.productionSampleRound.findMany({
              where: {
                projectId: { in: activeProjectIds },
                status: { not: ProductionSampleRoundStatus.COMPLETED },
              },
              select: {
                id: true,
                projectId: true,
                sequence: true,
                type: true,
                customTypeName: true,
                submissionDueAt: true,
                submittedAt: true,
                reviewDueAt: true,
                reviewedAt: true,
                revisionSignoffDueAt: true,
                revisionSignedOffAt: true,
                deliveryDueAt: true,
                deliveredAt: true,
                updatedAt: true,
                participants: { select: { userId: true } },
                supervision: { select: { productionUnitId: true } },
              },
            }),
          ),
        ]);

  const attention: DashboardAttentionItem[] = [];
  const deadlineCandidates: DeadlineCandidate[] = [];
  const work = new Map<string, WorkCounter>();
  let assignedConceptCount = 0;
  let openRequestCount = 0;
  let completedRequestCount = 0;

  for (const { project, workflow } of summaries) {
    if (
      workflow.businessStatus !== "ACTIVE" ||
      !project.inquiry?.deadline
    ) {
      continue;
    }
    if (!hasProjectPermission(user, project, "stage.updateTimeline")) continue;

    const dueAt = toDate(project.inquiry.deadline);
    const href = `/projects/${project.id}/stages/1`;
    deadlineCandidates.push({
      id: `inquiry:${project.id}`,
      projectName: project.name,
      detail: "Project inquiry deadline",
      stageLabel: "Stage 1",
      href,
      dueAt: dueAt.toISOString(),
      dueAtDate: dueAt,
    });

    if (dueAt.getTime() < startOfDay(now).getTime()) {
      addAttention(attention, {
        id: `inquiry-overdue:${project.id}`,
        severity: "critical",
        kind: "deadline",
        title: "Project inquiry deadline overdue",
        detail: "Review the inquiry timeline and update the deadline.",
        projectName: project.name,
        href,
        actionLabel: "Open stage",
        sortAt: dueAt.toISOString(),
      });
      addWork(work, {
        id: "overdue",
        label: "Overdue deadlines",
        count: 1,
        href,
        tone: "red",
      });
    }
  }

  for (const folder of conceptFolders) {
    const summary = projectById.get(folder.projectId);
    if (!summary) continue;
    const { project } = summary;
    const stageNumber = stageNumberForConcept(folder.workflowStageKey);
    const href = `/projects/${project.id}/stages/${stageNumber}/concepts/${folder.id}`;
    const latestRevision = folder.taskerStage.revisions[0] ?? null;
    const isAssigned = folder.assignedExecutorId === user.id;
    const canReview = hasProjectPermission(user, project, "stage.reviewSubmission");
    const isOpen =
      !folder.approvedAt && folder.taskerStage.status !== StageStatus.COMPLETED;

    if (isAssigned && isOpen) assignedConceptCount += 1;

    if (isAssigned && isOpen) {
      addWork(work, {
        id: "assigned-concepts",
        label: "Assigned concepts",
        count: 1,
        href,
        tone: "blue",
      });
    }

    if (isAssigned && isOpen && !folder.taskerStage.actualStartedAt) {
      addAttention(attention, {
        id: `brief:${folder.id}`,
        severity: "info",
        kind: "request",
        title: "Brief waiting to be accepted",
        detail: `${folder.name} · Stage ${stageNumber}`,
        projectName: project.name,
        href,
        actionLabel: "Review brief",
        sortAt: project.updatedAt.toISOString(),
      });
      addWork(work, {
        id: "briefs",
        label: "Briefs to accept",
        count: 1,
        href,
        tone: "amber",
      });
    }

    if (
      isAssigned &&
      isOpen &&
      latestRevision?.status === ProjectRevisionStatus.REJECTED
    ) {
      addAttention(attention, {
        id: `revision:${latestRevision.id}`,
        severity: "warning",
        kind: "revision",
        title: "Changes requested",
        detail:
          latestRevision.rejectionReason?.trim() ||
          `${folder.name} · Revision ${latestRevision.revisionNumber}`,
        projectName: project.name,
        href,
        actionLabel: "Open revision",
        sortAt: latestRevision.updatedAt.toISOString(),
      });
      addWork(work, {
        id: "changes",
        label: "Changes requested",
        count: 1,
        href,
        tone: "red",
      });
    }

    if (
      canReview &&
      isOpen &&
      latestRevision?.status === ProjectRevisionStatus.PENDING_REVIEW
    ) {
      addAttention(attention, {
        id: `review:${latestRevision.id}`,
        severity: "info",
        kind: "review",
        title: "Revision awaiting review",
        detail: `${folder.name} · Revision ${latestRevision.revisionNumber} by ${displayName(latestRevision.createdBy)}`,
        projectName: project.name,
        href,
        actionLabel: "Review",
        sortAt: latestRevision.createdAt.toISOString(),
      });
      addWork(work, {
        id: "reviews",
        label: "Revisions awaiting review",
        count: 1,
        href,
        tone: "blue",
      });
    }

    if (
      isAssigned &&
      latestRevision?.status === ProjectRevisionStatus.PENDING_REVIEW
    ) {
      addWork(work, {
        id: "submitted",
        label: "Submissions in review",
        count: 1,
        href,
        tone: "blue",
      });
    }

    if (
      isOpen &&
      folder.taskerStage.plannedDueAt &&
      (isAssigned || hasProjectPermission(user, project, "stage.updateTimeline"))
    ) {
      const dueAt = toDate(folder.taskerStage.plannedDueAt);
      deadlineCandidates.push({
        id: `concept:${folder.id}`,
        projectName: project.name,
        detail: folder.name,
        stageLabel: `Stage ${stageNumber}`,
        href,
        dueAt: dueAt.toISOString(),
        dueAtDate: dueAt,
      });

      if (dueAt.getTime() < startOfDay(now).getTime()) {
        addAttention(attention, {
          id: `concept-overdue:${folder.id}`,
          severity: "critical",
          kind: "deadline",
          title: `Stage ${stageNumber} deadline overdue`,
          detail: folder.name,
          projectName: project.name,
          href,
          actionLabel: isAssigned ? "Open work" : "Review timeline",
          sortAt: dueAt.toISOString(),
        });
        addWork(work, {
          id: "overdue",
          label: "Overdue deadlines",
          count: 1,
          href,
          tone: "red",
        });
      }
    }
  }

  for (const request of checklistRequests) {
    const summary = projectById.get(request.projectId);
    if (!summary) continue;
    const { project, workflow } = summary;
    const fieldLabel = STAGE_FIVE_FIELD_LABELS[request.fieldKey];
    const fileName = request.checklist.sourceAttachment.originalFileName;
    const personalRequest =
      request.channel === ProjectFileChecklistRequestChannel.IN_APP &&
      request.recipientUserId === user.id;
    const isOpen =
      request.workflowStatus ===
        ProjectFileChecklistRequestWorkflowStatus.REQUESTED ||
      request.workflowStatus ===
        ProjectFileChecklistRequestWorkflowStatus.ACCEPTED;

    if (personalRequest && isOpen) {
      const href = `/requests/checklist/${request.id}`;
      openRequestCount += 1;
      addAttention(attention, {
        id: `checklist:${request.id}`,
        severity: "warning",
        kind: "request",
        title: "Information requested",
        detail: `${fieldLabel} · ${fileName}`,
        projectName: project.name,
        href,
        actionLabel: "Respond",
        sortAt: request.requestedAt.toISOString(),
      });
      addWork(work, {
        id: "checklist",
        label: "Checklist requests pending",
        count: 1,
        href,
        tone: "green",
      });
    }

    if (
      personalRequest &&
      request.workflowStatus ===
        ProjectFileChecklistRequestWorkflowStatus.COMPLETED
    ) {
      completedRequestCount += 1;
      addWork(work, {
        id: "responses-submitted",
        label: "Responses submitted",
        count: 1,
        href: `/requests/checklist/${request.id}`,
        tone: "green",
      });
    }

    if (
      workflow.currentStageNumber === 5 &&
      request.workflowStatus ===
        ProjectFileChecklistRequestWorkflowStatus.COMPLETED &&
      hasProjectPermission(user, project, "stage.markStageComplete")
    ) {
      const href = `/projects/${project.id}/stages/5?file=${encodeURIComponent(request.checklist.handoffId)}&field=${encodeURIComponent(request.fieldKey)}&mode=view`;
      addAttention(attention, {
        id: `checklist-response:${request.id}`,
        severity: "info",
        kind: "request",
        title: "Requested information received",
        detail: `${fieldLabel} · ${fileName}`,
        projectName: project.name,
        href,
        actionLabel: "Review response",
        sortAt: (request.completedAt ?? request.updatedAt).toISOString(),
      });
      addWork(work, {
        id: "responses",
        label: "Checklist responses to review",
        count: 1,
        href,
        tone: "green",
      });
    }
  }

  for (const unit of productionUnits) {
    const summary = projectById.get(unit.projectId);
    if (!summary) continue;
    const { project } = summary;
    const unitHref = `/projects/${project.id}/stages/6?unit=${encodeURIComponent(unit.id)}`;
    const fileName = unit.sourceAttachment.originalFileName;
    const canManage = hasProjectPermission(
      user,
      project,
      "stage.markStageComplete",
    );

    for (const step of unit.approvalSteps) {
      const personal = step.recipientUserId === user.id;
      if (
        personal &&
        step.status === ProductionApprovalStepStatus.ACTIVE &&
        step.dispatchStatus === ProductionDispatchStatus.SENT
      ) {
        const href = `/production-approvals/${step.id}`;
        openRequestCount += 1;
        addAttention(attention, {
          id: `approval:${step.id}`,
          severity: "warning",
          kind: "approval",
          title: "Approval waiting for your decision",
          detail: fileName,
          projectName: project.name,
          href,
          actionLabel: "Review approval",
          sortAt: step.updatedAt.toISOString(),
        });
        addWork(work, {
          id: "approvals",
          label: "Approvals to decide",
          count: 1,
          href,
          tone: "amber",
        });
      }

      if (
        personal &&
        (step.status === ProductionApprovalStepStatus.APPROVED ||
          step.status === ProductionApprovalStepStatus.REJECTED)
      ) {
        completedRequestCount += 1;
      }

      if (
        canManage &&
        step.dispatchStatus === ProductionDispatchStatus.FAILED
      ) {
        addAttention(attention, {
          id: `approval-failed:${step.id}`,
          severity: "critical",
          kind: "approval",
          title: "Approval delivery failed",
          detail: step.failureMessage?.trim() || fileName,
          projectName: project.name,
          href: unitHref,
          actionLabel: "Resolve",
          sortAt: step.updatedAt.toISOString(),
        });
      }
    }

    if (canManage && unit.status === ProjectProductionUnitStatus.REJECTED) {
      addAttention(attention, {
        id: `unit-rejected:${unit.id}`,
        severity: "warning",
        kind: "revision",
        title: "Production approval rejected",
        detail: fileName,
        projectName: project.name,
        href: unitHref,
        actionLabel: "Review decision",
        sortAt: unit.updatedAt.toISOString(),
      });
    }

    if (
      canManage &&
      unit.handover?.deliveryStatus ===
        ProductionHandoverDeliveryStatus.FAILED
    ) {
      addAttention(attention, {
        id: `handover-failed:${unit.id}`,
        severity: "critical",
        kind: "approval",
        title: "Production handover failed",
        detail: unit.handover.failureMessage?.trim() || fileName,
        projectName: project.name,
        href: unitHref,
        actionLabel: "Resolve",
        sortAt: (unit.handover.failedAt ?? unit.handover.updatedAt).toISOString(),
      });
    }

    if (canManage && unit.status === ProjectProductionUnitStatus.APPROVAL_PENDING) {
      addWork(work, {
        id: "approval-progress",
        label: "Approvals in progress",
        count: 1,
        href: unitHref,
        tone: "amber",
      });
    }
  }

  const sampleMilestones = [
    ["Submission", "submissionDueAt", "submittedAt"],
    ["Review", "reviewDueAt", "reviewedAt"],
    ["Revision sign-off", "revisionSignoffDueAt", "revisionSignedOffAt"],
    ["Delivery", "deliveryDueAt", "deliveredAt"],
  ] as const;

  for (const round of sampleRounds) {
    const summary = projectById.get(round.projectId);
    if (!summary) continue;
    const { project } = summary;
    const isParticipant = round.participants.some(
      (participant) => participant.userId === user.id,
    );
    const canManage = hasProjectPermission(
      user,
      project,
      "stage.markStageComplete",
    );
    if (!isParticipant && !canManage) continue;

    const href = `/projects/${project.id}/stages/7?unit=${encodeURIComponent(round.supervision.productionUnitId)}&round=${encodeURIComponent(round.id)}`;
    const roundLabel = sampleRoundLabel(round);
    for (const [milestoneLabel, dueKey, actualKey] of sampleMilestones) {
      if (round[actualKey]) continue;
      const dueAt = toDate(round[dueKey]);
      deadlineCandidates.push({
        id: `sample:${round.id}:${dueKey}`,
        projectName: project.name,
        detail: `${roundLabel} · ${milestoneLabel}`,
        stageLabel: "Stage 7",
        href,
        dueAt: dueAt.toISOString(),
        dueAtDate: dueAt,
      });

      if (canManage && dueAt.getTime() < startOfDay(now).getTime()) {
        addAttention(attention, {
          id: `sample-overdue:${round.id}:${dueKey}`,
          severity: "critical",
          kind: "deadline",
          title: `${milestoneLabel} milestone overdue`,
          detail: roundLabel,
          projectName: project.name,
          href,
          actionLabel: "Open milestone",
          sortAt: dueAt.toISOString(),
        });
        addWork(work, {
          id: "overdue",
          label: "Overdue deadlines",
          count: 1,
          href,
          tone: "red",
        });
      }
    }
  }

  attention.sort((left, right) => {
    const severity = attentionRank[left.severity] - attentionRank[right.severity];
    if (severity !== 0) return severity;
    return toDate(left.sortAt).getTime() - toDate(right.sortAt).getTime();
  });

  const deadlines = deadlineCandidates
    .sort((left, right) => left.dueAtDate.getTime() - right.dueAtDate.getTime())
    .slice(0, 5)
    .map(({ dueAtDate, ...candidate }) => ({
      ...candidate,
      ...formatDeadline(dueAtDate, now),
    }));

  const stages = PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((stage) => ({
    number: stage.number,
    name: stage.name,
    count: summaries.filter(
      ({ project, workflow }) =>
        workflow.businessStatus === "ACTIVE" &&
        !project.archivedAt &&
        workflow.currentStageNumber === stage.number,
    ).length,
    href: `/projects?status=ACTIVE&stage=${stage.number}&sort=updated`,
  }));

  const recentProjects = summaries
    .filter(
      ({ project, workflow }) =>
        !project.archivedAt &&
        (workflow.businessStatus !== null || user.role === UserRole.SUPER_ADMIN),
    )
    .slice(0, 6)
    .map(({ project, workflow }) => {
      const ownerName = displayName(project.owner);
      return {
        id: project.id,
        name: project.name,
        href: `/projects/${project.id}`,
        stageNumber: workflow.currentStageNumber,
        stageName: workflow.currentStageName,
        businessStatus: workflow.businessStatus,
        workflowDiagnosticLabel:
          user.role === UserRole.SUPER_ADMIN
            ? workflow.workflowDiagnosticLabel
            : null,
        ownerName,
        ownerInitials: initials(ownerName),
        updatedLabel: formatRecentTime(project.updatedAt, now),
      };
    });

  return {
    kpis: buildKpis({
      user,
      summaries,
      attentionCount: attention.length,
      assignedConceptCount,
      openRequestCount,
      completedRequestCount,
    }),
    attention: attention.slice(0, 6),
    attentionCount: attention.length,
    deadlines,
    stages,
    myWork: Array.from(work.values())
      .filter((item) => item.count > 0)
      .slice(0, 5),
    recentProjects,
    scopeLabel:
      user.role === UserRole.SUPER_ADMIN
        ? "Global portfolio"
        : "Projects connected to you",
  };
}
