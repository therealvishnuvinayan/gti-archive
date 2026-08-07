"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  createProjectV2,
  type CreateProjectV2Input,
  type CreateProjectV2Result,
} from "@/lib/project-creation";
import { hasPermission } from "@/lib/permissions/resolver";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function createProjectV2Action(
  input: CreateProjectV2Input,
): Promise<CreateProjectV2Result> {
  const user = await requireUser();

  if (!hasPermission(user, "project.create")) {
    return {
      error: "You are not allowed to create projects.",
    };
  }

  try {
    const result = await createProjectV2(user, input);

    if ("error" in result) {
      return result;
    }

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/notifications");
    revalidateTag(PROJECTS_CACHE_TAG, "max");

    return result;
  } catch (error) {
    console.error("[projects] V2 project creation failed", error);

    return {
      error: "Unable to create the project right now. Please try again.",
    };
  }
}
