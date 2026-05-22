"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  createCollaborator,
  updateCollaborator,
  type CollaboratorInput,
} from "@/lib/collaboration";

type SaveCollaboratorInput = CollaboratorInput & {
  collaboratorId?: string | null;
};

export async function saveCollaboratorAction(input: SaveCollaboratorInput) {
  await requireUser();

  const result = input.collaboratorId
    ? await updateCollaborator(input.collaboratorId, input)
    : await createCollaborator(input);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/collaboration");

  return result;
}
