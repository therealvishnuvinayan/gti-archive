import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand/35",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_16px_34px_rgba(34,102,70,0.18)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(34,102,70,0.24)]",
        secondary:
          "border border-[#d8dfd8] bg-white text-[#152019] shadow-[0_12px_28px_rgba(23,39,28,0.05)] hover:bg-[#f7faf7]",
        outline:
          "border border-brand/35 bg-white text-brand hover:bg-brand-soft/60",
        ghost: "text-[#2a332d] hover:bg-[#eef2ed]",
        destructive:
          "bg-[#c2463c] text-white shadow-[0_14px_30px_rgba(194,70,60,0.24)] hover:bg-[#a7382f]",
      },
      size: {
        default: "min-h-11 px-5 py-2.5",
        sm: "min-h-9 px-4 py-2 text-xs",
        lg: "min-h-[52px] px-7 py-3 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
