import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type DeadlineCardProps = {
  title: string;
  project?: string;
  detail?: string;
  timeLabel?: string;
  actionHref?: string;
  actionLabel?: string;
  emptyMessage?: string;
  overdue?: boolean;
};

export function DeadlineCard({
  title,
  project,
  detail,
  timeLabel,
  actionHref,
  actionLabel = "Open Project",
  emptyMessage = "No upcoming deadlines.",
  overdue = false,
}: DeadlineCardProps) {
  return (
    <article className="relative overflow-hidden rounded-[24px] bg-[#07130e] p-6 text-white shadow-[0_20px_55px_rgba(7,19,14,0.28)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(92,165,123,0.32),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(44,124,82,0.46),transparent_30%),linear-gradient(145deg,#0a1610,#08110d_55%,#040807)]" />
      <div className="absolute -left-10 top-8 h-40 w-40 rounded-full border border-white/10" />
      <div className="absolute -right-12 bottom-10 h-44 w-44 rounded-full border border-brand/30" />
      <div className="absolute inset-x-4 bottom-14 h-24 rounded-full bg-[radial-gradient(circle,rgba(59,138,94,0.65),transparent_60%)] blur-2xl" />

      <div className="relative">
        <div className="mb-10 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-extrabold leading-none tracking-[-0.02em]">{title}</h2>
            {project ? (
              <p className="mt-2 text-[14px] text-white/85">{project}</p>
            ) : null}
          </div>
          {actionHref ? (
            <Link
              href={actionHref}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/40 bg-white/5 text-white backdrop-blur-sm transition-colors hover:bg-white/15"
              aria-label={`${title} details`}
              title={`${title} details`}
            >
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>

        {timeLabel ? (
          <div className="space-y-4">
            <p
              className={`text-center text-[34px] font-bold tracking-[-0.04em] ${
                overdue ? "text-[#ffb9a8]" : ""
              }`}
            >
              {timeLabel}
            </p>
            {detail ? (
              <p className="text-center text-[14px] text-white/80">{detail}</p>
            ) : null}
            {actionHref ? (
              <Link
                href={actionHref}
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-white text-[16px] font-semibold text-[#101612] transition-transform hover:-translate-y-0.5"
                title={actionLabel}
              >
                {actionLabel}
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="text-[14px] leading-6 text-white/78">{emptyMessage}</p>
        )}
      </div>
    </article>
  );
}
