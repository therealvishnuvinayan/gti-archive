import Link from "next/link";

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
    <Button asChild size="lg" className="min-w-[146px]">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
