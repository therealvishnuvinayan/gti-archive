"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  createFlexibleMilestone,
  createFlexibleMilestoneNote,
  createFlexibleProject,
  deleteFlexibleMilestone,
  deleteFlexibleMilestoneNote,
  duplicateFlexibleMilestone,
  FLEXIBLE_PROJECTS_CACHE_TAG,
  moveFlexibleMilestone,
  setFlexibleMilestoneCompleted,
  updateFlexibleMilestone,
  updateFlexibleProject,
  type FlexibleMilestoneInput,
  type FlexibleMilestoneMutationResult,
  type FlexibleMilestoneNoteInput,
  type FlexibleMilestoneNoteMutationResult,
  type FlexibleProjectInput,
  type FlexibleProjectMutationResult,
} from "@/lib/flexible-projects";

function revalidateFlexibleProjects() {
  revalidatePath("/projects");
  revalidatePath("/projects/flexible/[projectSlug]", "page");
  revalidatePath(
    "/projects/flexible/[projectSlug]/milestones/[milestoneId]",
    "page",
  );
  revalidateTag(FLEXIBLE_PROJECTS_CACHE_TAG, "max");
}

async function runProjectMutation(
  label: string,
  operation: () => Promise<FlexibleProjectMutationResult>,
): Promise<FlexibleProjectMutationResult> {
  try {
    const result = await operation();
    if (!("error" in result)) revalidateFlexibleProjects();
    return result;
  } catch (error) {
    console.error(`[flexible-projects] ${label} failed`, error);
    return { error: "Unable to save the Flexible Project right now. Please try again." };
  }
}

async function runMilestoneMutation(
  label: string,
  operation: () => Promise<FlexibleMilestoneMutationResult>,
): Promise<FlexibleMilestoneMutationResult> {
  try {
    const result = await operation();
    if (!("error" in result)) revalidateFlexibleProjects();
    return result;
  } catch (error) {
    console.error(`[flexible-projects] ${label} failed`, error);
    return { error: "Unable to update the milestone right now. Please try again." };
  }
}

async function runMilestoneNoteMutation(
  label: string,
  operation: () => Promise<FlexibleMilestoneNoteMutationResult>,
): Promise<FlexibleMilestoneNoteMutationResult> {
  try {
    const result = await operation();
    if (!("error" in result)) revalidateFlexibleProjects();
    return result;
  } catch (error) {
    console.error(`[flexible-projects] ${label} failed`, error);
    return { error: "Unable to update the milestone notes right now. Please try again." };
  }
}

export async function createFlexibleProjectAction(input: FlexibleProjectInput) {
  const user = await requireUser();
  return runProjectMutation("create", () => createFlexibleProject(user, input));
}

export async function updateFlexibleProjectAction(
  projectId: string,
  input: FlexibleProjectInput,
) {
  const user = await requireUser();
  return runProjectMutation("update", () => updateFlexibleProject(user, projectId, input));
}

export async function createFlexibleMilestoneAction(
  projectId: string,
  input: FlexibleMilestoneInput,
) {
  const user = await requireUser();
  return runMilestoneMutation("milestone create", () =>
    createFlexibleMilestone(user, projectId, input),
  );
}

export async function updateFlexibleMilestoneAction(
  projectId: string,
  milestoneId: string,
  input: FlexibleMilestoneInput,
) {
  const user = await requireUser();
  return runMilestoneMutation("milestone update", () =>
    updateFlexibleMilestone(user, projectId, milestoneId, input),
  );
}

export async function createFlexibleMilestoneNoteAction(
  projectId: string,
  milestoneId: string,
  input: FlexibleMilestoneNoteInput,
) {
  const user = await requireUser();
  return runMilestoneNoteMutation("milestone note create", () =>
    createFlexibleMilestoneNote(user, projectId, milestoneId, input),
  );
}

export async function deleteFlexibleMilestoneNoteAction(
  projectId: string,
  milestoneId: string,
  noteId: string,
) {
  const user = await requireUser();
  return runMilestoneNoteMutation("milestone note delete", () =>
    deleteFlexibleMilestoneNote(user, projectId, milestoneId, noteId),
  );
}

export async function setFlexibleMilestoneCompletedAction(
  projectId: string,
  milestoneId: string,
  completed: boolean,
) {
  const user = await requireUser();
  return runMilestoneMutation("milestone completion", () =>
    setFlexibleMilestoneCompleted(user, projectId, milestoneId, completed),
  );
}

export async function moveFlexibleMilestoneAction(
  projectId: string,
  milestoneId: string,
  direction: "up" | "down",
) {
  const user = await requireUser();
  return runMilestoneMutation("milestone reorder", () =>
    moveFlexibleMilestone(user, projectId, milestoneId, direction),
  );
}

export async function duplicateFlexibleMilestoneAction(
  projectId: string,
  milestoneId: string,
) {
  const user = await requireUser();
  return runMilestoneMutation("milestone duplicate", () =>
    duplicateFlexibleMilestone(user, projectId, milestoneId),
  );
}

export async function deleteFlexibleMilestoneAction(
  projectId: string,
  milestoneId: string,
) {
  const user = await requireUser();
  return runMilestoneMutation("milestone delete", () =>
    deleteFlexibleMilestone(user, projectId, milestoneId),
  );
}
