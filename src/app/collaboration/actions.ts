"use server";

import { revalidatePath } from "next/cache";

import { getUserDisplayName, requireUser } from "@/lib/auth";
import {
  createCollaborator,
  updateCollaborator,
  type CollaboratorInput,
} from "@/lib/collaboration";

type SaveCollaboratorInput = CollaboratorInput & {
  collaboratorId?: string | null;
};

export async function saveCollaboratorAction(input: SaveCollaboratorInput) {
  const user = await requireUser();

  const result = input.collaboratorId
    ? await updateCollaborator(input.collaboratorId, input)
    : await createCollaborator(getUserDisplayName(user), input);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/collaboration");

  return result;
}
