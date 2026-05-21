"use client";

import { Eye, Trash2 } from "lucide-react";

import type { ProjectCollaboratorRecord } from "@/lib/projects";

type ProjectCollaboratorsPanelProps = {
  collaborators: ProjectCollaboratorRecord[];
  onRemove?: (id: string) => void;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProjectCollaboratorsPanel({
  collaborators,
  onRemove,
}: ProjectCollaboratorsPanelProps) {
  const internal = collaborators.filter((collaborator) => collaborator.group === "internal");
  const external = collaborators.filter((collaborator) => collaborator.group === "external");

  return (
    <aside className="rounded-[20px] bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
      <h2 className="text-[20px] font-[700] tracking-[-0.03em] text-[#111712]">
        Project Collaborators
      </h2>

      {([
        ["Internal", internal],
        ["External", external],
      ] as const).map(([label, items]) => (
        <div key={label} className="mt-5">
          <h3 className="text-[16px] font-[700] text-[#86c864]">{label}</h3>
          <ul className="mt-3 space-y-3">
            {items.length > 0 ? (
              items.map((collaborator) => (
                <li key={collaborator.id} className="flex items-center gap-3">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                    {getInitials(collaborator.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-[600] text-[#111712]">
                      {collaborator.name}
                    </p>
                    <p className="truncate text-[10px] text-[#7a837b]">{collaborator.role}</p>
                  </div>
                  {collaborator.group === "external" ? (
                    <Eye
                      className={`h-4 w-4 ${
                        collaborator.access === "view"
                          ? "text-[#50b848]"
                          : "text-[#ff2f2f]"
                      }`}
                    />
                  ) : collaborator.removable ? (
                    <button
                      type="button"
                      onClick={() => onRemove?.(collaborator.id)}
                      className="cursor-pointer text-[#ff6e68]"
                      aria-label={`Remove ${collaborator.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-[12px] text-[#8a938c]">No {label.toLowerCase()} collaborators yet.</li>
            )}
          </ul>
        </div>
      ))}
    </aside>
  );
}
