"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  completeProjectInquiry,
  createContactDirectoryEntry,
  searchProjectInquiryHistorySuggestions,
  searchProjectInquiryPartyOptions,
  type CompleteProjectInquiryInput,
  type CompleteProjectInquiryResult,
  type CreateContactDirectoryEntryInput,
  type CreateContactDirectoryEntryResult,
} from "@/lib/project-inquiry";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function createContactDirectoryEntryAction(
  projectId: string,
  input: CreateContactDirectoryEntryInput,
): Promise<CreateContactDirectoryEntryResult> {
  const user = await requireUser();

  try {
    return await createContactDirectoryEntry(user, projectId, input);
  } catch (error) {
    console.error("[project-inquiry] contact creation failed", error);
    return {
      error: "Unable to save the contact right now. Please try again.",
    };
  }
}

export async function searchProjectInquiryPartyOptionsAction(
  projectId: string,
  query: string,
) {
  const user = await requireUser();
  return searchProjectInquiryPartyOptions(user, projectId, query);
}

export async function searchProjectInquiryHistorySuggestionsAction(
  projectId: string,
  kind: "target-market" | "deliverable",
  query: string,
) {
  const user = await requireUser();
  return searchProjectInquiryHistorySuggestions(user, projectId, kind, query);
}

export async function completeProjectInquiryAction(
  input: CompleteProjectInquiryInput,
): Promise<CompleteProjectInquiryResult> {
  const user = await requireUser();

  try {
    const result = await completeProjectInquiry(user, input);

    if ("error" in result) {
      return result;
    }

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath(`/projects/${input.projectId}/stages/1`);
    revalidatePath("/notifications");
    revalidateTag(PROJECTS_CACHE_TAG, "max");

    return result;
  } catch (error) {
    console.error("[project-inquiry] completion failed", error);
    return {
      error: "Unable to complete Project Inquiry right now. Please try again.",
    };
  }
}
