export type UpdateItem = {
  title: string;
  project: string;
  tone: "critical" | "success" | "warning";
};

type UpdateListProps = {
  title: string;
  items: UpdateItem[];
};

const toneClasses: Record<UpdateItem["tone"], { dot: string; title: string }> = {
  critical: {
    dot: "bg-[#ff3813]",
    title: "text-[#ff2e00]",
  },
  success: {
    dot: "bg-brand",
    title: "text-[#236e4c]",
  },
  warning: {
    dot: "bg-[#ffae14]",
    title: "text-[#f39c03]",
  },
};

export function UpdateList({ title, items }: UpdateListProps) {
  return (
    <article className="rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <h2 className="mb-5 text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">{title}</h2>

      <ul className="space-y-4">
        {items.map((item) => {
          const tone = toneClasses[item.tone];

          return (
            <li key={`${item.title}-${item.project}`} className="flex items-start gap-3">
              <span className={`mt-1 h-5 w-5 shrink-0 rounded-full ${tone.dot}`} />
              <div>
                <p className={`text-[14px] font-semibold leading-[1.25] ${tone.title}`}>
                  {item.title}
                </p>
                <p className="mt-1 text-[12px] text-[#464d47]">{item.project}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
