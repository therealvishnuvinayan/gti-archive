"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Mail } from "lucide-react";

import {
  requestPasswordResetAction,
} from "@/app/forgot-password/actions";
import {
  initialForgotPasswordState,
  type ForgotPasswordState,
} from "@/app/forgot-password/forgot-password-state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[58px] w-full items-center justify-center rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-[18px] font-semibold text-white shadow-[0_18px_38px_rgba(23,90,59,0.18)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Sending..." : "Send Reset Link"}
    </button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordResetAction,
    initialForgotPasswordState,
  );

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[42px] font-[600] leading-[1.05] tracking-[-0.04em] text-[#19211b] sm:text-[52px]">
          Reset password
        </h1>
        <p className="text-[17px] text-[#738076]">
          Enter your email address and we will send a reset link if the account exists.
        </p>
      </div>

      <label className="block space-y-3">
        <span className="block text-[16px] font-semibold text-[#1f2821]">
          Email address
        </span>
        <span className="flex h-[62px] items-center gap-4 rounded-[18px] border border-[#d9e0d8] bg-white px-5 shadow-[0_10px_34px_rgba(24,40,29,0.04)]">
          <Mail className="h-5 w-5 text-[#8d968d]" />
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="Enter your email"
            className="w-full bg-transparent text-[17px] text-[#1b231d] outline-none placeholder:text-[#a6ada5]"
          />
        </span>
      </label>

      {state.error ? (
        <p className="rounded-2xl border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[14px] font-medium text-[#ba3f31]">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-2xl border border-[#dce8de] bg-[#f6fbf7] px-4 py-3 text-[14px] font-medium text-brand">
          {state.success}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
