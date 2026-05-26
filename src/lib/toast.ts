"use client";

import { toast } from "sonner";

export function showSuccessToast(title: string, description?: string) {
  return toast.success(title, { description });
}

export function showErrorToast(title: string, description?: string) {
  return toast.error(title, { description });
}

export function showWarningToast(title: string, description?: string) {
  return toast.warning(title, { description });
}

export function showInfoToast(title: string, description?: string) {
  return toast.info(title, { description });
}

export function showLoadingToast(title: string, description?: string) {
  return toast.loading(title, { description });
}

export function dismissToast(toastId?: string | number) {
  toast.dismiss(toastId);
}
