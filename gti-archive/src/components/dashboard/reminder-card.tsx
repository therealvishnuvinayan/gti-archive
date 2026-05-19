import { ArrowUpRight } from "lucide-react";

type ReminderCardProps = {
  title: string;
  headline: string;
  project: string;
  actionLabel: string;
};

export function ReminderCard({
  title,
  headline,
  project,
  actionLabel,
}: ReminderCardProps) {
  return (
    <article className="rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.08)] sm:p-6">
      <div className="mb-7 flex items-start justify-between gap-3">
        <h2 className="text-[18px] font-extrabold text-[#111712]">{title}</h2>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full border border-[#1e241f] bg-white text-[#111712]"
          aria-label={`${title} details`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-[24px] font-extrabold leading-[1.05] text-[#236e4c]">
            {headline}
          </p>
          <p className="mt-2 text-[15px] text-[#464d47]">{project}</p>
        </div>

        <button
          type="button"
          className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#3b9b69,#13422f)] px-6 text-xl font-semibold text-white transition-transform hover:-translate-y-0.5"
        >
          {actionLabel}
        </button>
      </div>
    </article>
  );
}
