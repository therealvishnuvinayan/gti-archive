"use server";

import { redirect } from "next/navigation";

import {
  resetPasswordWithToken,
  type ResetPasswordResult,
} from "@/lib/password-reset";

export async function resetPasswordAction(
  token: string,
  _previousState: ResetPasswordResult,
  formData: FormData,
): Promise<ResetPasswordResult> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const result = await resetPasswordWithToken(token, password, confirmPassword);

  if (result.success) {
    redirect("/sign-in");
  }

  return result;
}
