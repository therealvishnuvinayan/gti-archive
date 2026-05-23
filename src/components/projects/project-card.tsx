"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";

import { deleteProjectAction } from "@/app/(dashboard)/projects/new/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export type ProjectCardItem = {
  id: string;
  stage: string;
  category: string;
  title: string;
  createdOn: string;
  createdBy: string;
  featured?: boolean;
  emphasized?: boolean;
};

type ProjectCardProps = {
  project: ProjectCardItem;
  canManage?: boolean;
};

export function ProjectCard({ project, canManage = false }: ProjectCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  function handleDelete() {
    setDeleteError(undefined);
    startTransition(async () => {
      try {
        await deleteProjectAction(project.id);
        setConfirmOpen(false);
        router.refresh();
      } catch {
        setDeleteError("Unable to delete the project right now. Please try again.");
      }
    });
  }

  return (
    <>
      <Card
        className={`rounded-[22px] p-5 shadow-[0_18px_42px_rgba(23,39,28,0.05)] transition-transform hover:-translate-y-0.5 ${
          project.featured
            ? "bg-[linear-gradient(135deg,#476f5a,#63a67d)] text-white"
            : project.emphasized
              ? "border border-[#a9b2ab] bg-card shadow-[0_12px_18px_rgba(0,0,0,0.18)]"
              : "bg-card"
        }`}
      >
        <CardContent className="p-0">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge
                variant={project.featured ? "secondary" : "outline"}
                className={project.featured ? "bg-white/15 text-[#b5f09b]" : ""}
              >
                {project.stage}
              </Badge>
              <p
                className={`text-[14px] ${
                  project.featured ? "text-[#d8f0dd]" : "text-[#74c771]"
                }`}
              >
                {project.category}
              </p>
            </div>

            {canManage ? (
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-[10px] border border-white/45 bg-white/12 text-white hover:bg-white/18"
                  aria-label={`Edit ${project.title}`}
                  title="Edit project"
                >
                  <Link href={`/projects/${project.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => {
                    setDeleteError(undefined);
                    setConfirmOpen(true);
                  }}
                  disabled={isPending}
                  className="h-9 w-9 rounded-[10px] border border-white/45 bg-white/12 text-white hover:bg-white/18 disabled:cursor-not-allowed"
                  aria-label={`Delete ${project.title}`}
                  title="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : project.featured ? (
              <Badge variant="secondary" className="bg-white/15 text-[#93db74]">
                <ArrowUpRight className="h-4 w-4" />
              </Badge>
            ) : null}
          </div>

          <h3
            className={`min-h-[96px] text-[21px] font-extrabold leading-[1.1] ${
              project.featured ? "text-white" : "text-[#236e4c]"
            }`}
          >
            {project.title}
          </h3>

          <div
            className={`space-y-0.5 text-[15px] ${
              project.featured ? "text-[#a9e097]" : "text-[#242b26]"
            }`}
          >
            <p>Created on {project.createdOn}</p>
            <p>Created By {project.createdBy}</p>
          </div>

          <Button asChild size="lg" className="mt-6 w-full">
            <Link href={`/projects/${project.id}`}>View Project</Link>
          </Button>
        </CardContent>
      </Card>

      <ConfirmationDialog
        isOpen={confirmOpen}
        title="Delete Project"
        description={`Delete project "${project.title}"? This action cannot be undone.`}
        confirmLabel="Delete Project"
        cancelLabel="Keep Project"
        tone="destructive"
        pending={isPending}
        error={deleteError}
        onConfirm={handleDelete}
        onClose={() => {
          if (!isPending) {
            setConfirmOpen(false);
            setDeleteError(undefined);
          }
        }}
      />
    </>
  );
}
