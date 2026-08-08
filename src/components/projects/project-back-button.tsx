import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

type ProjectBackButtonProps = {
  href?: string;
  label?: string;
  ariaLabel?: string;
};

export function ProjectBackButton({
  href = "/projects",
  label = "Back",
  ariaLabel,
}: ProjectBackButtonProps) {
  return (
    <Button asChild size="sm" variant="secondary" className="min-h-9 rounded-[12px] px-3.5 shadow-none">
      <Link href={href} aria-label={ariaLabel ?? label}>
        <ChevronLeft className="h-4 w-4" />
        <span className="sm:hidden">Back</span>
        <span className="hidden sm:inline">{label}</span>
      </Link>
    </Button>
  );
}
