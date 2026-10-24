import { TaskerError, object } from "../tasker/contracts";

export const projectFamilies = ["runtime", "native", "flexible"] as const;
export const attentionKinds = ["all", "tasks", "workflows", "creation", "completion", "policy", "stages"] as const;
export const pageSize = 12;
export type DashboardQuery = {
  family: typeof projectFamilies[number]; projectStatus: "all" | "active" | "completed";
  projectPage: number; workPage: number; attentionPage: number;
  work: "action" | "owned" | "assigned" | "completed";
  attention: typeof attentionKinds[number];
};
export function parseDashboardQuery(raw: unknown = {}): DashboardQuery {
  const v = object(raw, ["family", "projectStatus", "projectPage", "workPage", "attentionPage", "work", "attention"]);
  const choice = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
    if (v[key] === undefined) return fallback;
    if (!values.includes(v[key] as T)) throw new TaskerError("INVALID_DASHBOARD_FILTER");
    return v[key] as T;
  };
  const page = (key: string) => {
    if (v[key] !== undefined && !["number", "string"].includes(typeof v[key])) throw new TaskerError("INVALID_DASHBOARD_PAGE");
    const value = v[key] === undefined ? 0 : Number(v[key]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000 || (typeof v[key] === "string" && !/^\d{1,4}$/.test(v[key]))) throw new TaskerError("INVALID_DASHBOARD_PAGE");
    return value;
  };
  return { family: choice("family", projectFamilies, "runtime"), projectStatus: choice("projectStatus", ["all", "active", "completed"], "all"),
    work: choice("work", ["action", "owned", "assigned", "completed"], "action"), attention: choice("attention", attentionKinds, "all"),
    projectPage: page("projectPage"), workPage: page("workPage"), attentionPage: page("attentionPage") };
}
export type DashboardProject = { id: string; name: string; href: string; family: string; category: string | null;
  status: string | null; owner: string | null; coOwners: string[]; date: string | null; dateLabel: string | null };
export type AttentionItem = { id: string; kind: typeof attentionKinds[number]; title: string; detail: string; href: string; at: string };
export const roleLabels: Record<string, string> = { DIRECTOR: "Director", SENIOR_PROJECT_MANAGER: "Senior Project Manager", JUNIOR_PROJECT_MANAGER: "Junior Project Manager", DESIGNER: "Designer", DIGITAL_LEAD: "Digital Lead" };
export const taskTypeLabels: Record<string, string> = { GENERAL: "General", FILE_UPLOAD: "File Upload", DATA_INPUT: "Data Input", INSPECT_FILE: "Inspect File", INITIAL_CONCEPT: "Initial Concept", FINAL_CONCEPT: "Final Concept" };
