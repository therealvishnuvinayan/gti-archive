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
      <h2 className="mb-4 text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">{title}</h2>

      {items.length > 0 ? (
        <ul className="dashboard-scroll-thin -mr-2 max-h-[280px] space-y-2 overflow-y-auto pr-2">
          {items.map((item) => {
            const tone = toneClasses[item.tone];
            const content = (
              <>
                <span className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ${tone.dot}`} />
                <div className="min-w-0">
                  <p className={`truncate text-[14px] font-semibold leading-[1.25] ${tone.title}`}>
                    {item.title}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-[#464d47]">{item.project}</p>
                </div>
              </>
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex min-h-[46px] min-w-0 items-start gap-3 rounded-[16px] px-2 py-2 transition-colors hover:bg-[#f5faf5]"
                    title={item.title}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-h-[46px] min-w-0 items-start gap-3 px-2 py-2">{content}</div>
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
