// Organization never confers file authority. These icons are identifiers, not URLs.
export const archiveFolderIcons = ["folder", "archive", "box", "images", "file-stack", "play", "scroll-text", "shapes"] as const;
export type ArchiveFolderIcon = typeof archiveFolderIcons[number];
export type FolderRecord = {
  id: string; categoryId: string; parentId: string | null; name: string;
  description: string; icon: string; revision: number;
};
export type OrganizationCommand = { commandId: string; categoryId: string } & (
  | { action: "create"; parentId: string | null; name: string; description: string; icon: ArchiveFolderIcon }
  | { action: "rename"; folderId: string; expectedRevision: number; name: string; description: string; icon: ArchiveFolderIcon }
  | { action: "move-folder"; folderId: string; expectedRevision: number; parentId: string | null }
  | { action: "delete-folder"; folderId: string; expectedRevision: number }
  | { action: "move-file"; fileId: string; fileKind: "project" | "manual"; expectedRevision: number; folderId: string | null }
);
export type OrganizationResult = { id: string; revision: number };
export class ArchiveOrganizationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function parseOrganizationCommand(value: unknown): OrganizationCommand {
  const fail = (): never => { throw new ArchiveOrganizationError("Invalid archive organization command."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  const id = (key: string) => typeof v[key] === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v[key] as string);
  if (!id("commandId") || !id("categoryId")) return fail();
  const base = { commandId: v.commandId as string, categoryId: v.categoryId as string };
  const nullableId = (key: string) => v[key] === null || id(key);
  const revision = () => Number.isSafeInteger(v.expectedRevision) && (v.expectedRevision as number) >= 0;
  const metadata = () => {
    if (typeof v.name !== "string" || !v.name.trim() || v.name.trim().length > 120 || /[\x00-\x1f/\\]/.test(v.name) ||
      typeof v.description !== "string" || v.description.length > 2000 || v.description.includes("\0") ||
      !archiveFolderIcons.includes(v.icon as ArchiveFolderIcon)) return fail();
    return { name: v.name.trim(), description: v.description.trim(), icon: v.icon as ArchiveFolderIcon };
  };
  const allowed: Record<string, string[]> = {
    create: ["parentId", "name", "description", "icon"], rename: ["folderId", "expectedRevision", "name", "description", "icon"],
    "move-folder": ["folderId", "expectedRevision", "parentId"], "delete-folder": ["folderId", "expectedRevision"],
    "move-file": ["fileId", "fileKind", "expectedRevision", "folderId"],
  };
  if (typeof v.action !== "string" || !Object.hasOwn(allowed, v.action) ||
    Object.keys(v).some(key => !["commandId", "categoryId", "action", ...allowed[v.action as string]].includes(key))) return fail();
  if (v.action === "create" && nullableId("parentId")) return { ...base, action: "create", parentId: v.parentId as string | null, ...metadata() };
  if (v.action === "rename" && id("folderId") && revision()) return { ...base, action: "rename", folderId: v.folderId as string, expectedRevision: v.expectedRevision as number, ...metadata() };
  if (v.action === "move-folder" && id("folderId") && nullableId("parentId") && revision()) return { ...base, action: "move-folder", folderId: v.folderId as string, parentId: v.parentId as string | null, expectedRevision: v.expectedRevision as number };
  if (v.action === "delete-folder" && id("folderId") && revision()) return { ...base, action: "delete-folder", folderId: v.folderId as string, expectedRevision: v.expectedRevision as number };
  if (v.action === "move-file" && id("fileId") && nullableId("folderId") && revision() && ["project", "manual"].includes(v.fileKind as string)) return { ...base, action: "move-file", fileId: v.fileId as string, fileKind: v.fileKind as "project" | "manual", folderId: v.folderId as string | null, expectedRevision: v.expectedRevision as number };
  return fail();
}
