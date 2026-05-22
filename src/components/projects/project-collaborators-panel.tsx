"use client";

import { Eye, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="rounded-[20px]">
      <CardHeader className="pb-3">
      <CardTitle className="text-[20px]">
        Project Collaborators
      </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
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
                    <Badge
                      variant="secondary"
                      className={`border-none p-2 ${
                        collaborator.access === "view"
                          ? "bg-[#eef9ee] text-[#50b848]"
                          : "bg-[#fff1f0] text-[#ff2f2f]"
                      }`}
                    >
                      <Eye className="h-4 w-4" />
                    </Badge>
                  ) : collaborator.removable ? (
                    <Button
                      type="button"
                      onClick={() => onRemove?.(collaborator.id)}
                      variant="ghost"
                      size="icon"
                      className="size-8 text-[#ff6e68]"
                      aria-label={`Remove ${collaborator.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-[12px] text-[#8a938c]">No {label.toLowerCase()} collaborators yet.</li>
            )}
          </ul>
        </div>
      ))}
      </CardContent>
    </Card>
  );
}
