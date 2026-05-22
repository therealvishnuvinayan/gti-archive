import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full rounded-[20px] border border-transparent bg-white px-4 py-3 text-sm text-[#29322c] outline-none transition focus-visible:ring-3 focus-visible:ring-brand/15 placeholder:text-[#9aa39b] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
