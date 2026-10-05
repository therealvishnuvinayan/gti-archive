import { Prisma, ProjectInquiryPartyRole } from "@prisma/client";

import { canManageContactDirectories, type PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  validateProjectContactInput,
  type ProjectContactInput,
  type ProjectContactFieldErrors,
} from "@/lib/project-contact-validation";

export type ContactDirectoryKind = "CLIENT" | "CONTACT";

export function getContactDirectoryRole(kind: ContactDirectoryKind) {
  return kind === "CLIENT" ? ProjectInquiryPartyRole.CLIENT : ProjectInquiryPartyRole.FINAL_BENEFICIARY;
}

export function isContactDirectoryKind(kind: unknown): kind is ContactDirectoryKind {
  return kind === "CLIENT" || kind === "CONTACT";
}

export const contactDirectorySelect = {
  id: true,
  entityType: true,
  directoryRoles: true,
  name: true,
  company: true,
  companyEmail: true,
  companyPhone: true,
  companyWebsite: true,
  position: true,
  email: true,
  phone: true,
} satisfies Prisma.ContactDirectoryEntrySelect;

export type ContactDirectoryRecord = Prisma.ContactDirectoryEntryGetPayload<{
  select: typeof contactDirectorySelect;
}>;

export type SaveContactDirectoryResult =
  | { contact: ContactDirectoryRecord }
  | { error: string; fieldErrors?: ProjectContactFieldErrors };

export async function getContactDirectory(user: PermissionUser, kind: ContactDirectoryKind) {
  if (!canManageContactDirectories(user) || !isContactDirectoryKind(kind)) {
    throw new Error("You do not have permission to manage this directory.");
  }
  return withPrismaRetry(() => prisma.contactDirectoryEntry.findMany({
    where: { deletedAt: null, directoryRoles: { has: getContactDirectoryRole(kind) } },
    orderBy: kind === "CLIENT" ? [{ company: "asc" }, { name: "asc" }, { id: "asc" }] : [{ name: "asc" }, { company: "asc" }, { id: "asc" }],
    select: contactDirectorySelect,
  }));
}

export async function saveContactDirectoryEntry(
  user: PermissionUser,
  kind: ContactDirectoryKind,
  input: ProjectContactInput,
  contactId?: string,
): Promise<SaveContactDirectoryResult> {
  if (!canManageContactDirectories(user) || !isContactDirectoryKind(kind)) {
    return { error: "You do not have permission to manage this directory." };
  }
  const validation = validateProjectContactInput({ ...input, kind });
  if (Object.keys(validation.fieldErrors).length) {
    return { error: "Review the highlighted details.", fieldErrors: validation.fieldErrors };
  }
  const data = {
    entityType: validation.data.entityType,
    name: validation.data.name,
    company: validation.data.company || null,
    companyEmail: validation.data.companyEmail || null,
    companyPhone: validation.data.companyPhone || null,
    companyWebsite: validation.data.companyWebsite || null,
    position: validation.data.position || null,
    email: validation.data.email || null,
    phone: validation.data.phone || null,
  };
  return withPrismaRetry(() => prisma.$transaction(async tx => {
    if (contactId !== undefined) {
      const updated = await tx.contactDirectoryEntry.updateMany({
        where: { id: contactId, deletedAt: null, directoryRoles: { has: getContactDirectoryRole(kind) } },
        data,
      });
      if (!updated.count) return { error: "This entry is no longer available in this directory." };
      const contact = await tx.contactDirectoryEntry.findUniqueOrThrow({ where: { id: contactId }, select: contactDirectorySelect });
      return { contact };
    }
    const contact = await tx.contactDirectoryEntry.create({
      data: { ...data, directoryRoles: [getContactDirectoryRole(kind)], createdById: user.id },
      select: contactDirectorySelect,
    });
    return { contact };
  }));
}

export async function deleteContactDirectoryEntry(user: PermissionUser, kind: ContactDirectoryKind, contactId: string) {
  if (!canManageContactDirectories(user) || !isContactDirectoryKind(kind)) {
    return { error: "You do not have permission to manage this directory." };
  }
  const deleted = await withPrismaRetry(() => prisma.contactDirectoryEntry.updateMany({
    where: { id: contactId, deletedAt: null, directoryRoles: { has: getContactDirectoryRole(kind) } },
    data: { deletedAt: new Date() },
  }));
  if (!deleted.count) return { error: "This entry is no longer available in this directory." };
  return { success: true as const };
}
