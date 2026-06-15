import { unstable_cache } from "next/cache";

import { prisma, withPrismaRetry } from "@/lib/prisma";

export const DEFAULT_PROJECT_STATUS_SLUG = "in-progress";

export const defaultProjectStatusGroupSlugs = {
  active: "active",
  pending: "pending",
  onHold: "on-hold",
  completed: "completed",
  archived: "archived",
  cancelled: "cancelled",
} as const;

export type ProjectStatusGroupOptionRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStatusOptionRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  groupId: string | null;
  groupName: string;
  groupSlug: string;
  groupColor: string;
  groupIsActive: boolean;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ActiveProjectStatusGroupOption = {
  id: string;
  name: string;
  slug: string;
  color: string;
};

export type ActiveProjectStatusOption = {
  id: string;
  name: string;
  slug: string;
  color: string;
  groupId: string | null;
  groupName: string;
  groupSlug: string;
  groupColor: string;
  groupIsActive: boolean;
};

export type ProjectStatusGroupDisplay = {
  id: string;
  name: string;
  slug: string;
  color: string;
  isActive: boolean;
};

export type ProjectStatusDisplay = {
  id: string | null;
  name: string;
  slug: string | null;
  color: string;
  group: ProjectStatusGroupDisplay | null;
};

type ProjectStatusGroupLike = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
} | null | undefined;

type ProjectStatusLike = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  groupId?: string | null;
  group?: ProjectStatusGroupLike;
  sortOrder?: number;
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
} | null | undefined;

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

export const normalizeProjectStatusGroupSlug = normalizeProjectStatusSlug;

export function mapProjectStatusGroupOption(
  group: NonNullable<ProjectStatusGroupLike>,
) {
  return {
    id: group.id,
    name: group.name.trim(),
    slug: group.slug.trim(),
    description: group.description?.trim() || "",
    color: group.color?.trim() || "",
    sortOrder: group.sortOrder ?? 0,
    isActive: group.isActive ?? true,
    isSystem: group.isSystem ?? false,
    createdAt: formatStatusTimestamp(group.createdAt),
    updatedAt: formatStatusTimestamp(group.updatedAt),
  } satisfies ProjectStatusGroupOptionRecord;
}

export function mapProjectStatusOption(status: NonNullable<ProjectStatusLike>) {
  const group = status.group ?? null;

  return {
    id: status.id,
    name: status.name.trim(),
    slug: status.slug.trim(),
    description: status.description?.trim() || "",
    color: status.color?.trim() || "",
    groupId: status.groupId ?? group?.id ?? null,
    groupName: group?.name.trim() || "No group",
    groupSlug: group?.slug.trim() || "",
    groupColor: group?.color?.trim() || "",
    groupIsActive: group?.isActive ?? true,
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

  const group = status.group ?? null;

  return {
    id: status.id,
    name: status.name.trim() || "No status",
    slug: status.slug.trim() || null,
    color: status.color?.trim() || "",
    group: group
      ? {
          id: group.id,
          name: group.name.trim(),
          slug: group.slug.trim(),
          color: group.color?.trim() || "",
          isActive: group.isActive ?? true,
        }
      : null,
  };
}

export function isProjectStatusCompleted(status: ProjectStatusLike) {
  const groupSlug = status?.group?.slug;

  return (
    groupSlug === defaultProjectStatusGroupSlugs.completed ||
    groupSlug === defaultProjectStatusGroupSlugs.archived
  );
}

export function isProjectStatusActiveGroup(status: ProjectStatusLike) {
  return status?.group?.slug === defaultProjectStatusGroupSlugs.active;
}

export async function getActiveProjectStatusGroupOptions(): Promise<
  ActiveProjectStatusGroupOption[]
> {
  const groups = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.projectStatusGroupOption.findMany({
          where: {
            isActive: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      ),
    ["active-project-status-group-options"],
    { revalidate: 20, tags: ["project-master-data"] },
  )();

  return groups.map((group) => ({
    id: group.id,
    name: group.name.trim(),
    slug: group.slug.trim(),
    color: group.color?.trim() || "",
  }));
}

export async function getActiveProjectStatusOptions(): Promise<ActiveProjectStatusOption[]> {
  const statuses = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.projectStatusOption.findMany({
          where: {
            isActive: true,
            group: {
              is: {
                isActive: true,
              },
            },
          },
          include: {
            group: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      ),
    ["active-project-status-options"],
    { revalidate: 20, tags: ["project-master-data"] },
  )();

  return statuses.map((status) => {
    const mapped = mapProjectStatusOption(status);

    return {
      id: mapped.id,
      name: mapped.name,
      slug: mapped.slug,
      color: mapped.color,
      groupId: mapped.groupId,
      groupName: mapped.groupName,
      groupSlug: mapped.groupSlug,
      groupColor: mapped.groupColor,
      groupIsActive: mapped.groupIsActive,
    };
  });
}

export async function getProjectStatusOptionsForForm(currentStatusId?: string | null) {
  const statuses = await withPrismaRetry(() =>
    prisma.projectStatusOption.findMany({
      where: currentStatusId
        ? {
            OR: [
              {
                isActive: true,
                group: {
                  is: {
                    isActive: true,
                  },
                },
              },
              { id: currentStatusId },
            ],
          }
        : {
            isActive: true,
            group: {
              is: {
                isActive: true,
              },
            },
          },
      include: {
        group: true,
      },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  );

  return statuses.map((status) => ({
    ...mapProjectStatusOption(status),
    isActive: status.isActive,
  }));
}

export async function getDefaultProjectStatusOption() {
  const status = await withPrismaRetry(() =>
    prisma.projectStatusOption.findFirst({
      where: {
        isActive: true,
        slug: DEFAULT_PROJECT_STATUS_SLUG,
        group: {
          is: {
            isActive: true,
          },
        },
      },
      include: {
        group: true,
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
        group: {
          is: {
            isActive: true,
          },
        },
      },
      include: {
        group: true,
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
        group: {
          is: {
            isActive: true,
          },
        },
      },
      include: {
        group: true,
      },
    }),
  );
}

export async function getProjectStatusOptionByGroupSlug(
  groupSlug: string,
  preferredSlug?: string,
) {
  const normalizedGroupSlug = normalizeProjectStatusGroupSlug(groupSlug);

  if (preferredSlug) {
    const status = await withPrismaRetry(() =>
      prisma.projectStatusOption.findFirst({
        where: {
          slug: preferredSlug,
          isActive: true,
          group: {
            is: {
              slug: normalizedGroupSlug,
              isActive: true,
            },
          },
        },
        include: {
          group: true,
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
        isActive: true,
        group: {
          is: {
            slug: normalizedGroupSlug,
            isActive: true,
          },
        },
      },
      include: {
        group: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  );
}
