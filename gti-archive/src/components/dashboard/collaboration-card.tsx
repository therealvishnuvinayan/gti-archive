import { ArrowUpRight } from "lucide-react";

export type Collaborator = {
  name: string;
  task: string;
  project: string;
  status: "Occupied" | "Rejected" | "Free";
};

type CollaborationCardProps = {
  title: string;
  items: Collaborator[];
};

const statusClasses: Record<Collaborator["status"], string> = {
  Occupied: "bg-[#f8c461] text-white border-[#e4a835]",
  Rejected: "bg-[#ff6b66] text-white border-[#f44842]",
  Free: "bg-[#81aa97] text-white border-[#628b77]",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CollaborationCard({ title, items }: CollaborationCardProps) {
  return (
    <article className="rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">{title}</h2>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full border border-[#1e241f] bg-white text-[#111712]"
          aria-label={`${title} details`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-xs font-extrabold text-white shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)]">
                {getInitials(item.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[#121813]">
                  {item.name}
                </p>
                <p className="truncate text-[12px] text-[#363d38]">
                  {item.task} <span className="font-semibold">{item.project}</span>
                </p>
              </div>
            </div>

            <span
              className={`rounded-md border px-4 py-1 text-[10px] font-bold ${statusClasses[item.status]}`}
            >
              {item.status}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
