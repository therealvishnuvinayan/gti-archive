type ProgressSegment = {
  label: string;
  value: number;
  tone: "completed" | "progress" | "pending";
};

type ProjectProgressCardProps = {
  title: string;
  percentage: number;
  subtitle: string;
  segments: readonly ProgressSegment[];
};

const segmentStroke: Record<ProgressSegment["tone"], string> = {
  completed: "#2b8055",
  progress: "#154d35",
  pending: "#d2d3d2",
};

const segmentDotClass: Record<ProgressSegment["tone"], string> = {
  completed: "bg-brand",
  progress: "bg-brand-dark",
  pending: "bg-[#d2d3d2]",
};

export function ProjectProgressCard({
  title,
  percentage,
  subtitle,
  segments,
}: ProjectProgressCardProps) {
  const completed =
    segments.find((segment) => segment.tone === "completed") ?? segments[0];
  const progress =
    segments.find((segment) => segment.tone === "progress") ?? segments[1];

  return (
    <article className="rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <h2 className="mb-4 text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">{title}</h2>

      <div className="flex flex-col items-center">
        <div className="relative w-full max-w-[320px]">
          <svg viewBox="0 0 240 140" className="w-full" aria-hidden="true">
            <path
              d="M 30 110 A 80 80 0 0 1 210 110"
              fill="none"
              stroke={segmentStroke.pending}
              strokeWidth="28"
              strokeLinecap="round"
              pathLength={100}
            />
            <path
              d="M 30 110 A 80 80 0 0 1 210 110"
              fill="none"
              stroke={segmentStroke.completed}
              strokeWidth="28"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${completed.value} ${100 - completed.value}`}
            />
            <path
              d="M 30 110 A 80 80 0 0 1 210 110"
              fill="none"
              stroke={segmentStroke.progress}
              strokeWidth="28"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${progress.value} ${100 - progress.value}`}
              strokeDashoffset={-completed.value}
            />
          </svg>

          <div className="absolute inset-x-0 bottom-2 text-center">
            <p className="text-[48px] font-bold leading-none tracking-[-0.04em] text-[#111712]">
              {percentage}%
            </p>
            <p className="mt-1 text-[12px] text-[#8bc685]">{subtitle}</p>
          </div>
        </div>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[11px] text-[#3b413d]">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2">
              <span className={`h-4 w-4 rounded-full ${segmentDotClass[segment.tone]}`} />
              <span>{segment.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
