"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type FlexibleDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  onClose: () => void;
};

export function FlexibleDialog({
  open,
  title,
  description,
  children,
  footer,
  maxWidth = "max-w-[680px]",
  onClose,
}: FlexibleDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#112118]/50 px-3 py-4 backdrop-blur-[3px] sm:px-5 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[24px] border border-[#dfe6df] bg-[#f7f9f5] shadow-[0_36px_100px_rgba(9,29,17,0.28)] sm:max-h-[calc(100dvh-4rem)] sm:rounded-[28px] ${maxWidth}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-[#e0e6df] bg-white px-5 py-5 sm:px-7 sm:py-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[23px] font-[750] tracking-[-0.035em] text-[#111712] sm:text-[27px]">{title}</h2>
            {description ? <p className="mt-1.5 text-[13px] leading-5 text-[#6c756e]">{description}</p> : null}
          </div>
          <Button type="button" variant="secondary" size="icon" onClick={onClose} className="size-9 shrink-0 border-[#dfe5df] shadow-none" aria-label={`Close ${title}`}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="dashboard-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">{children}</div>
        {footer ? <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-[#e0e6df] bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
