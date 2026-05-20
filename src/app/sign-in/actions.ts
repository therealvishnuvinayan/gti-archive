"use server";

import { redirect } from "next/navigation";

import type { SignInState } from "@/app/sign-in/sign-in-state";
import { AuthError, signInUser } from "@/lib/auth";

export async function signInAction(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const rememberMe = formData.get("rememberMe") === "on";

  try {
    await signInUser({
      email,
      password,
      rememberMe,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.message };
    }

    return { error: "Unable to sign in right now. Please try again." };
  }

  redirect("/");
}
