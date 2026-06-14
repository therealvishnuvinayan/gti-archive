import { unstable_cache } from "next/cache";
import { ProjectStatusGroup } from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";

export const DEFAULT_PROJECT_STATUS_SLUG = "in-progress";
export type ProjectStatusGroupValue = ProjectStatusGroup;

export type ProjectStatusOptionRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  group: ProjectStatusGroup;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ActiveProjectStatusOption = {
  id: string;
  name: string;
  slug: string;
  color: string;
  group: ProjectStatusGroup;
};

export type ProjectStatusDisplay = {
  id: string | null;
  name: string;
  slug: string | null;
  color: string;
  group: ProjectStatusGroup | null;
};

type ProjectStatusLike = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  group: ProjectStatusGroup;
  sortOrder?: number;
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
} | null | undefined;

export const projectStatusGroupLabels: Record<ProjectStatusGroup, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
  CANCELLED: "Cancelled",
};

export const projectStatusGroupOptions = [
  { value: ProjectStatusGroup.ACTIVE, label: projectStatusGroupLabels.ACTIVE },
  { value: ProjectStatusGroup.PENDING, label: projectStatusGroupLabels.PENDING },
  { value: ProjectStatusGroup.ON_HOLD, label: projectStatusGroupLabels.ON_HOLD },
  { value: ProjectStatusGroup.COMPLETED, label: projectStatusGroupLabels.COMPLETED },
  { value: ProjectStatusGroup.ARCHIVED, label: projectStatusGroupLabels.ARCHIVED },
  { value: ProjectStatusGroup.CANCELLED, label: projectStatusGroupLabels.CANCELLED },
] as const;

function toStatusDate(date: Date | string | number | undefined) {
  return date instanceof Date ? date : new Date(date ?? Date.now());
}

function formatStatusTimestamp(date: Date | string | number | undefined) {
  const normalizedDate = toStatusDate(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(normalizedDate);
}

export function normalizeProjectStatusSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function mapProjectStatusOption(status: NonNullable<ProjectStatusLike>) {
  return {
    id: status.id,
    name: status.name.trim(),
    slug: status.slug.trim(),
    description: status.description?.trim() || "",
    color: status.color?.trim() || "",
    group: status.group,
    sortOrder: status.sortOrder ?? 0,
    isActive: status.isActive ?? true,
    isSystem: status.isSystem ?? false,
    createdAt: formatStatusTimestamp(status.createdAt),
    updatedAt: formatStatusTimestamp(status.updatedAt),
  } satisfies ProjectStatusOptionRecord;
}

export function getProjectStatusDisplay(status: ProjectStatusLike): ProjectStatusDisplay {
  if (!status) {
    return {
      id: null,
      name: "No status",
      slug: null,
      color: "",
      group: null,
    };
  }

  return {
    id: status.id,
    name: status.name.trim() || "No status",
    slug: status.slug.trim() || null,
    color: status.color?.trim() || "",
    group: status.group,
  };
}

export function isProjectStatusCompleted(status: ProjectStatusLike) {
  return (
    status?.group === ProjectStatusGroup.COMPLETED ||
    status?.group === ProjectStatusGroup.ARCHIVED
  );
}

export function isProjectStatusActiveGroup(status: ProjectStatusLike) {
  return status?.group === ProjectStatusGroup.ACTIVE;
}

export async function getActiveProjectStatusOptions(): Promise<ActiveProjectStatusOption[]> {
  const statuses = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.projectStatusOption.findMany({
          where: {
            isActive: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      ),
    ["active-project-status-options"],
    { revalidate: 20, tags: ["project-master-data"] },
  )();

  return statuses.map((status) => ({
    id: status.id,
    name: status.name.trim(),
    slug: status.slug.trim(),
    color: status.color?.trim() || "",
    group: status.group,
  }));
}

export async function getProjectStatusOptionsForForm(currentStatusId?: string | null) {
  const statuses = await withPrismaRetry(() =>
    prisma.projectStatusOption.findMany({
      where: currentStatusId
        ? {
            OR: [
              { isActive: true },
              { id: currentStatusId },
            ],
          }
        : {
            isActive: true,
          },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  );

  return statuses.map((status) => ({
    id: status.id,
    name: status.name.trim(),
    slug: status.slug.trim(),
    color: status.color?.trim() || "",
    group: status.group,
    isActive: status.isActive,
  }));
}

export async function getDefaultProjectStatusOption() {
  const status = await withPrismaRetry(() =>
    prisma.projectStatusOption.findFirst({
      where: {
        isActive: true,
        slug: DEFAULT_PROJECT_STATUS_SLUG,
      },
    }),
  );

  if (status) {
    return status;
  }

  return withPrismaRetry(() =>
    prisma.projectStatusOption.findFirst({
      where: {
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  );
}

export async function getActiveProjectStatusOptionById(statusId: string) {
  return withPrismaRetry(() =>
    prisma.projectStatusOption.findFirst({
      where: {
        id: statusId,
        isActive: true,
      },
    }),
  );
}

export async function getProjectStatusOptionByGroup(
  group: ProjectStatusGroup,
  preferredSlug?: string,
) {
  if (preferredSlug) {
    const status = await withPrismaRetry(() =>
      prisma.projectStatusOption.findFirst({
        where: {
          group,
          slug: preferredSlug,
          isActive: true,
        },
      }),
    );

    if (status) {
      return status;
    }
  }

  return withPrismaRetry(() =>
    prisma.projectStatusOption.findFirst({
      where: {
        group,
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  );
}
