"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  CALENDAR_CACHE_TAG,
  createCalendarEvent,
  type CreateCalendarEventResult,
  type SaveCalendarEventInput,
} from "@/lib/calendar";
import {
  CALENDAR_COLLABORATORS_CACHE_TAG,
  updateCalendarCollaborators,
} from "@/lib/collaboration";

export async function saveCalendarEventAction(
  input: SaveCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  const user = await requireUser();
  const result = await createCalendarEvent(user.id, input);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/calendar");
  revalidateTag(CALENDAR_CACHE_TAG, "max");

  return result;
}

export async function saveCalendarCollaboratorsAction(collaboratorIds: string[]) {
  const user = await requireUser();
  const collaborators = await updateCalendarCollaborators(collaboratorIds, user.id);

  revalidatePath("/calendar");
  revalidateTag(CALENDAR_COLLABORATORS_CACHE_TAG, "max");

  return { collaborators };
}
