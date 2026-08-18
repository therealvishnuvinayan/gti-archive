"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  updateArchivedFileInformation,
  type UpdateArchivedFileInformationInput,
} from "@/lib/archives";

export async function updateArchivedFileInformationAction(
  input: UpdateArchivedFileInformationInput,
) {
  const user = await requireUser();

  try {
    const file = await updateArchivedFileInformation(user, input);

    revalidatePath("/archives");
    revalidatePath(`/archives/${file.archiveCategorySlug}`);
    if (file.projectId) {
      revalidatePath(`/projects/${file.projectId}`);
      revalidatePath(`/projects/${file.projectId}/chat`);
    }

    return { file };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update the archive file right now.",
    };
  }
}
