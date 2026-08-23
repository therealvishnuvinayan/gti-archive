export const projectPriorityOptions = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

export type ProjectPriorityValue = (typeof projectPriorityOptions)[number]["value"];

export const DEFAULT_PROJECT_PRIORITY: ProjectPriorityValue = "MEDIUM";

const projectPriorityRank: Record<ProjectPriorityValue, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export type ProjectPrioritySortItem = {
  id?: string;
  name: string;
  priority: string | null | undefined;
  isCompleted: boolean;
  isPinned?: boolean;
  updatedAt: Date | string | number;
};

export function isProjectPriority(value: string): value is ProjectPriorityValue {
  return projectPriorityOptions.some((option) => option.value === value);
}

export function normalizeProjectPriority(
  value: string | null | undefined,
): ProjectPriorityValue {
  const normalizedValue = value?.trim().toUpperCase() ?? "";
  return isProjectPriority(normalizedValue)
    ? normalizedValue
    : DEFAULT_PROJECT_PRIORITY;
}

/**
 * Portfolio ordering keeps completed work out of the way, then surfaces the
 * highest-priority active work. Pins only break ties within the same priority.
 */
export function compareProjectsByPriority(
  left: ProjectPrioritySortItem,
  right: ProjectPrioritySortItem,
) {
  const completionOrder = Number(left.isCompleted) - Number(right.isCompleted);
  if (completionOrder !== 0) return completionOrder;

  const priorityOrder =
    projectPriorityRank[normalizeProjectPriority(left.priority)] -
    projectPriorityRank[normalizeProjectPriority(right.priority)];
  if (priorityOrder !== 0) return priorityOrder;

  const pinOrder = Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned));
  if (pinOrder !== 0) return pinOrder;

  const leftUpdatedAt =
    left.updatedAt instanceof Date
      ? left.updatedAt.getTime()
      : new Date(left.updatedAt).getTime();
  const rightUpdatedAt =
    right.updatedAt instanceof Date
      ? right.updatedAt.getTime()
      : new Date(right.updatedAt).getTime();
  const recencyOrder =
    (Number.isNaN(rightUpdatedAt) ? 0 : rightUpdatedAt) -
    (Number.isNaN(leftUpdatedAt) ? 0 : leftUpdatedAt);
  if (recencyOrder !== 0) return recencyOrder;

  const nameOrder = left.name.localeCompare(right.name, undefined, {
    sensitivity: "base",
  });
  if (nameOrder !== 0) return nameOrder;

  return (left.id ?? "").localeCompare(right.id ?? "");
}

export function formatProjectPriority(value: string | null | undefined) {
  const normalizedValue = normalizeProjectPriority(value);
  return (
    projectPriorityOptions.find((option) => option.value === normalizedValue)?.label ??
    projectPriorityOptions.find(
      (option) => option.value === DEFAULT_PROJECT_PRIORITY,
    )?.label ??
    "Medium"
  );
}
