import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type StatCardProps = {
  title: string;
  value: string;
  delta: string;
  note: string;
  href?: string;
  emphasize?: boolean;
};

export function StatCard({
  title,
  value,
  delta,
  note,
  href,
  emphasize = false,
}: StatCardProps) {
  const content = (
    <article
      className={`flex h-full min-h-[184px] min-w-0 flex-col rounded-[24px] p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] transition-transform sm:p-6 ${
        emphasize
          ? "bg-[linear-gradient(135deg,#3d6f59,#5da27a)] text-white"
          : "bg-card text-[#151b16]"
      }`}
    >
      <div className="mb-7 flex min-w-0 items-start justify-between gap-3">
        <h3
          className={`min-w-0 text-[17px] font-[600] leading-tight text-balance ${
            emphasize ? "text-[#f6fff3]" : "text-[#161d18]"
          }`}
        >
          {title}
        </h3>
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
            emphasize
              ? "border-white/35 bg-white text-brand"
              : "border-[#1e241f] bg-white text-[#161d18]"
          }`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>

      <p
        className={`text-[45px] font-[600] leading-none tracking-[-0.04em] ${
          emphasize ? "text-[#E3F9DE]" : "text-[#0d1210]"
        }`}
      >
        {value}
      </p>

      <div className="mt-auto flex min-w-0 items-center gap-1.5 pt-6 text-[14px]">
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[11px] font-[600] leading-none ${
            emphasize
              ? "border-[#9ce184]/60 text-[#d4ffc8]"
              : "border-[#8fd285] text-[#80c671]"
          }`}
        >
          {delta}
        </span>
        <span className={`min-w-0 truncate text-[13px] ${emphasize ? "text-[#afe1aa]" : "text-[#95d285]"}`}>
          {note}
        </span>
      </div>
    </article>
  );

  if (!href) {
    return content;
  }

  return (
    <Link
      href={href}
      aria-label={`View ${title.toLowerCase()}`}
      className="group block h-full rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <div className="h-full transition-transform duration-150 group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
        {content}
      </div>
    </Link>
  );
}
