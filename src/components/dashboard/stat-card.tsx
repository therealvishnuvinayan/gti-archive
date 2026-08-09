import Link from "next/link";
import {
  Activity,
  CircleCheckBig,
  Grid2X2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { DashboardKpi } from "@/lib/dashboard";

const KPI_ICONS: Record<DashboardKpi["icon"], LucideIcon> = {
  projects: Grid2X2,
  active: Activity,
  attention: TriangleAlert,
  completed: CircleCheckBig,
};

export function StatCard({
  label,
  value,
  note,
  href,
  icon,
  tone,
}: DashboardKpi) {
  const Icon = KPI_ICONS[icon];
  const isAmber = tone === "amber";

  return (
    <Link
      href={href}
      aria-label={`View ${label.toLowerCase()}`}
      className="group block h-full rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#188554] focus-visible:ring-offset-2"
    >
      <article className="flex min-h-[128px] h-full items-start gap-4 rounded-[20px] border border-[#e3e8e3] bg-white p-5 shadow-[0_12px_32px_rgba(30,53,39,0.055)] transition duration-150 group-hover:-translate-y-0.5 group-hover:border-[#cbd9ce] group-hover:shadow-[0_16px_36px_rgba(30,53,39,0.09)] sm:p-6">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-[14px] ${
            isAmber
              ? "bg-[#fff2e4] text-[#e26b0a]"
              : "bg-[#e9f5eb] text-[#258858]"
          }`}
        >
          <Icon className="h-6 w-6" strokeWidth={1.9} />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold leading-5 text-[#242b26]">
            {label}
          </span>
          <span className="mt-0.5 block text-[30px] font-bold leading-none tracking-[-0.035em] text-[#101512]">
            {value}
          </span>
          <span
            className={`mt-2 block truncate text-[12px] font-medium ${
              isAmber ? "text-[#de5f00]" : "text-[#31915f]"
            }`}
          >
            {note}
          </span>
        </span>
      </article>
    </Link>
  );
}
