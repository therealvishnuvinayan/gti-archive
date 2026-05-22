import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.01em]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand text-white",
        secondary: "border-[#d8e1d8] bg-[#f6faf6] text-[#2b8055]",
        outline: "border-brand/25 bg-white text-brand",
        muted: "border-[#dde4dd] bg-[#f8faf8] text-[#556058]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return (
    <div
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
