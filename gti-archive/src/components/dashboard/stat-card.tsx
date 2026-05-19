import { ArrowUpRight } from "lucide-react";

export type StatCardProps = {
  title: string;
  value: string;
  delta: string;
  note: string;
  emphasize?: boolean;
};

export function StatCard({
  title,
  value,
  delta,
  note,
  emphasize = false,
}: StatCardProps) {
  return (
    <article
      className={`rounded-[24px] p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6 ${
        emphasize
          ? "bg-[linear-gradient(135deg,#3d6f59,#5da27a)] text-white"
          : "bg-card text-[#151b16]"
      }`}
    >
      <div className="mb-8 flex items-start justify-between gap-4">
        <h3
          className={`text-[18px] font-semibold ${
            emphasize ? "text-white" : "text-[#161d18]"
          }`}
        >
          {title}
        </h3>
        <div
          className={`grid h-9 w-9 place-items-center rounded-full border ${
            emphasize
              ? "border-white/35 bg-white text-brand"
              : "border-[#1e241f] bg-white text-[#161d18]"
          }`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>

      <p
        className={`text-4xl font-extrabold tracking-tight sm:text-[54px] ${
          emphasize ? "text-[#edf9ee]" : "text-[#0d1210]"
        }`}
      >
        {value}
      </p>

      <div className="mt-5 flex items-center gap-1.5 text-sm">
        <span
          className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
            emphasize
              ? "border-[#9ce184]/60 text-[#d4ffc8]"
              : "border-[#8fd285] text-[#80c671]"
          }`}
        >
          {delta}
        </span>
        <span className={emphasize ? "text-[#afe1aa]" : "text-[#95d285]"}>
          {note}
        </span>
      </div>
    </article>
  );
}
