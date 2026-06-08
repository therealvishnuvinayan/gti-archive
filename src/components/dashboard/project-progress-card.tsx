type ProgressSegment = {
  label: string;
  value: number;
  count: number;
  tone: "ongoing" | "pending" | "onHold" | "completed";
};

type ProjectProgressCardProps = {
  title: string;
  percentage: number;
  subtitle: string;
  segments: readonly ProgressSegment[];
};

const segmentStroke: Record<ProgressSegment["tone"], string> = {
  ongoing: "#2b8055",
  pending: "#d2d3d2",
  onHold: "#f2b84b",
  completed: "#154d35",
};

const segmentDotClass: Record<ProgressSegment["tone"], string> = {
  ongoing: "bg-brand",
  pending: "bg-[#d2d3d2]",
  onHold: "bg-[#f2b84b]",
  completed: "bg-brand-dark",
};

export function ProjectProgressCard({
  title,
  percentage,
  subtitle,
  segments,
}: ProjectProgressCardProps) {
  const activeSegmentValue = Math.min(Math.max(percentage, 0), 100);

  return (
    <article className="min-w-0 rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <h2 className="mb-4 text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">
        {title}
      </h2>

      <div className="flex flex-col items-center">
        <div className="relative w-full max-w-[280px]">
          <svg viewBox="0 0 240 140" className="w-full" aria-hidden="true">
            <path
              d="M 30 110 A 80 80 0 0 1 210 110"
              fill="none"
              stroke={segmentStroke.pending}
              strokeWidth="28"
              strokeLinecap="round"
              pathLength={100}
            />
            {activeSegmentValue > 0 ? (
              <path
                d="M 30 110 A 80 80 0 0 1 210 110"
                fill="none"
                stroke={segmentStroke.ongoing}
                strokeWidth="28"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${activeSegmentValue} ${100 - activeSegmentValue}`}
              />
            ) : null}
          </svg>

          <div className="absolute inset-x-0 bottom-2 text-center">
            <p className="text-[44px] font-bold leading-none tracking-[-0.04em] text-[#111712]">
              {percentage}%
            </p>
            <p className="mt-1 text-[12px] text-[#8bc685]">{subtitle}</p>
          </div>
        </div>

        <ul className="mt-5 grid w-full grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-[#3b413d]">
          {segments.map((segment) => (
            <li key={segment.label} className="flex min-w-0 items-center gap-2">
              <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${segmentDotClass[segment.tone]}`} />
              <span className="min-w-0 leading-4">
                {segment.label} ({segment.count})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
