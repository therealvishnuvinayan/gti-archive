import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

type ProjectBackButtonProps = {
  href?: string;
  label?: string;
};

export function ProjectBackButton({
  href = "/projects",
  label = "Back",
}: ProjectBackButtonProps) {
  return (
    <Button asChild size="sm" variant="secondary" className="min-h-9 rounded-[12px] px-3.5 shadow-none">
      <Link href={href}>
        <ChevronLeft className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
