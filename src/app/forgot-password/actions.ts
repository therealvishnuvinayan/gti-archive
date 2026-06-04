"use server";

import type { ForgotPasswordState } from "@/app/forgot-password/forgot-password-state";
import { requestPasswordReset } from "@/lib/password-reset";

export async function requestPasswordResetAction(
  _previousState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");

  if (!email.trim()) {
    return {
      error: "Email address is required.",
    };
  }

  const result = await requestPasswordReset(email);

  return {
    success: result.message,
  };
}
