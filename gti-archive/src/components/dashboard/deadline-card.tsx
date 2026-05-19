import { ArrowUpRight, Pause, Square } from "lucide-react";

type DeadlineCardProps = {
  title: string;
  project: string;
  timeLeft: string;
};

export function DeadlineCard({
  title,
  project,
  timeLeft,
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
            <p className="mt-2 text-[14px] text-white/85">{project}</p>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/40 bg-white/5 text-white backdrop-blur-sm"
            aria-label={`${title} details`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        <p className="text-center text-[40px] font-bold tracking-[-0.04em]">
          {timeLeft}
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#121713]"
            aria-label="Pause timer"
          >
            <Pause className="h-4 w-4 fill-current" />
          </button>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full bg-[#ff4a1e] text-white"
            aria-label="Stop timer"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </div>
      </div>
    </article>
  );
}
