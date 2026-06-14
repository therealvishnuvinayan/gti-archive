"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { type User } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import {
  CALENDAR_CACHE_TAG,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarAccessState,
  type CreateCalendarEventResult,
  type DeleteCalendarEventResult,
  type SaveCalendarEventInput,
} from "@/lib/calendar";
import {
  CALENDAR_COLLABORATORS_CACHE_TAG,
  removeCalendarCollaborator,
  updateCalendarCollaborators,
} from "@/lib/collaboration";

type CalendarManagerUser = Pick<User, "id" | "role">;

async function assertCalendarManager(user: CalendarManagerUser) {
  const access = await getCalendarAccessState(user);

  if (!access.canManageCollaborators) {
    return { error: "You are not allowed to update calendar collaborators." } as const;
  }
}

export async function saveCalendarEventAction(
  input: SaveCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  const user = await requireUser();
  const result = await createCalendarEvent(user, input);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/calendar");
  revalidateTag(CALENDAR_CACHE_TAG, "max");

  return result;
}

export async function deleteCalendarEventAction(
  eventId: string,
): Promise<DeleteCalendarEventResult> {
  const user = await requireUser();
  const result = await deleteCalendarEvent(user, eventId);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/calendar");
  revalidateTag(CALENDAR_CACHE_TAG, "max");

  return result;
}

export async function saveCalendarCollaboratorsAction(collaboratorIds: string[]) {
  const user = await requireUser();
  const authorization = await assertCalendarManager(user);

  if (authorization) {
    return authorization;
  }

  const collaborators = await updateCalendarCollaborators(collaboratorIds, user.id);

  revalidatePath("/calendar");
  revalidateTag(CALENDAR_COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(CALENDAR_CACHE_TAG, "max");

  return { collaborators };
}

export async function removeCalendarCollaboratorAction(collaboratorId: string) {
  const user = await requireUser();
  const authorization = await assertCalendarManager(user);

  if (authorization) {
    return authorization;
  }

  const result = await removeCalendarCollaborator(collaboratorId);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/calendar");
  revalidateTag(CALENDAR_COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(CALENDAR_CACHE_TAG, "max");

  return result;
}
