import { ArrowUpRight } from "lucide-react";

export type RecentProject = {
  name: string;
  tone: "brand" | "deep" | "muted";
};

type RecentProjectsProps = {
  title: string;
  items: RecentProject[];
};

const dotTone: Record<RecentProject["tone"], string> = {
  brand: "bg-brand",
  deep: "bg-brand-dark",
  muted: "bg-[#d1d3d1]",
};

export function RecentProjects({ title, items }: RecentProjectsProps) {
  return (
    <article className="rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">{title}</h2>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full border border-[#1e241f] bg-white text-[#111712]"
          aria-label={`${title} details`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-5">
          {items.map((item) => (
            <li key={item.name} className="flex items-start gap-3">
              <span className={`mt-1 h-6 w-6 shrink-0 rounded-full ${dotTone[item.tone]}`} />
              <p className="text-[14px] font-medium leading-[1.25] text-[#236e4c]">
                {item.name}
              </p>
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
