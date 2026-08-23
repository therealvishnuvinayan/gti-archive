import Link from "next/link";
import { FolderKanban, PanelsTopLeft } from "lucide-react";

import { MotionSection } from "@/components/motion/motion-primitives";
import { FlexibleProjectsBrowser } from "@/components/projects/flexible-projects-browser";
import type { FlexibleProjectListItem, FlexibleProjectUserOption } from "@/lib/flexible-projects";

export function FlexibleProjectsRouteWorkspace({
  projects,
  users,
  currentUserId,
  canCreateProject,
  showProjectTypeSwitcher,
}: {
  projects: FlexibleProjectListItem[];
  users: FlexibleProjectUserOption[];
  currentUserId: string;
  canCreateProject: boolean;
  showProjectTypeSwitcher: boolean;
}) {
  return (
    <div className="space-y-5">
      {showProjectTypeSwitcher ? (
        <MotionSection>
          <div role="tablist" aria-label="Project type" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[15px] border border-[#d5ded6] bg-white p-1 shadow-[0_8px_22px_rgba(18,34,25,0.035)]">
            <Link href="/projects" role="tab" aria-selected="false" className="flex h-10 shrink-0 items-center gap-2 rounded-[11px] px-4 text-[13px] font-[700] text-[#4a554d] transition hover:bg-[#f0f4f0] sm:px-5">
              <FolderKanban className="size-4" /> Artwork Projects
            </Link>
            <Link href="/projects?view=flexible" role="tab" aria-selected="true" className="flex h-10 shrink-0 items-center gap-2 rounded-[11px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-4 text-[13px] font-[700] text-white shadow-[0_9px_20px_rgba(31,112,70,0.22)] sm:px-5">
              <PanelsTopLeft className="size-4" /> Flexible Projects
            </Link>
          </div>
        </MotionSection>
      ) : null}
      <FlexibleProjectsBrowser canCreateProject={canCreateProject} projects={projects} users={users} currentUserId={currentUserId} />
    </div>
  );
}
