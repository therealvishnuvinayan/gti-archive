"use client";

import { useActionState, useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useFormStatus } from "react-dom";

import {
  initialRegisterState,
  type RegisterState,
} from "@/app/register/register-state";
import {
  getPasswordValidationMessage,
  PASSWORD_REQUIREMENTS,
} from "@/lib/password-rules";

type RegisterFormProps = {
  email: string;
  action: (state: RegisterState, formData: FormData) => Promise<RegisterState>;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[58px] w-full items-center justify-center rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-[18px] font-semibold text-white shadow-[0_18px_38px_rgba(23,90,59,0.18)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Setting password..." : "Set Password"}
    </button>
  );
}

export function RegisterForm({ email, action }: RegisterFormProps) {
  const [state, formAction] = useActionState<RegisterState, FormData>(
    action,
    initialRegisterState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [clientError, setClientError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const passwordValidationMessage = getPasswordValidationMessage(password);

    setClientError(undefined);

    if (passwordValidationMessage) {
      event.preventDefault();
      setClientError(passwordValidationMessage);
      return;
    }

    if (password !== confirmPassword) {
      event.preventDefault();
      setClientError("Passwords do not match.");
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[42px] font-[600] leading-[1.05] tracking-[-0.04em] text-[#19211b] sm:text-[52px]">
          Set your password
        </h1>
        <p className="text-[17px] text-[#738076]">
          Finish your collaborator registration to access GTI Archive.
        </p>
      </div>

      <div className="space-y-6">
        <label className="block space-y-3">
          <span className="block text-[16px] font-semibold text-[#1f2821]">
            Email address
          </span>
          <span className="flex h-[62px] items-center gap-4 rounded-[18px] border border-[#d9e0d8] bg-[#f7faf7] px-5 shadow-[0_10px_34px_rgba(24,40,29,0.04)]">
            <Mail className="h-5 w-5 text-[#8d968d]" />
            <input
              type="email"
              value={email}
              disabled
              className="w-full bg-transparent text-[17px] text-[#1b231d] outline-none"
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
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Create a password"
              className="w-full bg-transparent text-[17px] text-[#1b231d] outline-none placeholder:text-[#a6ada5]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="text-[#8d968d] transition-colors hover:text-[#1d241f]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </span>
        </label>

        <label className="block space-y-3">
          <span className="block text-[16px] font-semibold text-[#1f2821]">
            Confirm password
          </span>
          <span className="flex h-[62px] items-center gap-4 rounded-[18px] border border-[#d9e0d8] bg-white px-5 shadow-[0_10px_34px_rgba(24,40,29,0.04)]">
            <LockKeyhole className="h-5 w-5 text-[#8d968d]" />
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              autoComplete="new-password"
              required
              placeholder="Confirm your password"
              className="w-full bg-transparent text-[17px] text-[#1b231d] outline-none placeholder:text-[#a6ada5]"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="text-[#8d968d] transition-colors hover:text-[#1d241f]"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </span>
        </label>

        <div className="rounded-[18px] border border-[#dfe8df] bg-[#f7faf7] px-5 py-4">
          <p className="text-[14px] font-[700] text-[#253129]">
            Password requirements
          </p>
          <ul className="mt-3 space-y-2 text-[14px] text-[#68736a]">
            {PASSWORD_REQUIREMENTS.map((requirement) => (
              <li key={requirement} className="flex gap-2">
                <span className="mt-[0.45em] h-1.5 w-1.5 rounded-full bg-[#2f8d5d]" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {clientError || state.error ? (
        <p className="rounded-2xl border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[14px] font-medium text-[#ba3f31]">
          {clientError || state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
