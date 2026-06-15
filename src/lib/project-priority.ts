export const projectPriorityOptions = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

export type ProjectPriorityValue = (typeof projectPriorityOptions)[number]["value"];

export const DEFAULT_PROJECT_PRIORITY: ProjectPriorityValue = "MEDIUM";

export function isProjectPriority(value: string): value is ProjectPriorityValue {
  return projectPriorityOptions.some((option) => option.value === value);
}

export function formatProjectPriority(value: string | null | undefined) {
  const normalizedValue = value?.trim().toUpperCase() ?? "";
  return (
    projectPriorityOptions.find((option) => option.value === normalizedValue)?.label ??
    projectPriorityOptions.find(
      (option) => option.value === DEFAULT_PROJECT_PRIORITY,
    )?.label ??
    "Medium"
  );
}
