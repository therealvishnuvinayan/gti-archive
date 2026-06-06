import Link from "next/link";

export type UpdateItem = {
  id: string;
  title: string;
  project: string;
  tone: "critical" | "success" | "warning";
  href?: string;
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

      {items.length > 0 ? (
        <ul className="dashboard-scroll-thin -mr-2 max-h-[292px] space-y-4 overflow-y-auto pr-2">
          {items.map((item) => {
            const tone = toneClasses[item.tone];
            const content = (
              <>
                <span className={`mt-1 h-5 w-5 shrink-0 rounded-full ${tone.dot}`} />
                <div>
                  <p className={`text-[14px] font-semibold leading-[1.25] ${tone.title}`}>
                    {item.title}
                  </p>
                  <p className="mt-1 text-[12px] text-[#464d47]">{item.project}</p>
                </div>
              </>
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 rounded-[18px] px-1 py-1 transition-colors hover:bg-[#f5faf5]"
                    title={item.title}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[14px] leading-6 text-[#758077]">
          No important updates yet.
        </p>
      )}
    </article>
  );
}
