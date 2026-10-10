"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  deleteContactDirectoryEntry,
  saveContactDirectoryEntry,
  type ContactDirectoryKind,
} from "@/lib/contact-directory";
import type { ProjectContactInput } from "@/lib/project-contact-validation";

function refreshDirectories() {
  revalidatePath("/clients");
  revalidatePath("/final-beneficiaries");
  revalidatePath("/projects/[slug]/stages/1", "page");
}

export async function saveDirectoryContactAction(kind: ContactDirectoryKind, input: ProjectContactInput, contactId?: string) {
  const user = await requireUser();
  try {
    const result = await saveContactDirectoryEntry(user, kind, input, contactId);
    if (!("error" in result)) refreshDirectories();
    return result;
  } catch (error) {
    console.error("[contact-directory] save failed", error);
    return { error: "Unable to save this entry right now. Please try again." };
  }
}

export async function deleteDirectoryContactAction(kind: ContactDirectoryKind, contactId: string) {
  const user = await requireUser();
  try {
    const result = await deleteContactDirectoryEntry(user, kind, contactId);
    if (!("error" in result)) refreshDirectories();
    return result;
  } catch (error) {
    console.error("[contact-directory] delete failed", error);
    return { error: "Unable to delete this entry right now. Please try again." };
  }
}
