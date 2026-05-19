import type { LucideIcon } from "lucide-react";
import {
  BookCopy,
  CalendarDays,
  HelpCircle,
  LayoutGrid,
  Library,
  LogOut,
  Settings,
  Users,
  Archive,
  X,
} from "lucide-react";

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  active?: boolean;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

const sidebarSections: SidebarSection[] = [
  {
    title: "Menu",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutGrid, active: true },
      { label: "Projects", href: "#", icon: BookCopy, badge: "6" },
      { label: "Calendar", href: "#", icon: CalendarDays },
      { label: "Collaboration", href: "#", icon: Users },
      { label: "Library", href: "#", icon: Library },
      { label: "Archives", href: "#", icon: Archive },
    ],
  },
  {
    title: "General",
    items: [
      { label: "Settings", href: "#", icon: Settings },
      { label: "Help", href: "#", icon: HelpCircle },
      { label: "Logout", href: "#", icon: LogOut },
    ],
  },
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

function LogoMark() {
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-[0_16px_40px_rgba(24,48,34,0.08)]">
        <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-brand/35 text-lg font-extrabold text-brand">
          G
        </div>
      </div>
      <div>
        <p className="text-[26px] font-extrabold uppercase tracking-[0.28em] text-[#202621]">
          Gulbahar
        </p>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Tobacco Int&apos;l FZE
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-[#152119]/45 transition-opacity duration-200 lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isOpen}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-3 left-3 z-40 flex w-[min(82vw,290px)] flex-col rounded-[30px] bg-sidebar px-6 py-7 shadow-[0_25px_80px_rgba(18,34,25,0.08)] transition-transform duration-300 lg:static lg:inset-auto lg:z-0 lg:w-[306px] lg:translate-x-0 lg:shadow-none ${
          isOpen ? "translate-x-0" : "-translate-x-[115%]"
        }`}
      >
        <div className="mb-10 flex items-start justify-between gap-3 lg:mb-14">
          <LogoMark />
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-white text-[#344038] lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-10">
          {sidebarSections.map((section) => (
            <div key={section.title}>
              <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted/75">
                {section.title}
              </p>
              <ul className="space-y-1.5">
                {section.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <li key={item.label} className="relative">
                      {item.active ? (
                        <span className="absolute inset-y-2 -left-6 w-2 rounded-r-full bg-brand" />
                      ) : null}
                      <a
                        href={item.href}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-semibold transition-colors ${
                          item.active
                            ? "bg-white text-[#18211a] shadow-[0_12px_30px_rgba(24,48,34,0.06)]"
                            : "text-[#6c736d] hover:bg-white/70 hover:text-[#263129]"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            item.active ? "text-brand" : "text-[#adb5af]"
                          }`}
                        />
                        <span className="flex-1">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-white">
                            {item.badge}
                          </span>
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
