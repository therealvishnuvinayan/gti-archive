"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

import {
  initialSignInState,
  type SignInState,
} from "@/app/sign-in/sign-in-state";
import {
  signInAction,
} from "@/app/sign-in/actions";

type SignInFormProps = {
  hasAnyUsers: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[58px] w-full items-center justify-center rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-[18px] font-semibold text-white shadow-[0_18px_38px_rgba(23,90,59,0.18)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Signing in..." : "Sign In"}
    </button>
  );
}

export function SignInForm({ hasAnyUsers }: SignInFormProps) {
  const [state, formAction] = useActionState<SignInState, FormData>(
    signInAction,
    initialSignInState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[42px] font-[600] leading-[1.05] tracking-[-0.04em] text-[#19211b] sm:text-[52px]">
          Sign in to your account
        </h1>
        <p className="text-[17px] text-[#738076]">
          Enter your credentials to access the PMS
        </p>
        {!hasAnyUsers ? (
          <p className="rounded-2xl border border-[#dce8de] bg-[#f6fbf7] px-4 py-3 text-[14px] font-medium text-brand">
            No users are available yet. A super admin must create your account
            before you can sign in.
          </p>
        ) : null}
      </div>

      <div className="space-y-6">
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

        <label className="block space-y-3">
          <span className="block text-[16px] font-semibold text-[#1f2821]">
            Password
          </span>
          <span className="flex h-[62px] items-center gap-4 rounded-[18px] border border-[#d9e0d8] bg-white px-5 shadow-[0_10px_34px_rgba(24,40,29,0.04)]">
            <LockKeyhole className="h-5 w-5 text-[#8d968d]" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="Enter your password"
              className="w-full bg-transparent text-[17px] text-[#1b231d] outline-none placeholder:text-[#a6ada5]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="text-[#8d968d] transition-colors hover:text-[#1d241f]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-3 text-[16px] font-medium text-[#435046]">
          <input
            type="checkbox"
            name="rememberMe"
            defaultChecked
            className="h-4.5 w-4.5 rounded border border-[#bdd2c2] accent-brand"
          />
          Remember me
        </label>

        <button
          type="button"
          className="text-left text-[16px] font-semibold text-brand transition-colors hover:text-brand-dark"
        >
          Forgot password?
        </button>
      </div>

      {state.error ? (
        <p className="rounded-2xl border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[14px] font-medium text-[#ba3f31]">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-8">
        <SubmitButton />

        <div className="space-y-5 text-center">
          <div className="flex items-center gap-4">
            <span className="h-px flex-1 bg-[#d7ddd6]" />
            <span className="text-[16px] font-medium text-[#69756c]">
              Need help?
            </span>
            <span className="h-px flex-1 bg-[#d7ddd6]" />
          </div>

          <p className="text-[16px] text-[#67736b]">
            Contact your system administrator for access.
          </p>
        </div>
      </div>
    </form>
  );
}
