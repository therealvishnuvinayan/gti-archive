import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type Collaborator = {
  name: string;
  task: string;
  project: string;
  href?: string;
};

type CollaborationCardProps = {
  title: string;
  items: Collaborator[];
  href?: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CollaborationCard({ title, items, href }: CollaborationCardProps) {
  return (
    <article className="min-w-0 rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <h2 className="min-w-0 text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">{title}</h2>
        {href ? (
          <Link
            href={href}
            className="grid h-9 w-9 place-items-center rounded-full border border-[#1e241f] bg-white text-[#111712] transition-colors hover:bg-brand-soft"
            aria-label={`${title} details`}
            title={`${title} details`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul className="dashboard-scroll-thin -mr-2 max-h-[280px] space-y-2 overflow-y-auto pr-2">
          {items.map((item) => {
            const content = (
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-xs font-extrabold text-white shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)]">
                  {getInitials(item.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#121813]">
                    {item.name}
                  </p>
                  <p className="truncate text-[12px] text-[#363d38]">
                    {item.task} <span className="text-[#8a928c]">·</span>{" "}
                    <span className="font-semibold">{item.project}</span>
                  </p>
                </div>
              </div>
            );

            return (
              <li key={`${item.name}-${item.project}`}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex min-h-[54px] min-w-0 items-center gap-3 rounded-[16px] px-2 py-2 transition-colors hover:bg-[#f5faf5]"
                    title={`${item.name} on ${item.project}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-h-[54px] min-w-0 items-center gap-3 px-2 py-2">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[14px] leading-6 text-[#758077]">
          No active collaborators yet.
        </p>
      )}
    </article>
  );
}
