import Link from "next/link";
import { FolderKanban, PanelsTopLeft } from "lucide-react";

import { MotionSection } from "@/components/motion/motion-primitives";
import { cn } from "@/lib/utils";

type ProjectView = "collaborative" | "private";

const tabClassName =
  "flex h-10 shrink-0 items-center gap-2 rounded-[11px] px-4 text-[13px] font-[700] leading-none transition sm:px-5";

export function ProjectTypeSwitcher({
  activeView,
  collaborativeHref = "/projects",
  privateHref = "/projects?view=flexible",
}: {
  activeView: ProjectView;
  collaborativeHref?: string;
  privateHref?: string;
}) {
  return (
    <MotionSection>
      <div
        role="tablist"
        aria-label="Project type"
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[15px] border border-[#d5ded6] bg-white p-1 shadow-[0_8px_22px_rgba(18,34,25,0.035)]"
      >
        <Link
          href={collaborativeHref}
          role="tab"
          aria-selected={activeView === "collaborative"}
          className={cn(
            tabClassName,
            activeView === "collaborative"
              ? "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_9px_20px_rgba(31,112,70,0.22)]"
              : "text-[#4a554d] hover:bg-[#f0f4f0]",
          )}
        >
          <FolderKanban className="size-4" />
          Collaborative Projects
        </Link>
        <Link
          href={privateHref}
          role="tab"
          aria-selected={activeView === "private"}
          className={cn(
            tabClassName,
            activeView === "private"
              ? "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_9px_20px_rgba(31,112,70,0.22)]"
              : "text-[#4a554d] hover:bg-[#f0f4f0]",
          )}
        >
          <PanelsTopLeft className="size-4" />
          Private Projects
        </Link>
      </div>
    </MotionSection>
  );
}
