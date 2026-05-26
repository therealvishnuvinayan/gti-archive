"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  CalendarDays,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";

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
        className={`h-full rounded-[26px] border p-5 shadow-[0_18px_42px_rgba(23,39,28,0.05)] transition-transform hover:-translate-y-0.5 ${
          project.featured
            ? "border-[#7eb496] bg-[radial-gradient(circle_at_top_right,rgba(193,239,204,0.28),transparent_35%),linear-gradient(135deg,#456c58,#78bf93)] text-white"
            : project.emphasized
              ? "border-[#dbe6dd] bg-card"
              : "border-[#e8eee8] bg-card"
        }`}
      >
        <CardContent className="flex h-full flex-col p-0">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="space-y-3">
              <Badge
                variant={project.featured ? "secondary" : "outline"}
                className={`max-w-full truncate ${
                  project.featured
                    ? "border-white/15 bg-white/14 text-[#ecfff0]"
                    : "border-[#d5e3d6] bg-[#fbfdfb] text-brand"
                }`}
              >
                {project.stage}
              </Badge>
              <p
                className={`text-[13px] font-[600] ${
                  project.featured ? "text-[#dff6e3]" : "text-[#64aa76]"
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
                  className={`h-9 w-9 rounded-[12px] ${
                    project.featured
                      ? "border border-white/35 bg-white/10 text-white hover:bg-white/18"
                      : "border border-[#e1e8e2] bg-white text-[#566158] hover:bg-[#f6faf7]"
                  }`}
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
                  className={`h-9 w-9 rounded-[12px] disabled:cursor-not-allowed ${
                    project.featured
                      ? "border border-white/35 bg-white/10 text-white hover:bg-white/18"
                      : "border border-[#e1e8e2] bg-white text-[#566158] hover:bg-[#f6faf7]"
                  }`}
                  aria-label={`Delete ${project.title}`}
                  title="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>

          <h3
            className={`min-h-[78px] text-[31px] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[33px] ${
              project.featured ? "text-white" : "text-[#18211a]"
            }`}
          >
            {project.title}
          </h3>

          <div
            className={`mt-6 space-y-3 border-t pt-5 text-[14px] ${
              project.featured
                ? "border-white/15 text-[#e7f8eb]"
                : "border-[#edf2ec] text-[#4e5950]"
            }`}
          >
            <p className="flex items-center gap-2.5">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>Created on {project.createdOn}</span>
            </p>
            <p className="flex items-center gap-2.5">
              <UserRound className="h-4 w-4 shrink-0" />
              <span>Created by {project.createdBy}</span>
            </p>
          </div>

          <Button
            asChild
            size="lg"
            variant={project.featured ? "default" : "outline"}
            className={`mt-6 w-full ${
              project.featured
                ? "bg-[#184e36] text-white shadow-[0_14px_34px_rgba(11,42,28,0.24)]"
                : "border-brand/35 bg-white text-brand"
            }`}
          >
            <Link href={`/projects/${project.id}`}>
              View Project
              <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
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
