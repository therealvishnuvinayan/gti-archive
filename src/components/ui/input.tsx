import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-full border border-transparent bg-white px-4 text-sm text-[#29322c] shadow-[0_2px_0_rgba(255,255,255,0.8)] outline-none transition focus-visible:ring-3 focus-visible:ring-brand/15 placeholder:text-[#9aa39b] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
