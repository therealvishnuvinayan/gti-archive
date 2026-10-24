export const searchPageSize = 8;
export const searchLastPage = 99;
export const familyLabels = { native: "Native Projects", flexible: "Flexible Projects", runtime: "Runtime Projects" } as const;
export const taskTypeLabels = { GENERAL: "General", FILE_UPLOAD: "File Upload", DATA_INPUT: "Data Input", INSPECT_FILE: "Inspect File", INITIAL_CONCEPT: "Initial Concept", FINAL_CONCEPT: "Final Concept" } as const;
export type SearchFamily = keyof typeof familyLabels;
export type SearchTaskType = keyof typeof taskTypeLabels;
export type SearchQuery = { q: string; kind: "all" | "projects" | "tasks"; family: "all" | SearchFamily; type: "all" | SearchTaskType; page: number };
export class SearchError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function parseSearchQuery(raw: unknown): SearchQuery {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SearchError("INVALID_SEARCH");
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some(k => !["q", "kind", "family", "type", "page"].includes(k)) || Object.values(v).some(x => x !== undefined && typeof x !== "string")) throw new SearchError("INVALID_SEARCH");
  const q = v.q === undefined ? "" : v.q as string;
  if (q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)) throw new SearchError("INVALID_SEARCH");
  const kind = v.kind ?? "all", family = v.family ?? "all", type = v.type ?? "all", page = v.page ?? "0";
  if (!["all", "projects", "tasks"].includes(String(kind)) || !["all", ...Object.keys(familyLabels)].includes(String(family)) ||
    !["all", ...Object.keys(taskTypeLabels)].includes(String(type)) || !/^(0|[1-9][0-9]?)$/.test(String(page))) throw new SearchError("INVALID_SEARCH");
  return { q: q.trim(), kind, family, type, page: Number(page) } as SearchQuery;
}
export function searchHref(query: SearchQuery, page = query.page) {
  return `/search?${new URLSearchParams({ q: query.q, kind: query.kind, family: query.family, type: query.type, page: String(page) })}`;
}
// Prisma's contains operator uses LIKE. Escape its metacharacters so user text
// is a literal substring, never a pattern or a database expression.
export function literalContains(value: string) { return { contains: value.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const }; }
export type SearchProject = { id: string; name: string; href: string; family: SearchFamily; contextOnly: boolean;
  status?: string; category?: string | null; owner?: string | null; coOwners?: string[]; moreCoOwners?: boolean };
export type SearchTask = { id: string; title: string; href: string; type: string; status: string; deadline: string; relationships: string[];
  isSister: boolean; source: { id: string; title: string; href: string } | null; root: { id: string; title: string; href: string } | null };
export type SearchGroup<T> = { items: T[]; hasMore: boolean };
export function searchPage<T>(rows: T[]): SearchGroup<T> { return { items: rows.slice(0, searchPageSize), hasMore: rows.length > searchPageSize }; }
