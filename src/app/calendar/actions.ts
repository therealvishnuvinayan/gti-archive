"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  createCalendarEvent,
  type CreateCalendarEventResult,
  type SaveCalendarEventInput,
} from "@/lib/calendar";

export async function saveCalendarEventAction(
  input: SaveCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  const user = await requireUser();
  const result = await createCalendarEvent(user.id, input);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/calendar");

  return result;
}
