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
    <Button asChild size="lg" variant="secondary" className="min-w-[132px]">
      <Link href={href}>
        <ChevronLeft className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
