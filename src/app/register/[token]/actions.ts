"use server";

import { redirect } from "next/navigation";

import type { RegisterState } from "@/app/register/register-state";
import { acceptCollaboratorInvite } from "@/lib/collaboration";

export async function completeRegistrationAction(
  token: string,
  _previousState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const result = await acceptCollaboratorInvite(token, password, confirmPassword);

  if ("error" in result) {
    return { error: result.error };
  }

  redirect("/sign-in");
}
