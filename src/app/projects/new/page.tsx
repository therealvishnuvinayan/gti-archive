import Link from "next/link";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";

function BackPill() {
  return (
    <Link
      href="/projects"
      className="inline-flex min-h-[52px] min-w-[128px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-8 text-[18px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-transform hover:-translate-y-0.5"
    >
      Back
    </Link>
  );
}

export default function NewProjectPage() {
  return (
    <DashboardLayout
      topbarProps={{
        leadingContent: <BackPill />,
        showSearch: false,
      }}
    >
      <CreateProjectWorkspace />
    </DashboardLayout>
  );
}
