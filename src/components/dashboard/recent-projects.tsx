import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type RecentProject = {
  id: string;
  name: string;
  statusLabel: string;
  meta: string;
  href: string;
  tone: "brand" | "deep" | "muted";
};

type RecentProjectsProps = {
  title: string;
  items: RecentProject[];
  href?: string;
};

const dotTone: Record<RecentProject["tone"], string> = {
  brand: "bg-brand",
  deep: "bg-brand-dark",
  muted: "bg-[#d1d3d1]",
};

export function RecentProjects({ title, items, href }: RecentProjectsProps) {
  return (
    <article className="min-w-0 rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <h2 className="min-w-0 truncate text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">
          {title}
        </h2>
        {href ? (
          <Link
            href={href}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#1e241f] bg-white text-[#111712] transition-colors hover:bg-brand-soft"
            aria-label={`${title} details`}
            title={`${title} details`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul className="dashboard-scroll-thin max-h-[284px] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex min-h-[68px] min-w-0 cursor-pointer items-center gap-2.5 rounded-[18px] border border-transparent px-2.5 py-2.5 transition-colors hover:border-[#d8e6d8] hover:bg-[#f5faf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                title={`Open ${item.name}`}
              >
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${dotTone[item.tone]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-[700] leading-[1.25] text-[#1f6c49]">
                    {item.name}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2 text-[11px] leading-4 text-[#667168]">
                    <span className="shrink-0 rounded-full bg-[#eaf4ec] px-2 py-0.5 font-[700] text-[#2b8055]">
                      {item.statusLabel}
                    </span>
                    <span className="min-w-0 truncate">{item.meta}</span>
                  </span>
                </span>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#d6e2d6] bg-white text-[#23472f] transition-colors group-hover:border-brand/40 group-hover:bg-brand-soft">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] leading-6 text-[#758077]">
          No projects yet. Create your first project to see it here.
        </p>
      )}
    </article>
  );
}
