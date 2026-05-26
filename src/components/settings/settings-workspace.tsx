import Link from "next/link";
import { LockKeyhole, PencilLine, Settings2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SettingsWorkspaceProps = {
  user: {
    name: string;
    email: string;
    role: string;
    memberSince: string;
  };
  canManageMasterData?: boolean;
};

function SettingsCard({
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  children,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[24px] border border-[#ebefe8] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-[28px] font-[600] leading-tight tracking-[-0.03em] text-[#1b231d]">
            {title}
          </h2>
          <p className="text-[14px] text-[#768078]">{description}</p>
        </div>

        {actionLabel ? (
          <Button
            type="button"
            variant="outline"
            className="h-[42px] gap-2 rounded-xl border-[#b8d8c0] bg-[#fbfefc] px-4 text-[13px] font-semibold text-brand shadow-[0_8px_20px_rgba(35,104,72,0.06)] hover:bg-brand-soft"
          >
            {ActionIcon ? <ActionIcon className="h-4 w-4" /> : null}
            {actionLabel}
          </Button>
        ) : null}
      </div>

      <div className="mt-5">{children}</div>
    </Card>
  );
}

function getDepartmentFromRole(role: string) {
  if (role === "Super Admin") {
    return "System Administration";
  }

  if (role === "Admin") {
    return "Project Management";
  }

  return "Design & Packaging";
}

export function SettingsWorkspace({
  user,
  canManageMasterData = false,
}: SettingsWorkspaceProps) {
  const profileRows = [
    { label: "Full Name", value: user.name },
    { label: "Email Address", value: user.email },
    { label: "Role", value: user.role },
    { label: "Department", value: getDepartmentFromRole(user.role) },
    { label: "Member Since", value: user.memberSince },
  ];

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-[44px] font-[600] leading-none tracking-[-0.05em] text-[#121813]">
          Settings
        </h1>
        <p className="text-[15px] text-[#6f776f]">
          Manage core account and project configuration.
        </p>
      </header>

      <div className="mx-auto max-w-[980px] space-y-4">
        <SettingsCard
          title="Profile Information"
          description="Update your personal information and how others see you."
          actionLabel="Edit Profile"
          actionIcon={PencilLine}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_top,#ffd6c3,#d98e6a_55%,#855038)] text-[28px] font-bold text-white shadow-[0_14px_34px_rgba(26,49,36,0.12)]">
              {user.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("")}
            </div>

            <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              {profileRows.map((row) => (
                <div key={row.label} className="space-y-1">
                  <p className="text-[12px] font-medium text-[#7c857d]">
                    {row.label}
                  </p>
                  <p className="text-[16px] font-semibold text-[#1c241d]">
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Password"
          description="Update your password regularly to keep your account secure."
          actionLabel="Change Password"
          actionIcon={LockKeyhole}
        >
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-[#7c857d]">Last changed</p>
            <p className="text-[15px] font-semibold text-[#1e261f]">—</p>
          </div>
        </SettingsCard>

        {canManageMasterData ? (
          <SettingsCard
            title="Project Master Data"
            description="Manage reusable project categories and tags used across project forms and filters."
            actionLabel="Open Project Master Data"
            actionIcon={Settings2}
          >
            <div className="flex flex-col gap-4 rounded-[22px] bg-[#fbfcfa] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-[15px] font-semibold text-[#1e261f]">
                  Categories and tags
                </p>
                <p className="text-[14px] text-[#748074]">
                  Manage reusable values used across project forms and filters.
                </p>
              </div>

              <Button asChild className="self-start sm:self-auto">
                <Link href="/settings/project-master-data">Open Project Master Data</Link>
              </Button>
            </div>
          </SettingsCard>
        ) : null}
      </div>
    </section>
  );
}
