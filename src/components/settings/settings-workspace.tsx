import type { ComponentType, ReactNode } from "react";
import {
  Bell,
  BrushCleaning,
  Globe,
  LaptopMinimal,
  LockKeyhole,
  PencilLine,
  ScrollText,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";

type SettingsWorkspaceProps = {
  user: {
    name: string;
    email: string;
    role: string;
  };
};

type SettingsNavItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
};

const settingsNavItems: SettingsNavItem[] = [
  { label: "Profile", icon: UserRound, active: true },
  { label: "Notifications", icon: Bell },
  { label: "Password", icon: LockKeyhole },
  { label: "Security", icon: ShieldCheck },
  { label: "Preferences", icon: SlidersHorizontal },
  { label: "Appearance", icon: BrushCleaning },
  { label: "Language & Region", icon: Globe },
  { label: "Sessions", icon: LaptopMinimal },
  { label: "Audit Log", icon: ScrollText },
];

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
  actionIcon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[#ebefe8] bg-white p-5 shadow-[0_16px_48px_rgba(23,39,28,0.05)] sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-[28px] font-[600] leading-tight tracking-[-0.03em] text-[#1b231d]">
            {title}
          </h2>
          <p className="text-[14px] text-[#768078]">{description}</p>
        </div>

        {actionLabel ? (
          <button
            type="button"
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-[#b8d8c0] bg-[#fbfefc] px-4 text-[13px] font-semibold text-brand shadow-[0_8px_20px_rgba(35,104,72,0.06)] transition-colors hover:bg-brand-soft"
          >
            {ActionIcon ? <ActionIcon className="h-4 w-4" /> : null}
            {actionLabel}
          </button>
        ) : null}
      </div>

      <div className="mt-5">{children}</div>
    </section>
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

export function SettingsWorkspace({ user }: SettingsWorkspaceProps) {
  const profileRows = [
    { label: "Full Name", value: user.name },
    { label: "Email Address", value: user.email },
    { label: "Role", value: user.role },
    { label: "Department", value: getDepartmentFromRole(user.role) },
    { label: "Member Since", value: "Jan 15, 2024" },
  ];

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-[44px] font-[600] leading-none tracking-[-0.05em] text-[#121813]">
          Settings
        </h1>
        <p className="text-[15px] text-[#6f776f]">
          Manage your account, preferences and system settings.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-[24px] border border-[#ebefe8] bg-white p-4 shadow-[0_16px_48px_rgba(23,39,28,0.05)]">
          <nav aria-label="Settings sections">
            <ul className="space-y-1.5">
              {settingsNavItems.map((item) => {
                const Icon = item.icon;

                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[14px] font-semibold transition-colors ${
                        item.active
                          ? "bg-[#f5faf6] text-brand"
                          : "text-[#5f685f] hover:bg-[#f7faf7] hover:text-[#1d271f]"
                      }`}
                    >
                      <Icon
                        className={`h-4.5 w-4.5 ${
                          item.active ? "text-brand" : "text-[#7f897f]"
                        }`}
                      />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="space-y-4">
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
              <p className="text-[15px] font-semibold text-[#1e261f]">
                May 10, 2025
              </p>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Two-Factor Authentication"
            description="Add an extra layer of security to your account."
            actionLabel="Enable 2FA"
            actionIcon={ShieldCheck}
          >
            <div className="flex items-start gap-4 rounded-[20px] bg-[#fbfcfa] px-4 py-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#edf7ef] text-brand">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-[14px] font-medium text-[#5f685f]">
                  Two-factor authentication is currently disabled.
                </p>
                <p className="text-[14px] text-[#7f887f]">
                  Enable 2FA to protect your account from unauthorized access.
                </p>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Preferences"
            description="Choose how your dashboard experience should behave."
            actionLabel="Manage Preferences"
            actionIcon={Settings2}
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {[
                {
                  label: "Email notifications",
                  value: "Enabled",
                },
                {
                  label: "Default workspace",
                  value: "Projects",
                },
                {
                  label: "Language",
                  value: "English (UAE)",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[18px] border border-[#eef2eb] bg-[#fbfcfa] px-4 py-4"
                >
                  <p className="text-[12px] font-medium text-[#7c857d]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-[#1e261f]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </SettingsCard>
        </div>
      </div>
    </section>
  );
}
