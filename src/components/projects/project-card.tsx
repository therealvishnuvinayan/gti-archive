"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  CalendarDays,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  UserRound,
} from "lucide-react";

import { toggleProjectPinAction } from "@/app/(dashboard)/projects/actions";
import { deleteProjectAction } from "@/app/(dashboard)/projects/new/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export type ProjectCardItem = {
  id: string;
  stage: string;
  category: string;
  tags: string[];
  title: string;
  createdOn: string;
  createdBy: string;
  isPinned: boolean;
  canPin: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type ProjectCardProps = {
  project: ProjectCardItem;
  returnHref?: string;
};

export function ProjectCard({ project, returnHref }: ProjectCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [pinError, setPinError] = useState<string>();
  const projectHref = returnHref
    ? `/projects/${project.id}?returnTo=${encodeURIComponent(returnHref)}`
    : `/projects/${project.id}`;
  const visibleTags = project.tags.slice(0, 3);
  const hiddenTagCount = Math.max(project.tags.length - visibleTags.length, 0);

  function handleTogglePin() {
    setPinError(undefined);
    startTransition(async () => {
      try {
        await toggleProjectPinAction(project.id);
        router.refresh();
      } catch {
        setPinError("Unable to update the pinned project right now.");
      }
    });
  }

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
          project.isPinned
            ? "border-[#7eb496] bg-[radial-gradient(circle_at_top_right,rgba(193,239,204,0.28),transparent_35%),linear-gradient(135deg,#456c58,#78bf93)] text-white"
            : "border-[#e8eee8] bg-card"
        }`}
      >
        <CardContent className="flex h-full flex-col p-0">
          <div className="mb-5 flex min-w-0 items-start justify-between gap-3 overflow-hidden">
            <div className="min-w-0 flex-1 space-y-3">
              <Badge
                variant={project.isPinned ? "secondary" : "outline"}
                className={`max-w-full whitespace-normal px-3 py-1.5 text-left leading-5 ${
                  project.isPinned
                    ? "border-white/15 bg-white/14 text-[#ecfff0]"
                    : "border-[#d5e3d6] bg-[#fbfdfb] text-brand"
                }`}
              >
                <span className="line-clamp-2 min-w-0">{project.stage}</span>
              </Badge>
              <p
                className={`truncate text-[13px] font-[600] ${
                  project.isPinned ? "text-[#dff6e3]" : "text-[#64aa76]"
                }`}
              >
                {project.category}
              </p>
              {project.tags.length > 0 ? (
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {visibleTags.map((tag) => (
                    <span
                      key={tag}
                      className={`max-w-[138px] truncate rounded-full px-2.5 py-1 text-[11px] font-[700] ${
                        project.isPinned
                          ? "bg-white/14 text-[#ecfff0]"
                          : "bg-[#edf7ef] text-[#2d8055]"
                      }`}
                      title={tag}
                    >
                      {tag}
                    </span>
                  ))}
                  {hiddenTagCount > 0 ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-[800] ${
                        project.isPinned
                          ? "bg-white/14 text-[#ecfff0]"
                          : "bg-[#f4f7f4] text-[#5d685f]"
                      }`}
                      title={project.tags.join(", ")}
                    >
                      +{hiddenTagCount}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {project.canPin || project.canEdit || project.canDelete ? (
              <div className="flex shrink-0 items-center gap-2">
                {project.canPin ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={handleTogglePin}
                    disabled={isPending}
                    aria-pressed={project.isPinned}
                    className={`h-9 w-9 rounded-[12px] disabled:cursor-not-allowed ${
                      project.isPinned
                        ? "border border-white/35 bg-white/10 text-[#a6ef9b] hover:bg-white/18"
                        : "border border-[#e1e8e2] bg-white text-[#566158] hover:bg-[#f6faf7]"
                    }`}
                    aria-label={`${project.isPinned ? "Unpin" : "Pin"} ${project.title}`}
                    title={project.isPinned ? "Unpin project" : "Pin project"}
                  >
                    {project.isPinned ? (
                      <PinOff className="h-4 w-4" />
                    ) : (
                      <Pin className="h-4 w-4" />
                    )}
                  </Button>
                ) : null}
                {project.canEdit ? (
                  <Button
                    asChild
                    type="button"
                    variant="secondary"
                    size="icon"
                    className={`h-9 w-9 rounded-[12px] ${
                      project.isPinned
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
                ) : null}
                {project.canDelete ? (
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
                      project.isPinned
                        ? "border border-white/35 bg-white/10 text-white hover:bg-white/18"
                        : "border border-[#e1e8e2] bg-white text-[#566158] hover:bg-[#f6faf7]"
                    }`}
                    aria-label={`Delete ${project.title}`}
                    title="Delete project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <h3
            className={`min-h-[78px] text-[31px] font-semibold leading-[1.08] tracking-tight sm:text-[33px] ${
              project.isPinned ? "text-white" : "text-[#18211a]"
            }`}
          >
            {project.title}
          </h3>

          <div
            className={`mt-6 space-y-3 border-t pt-5 text-[14px] ${
              project.isPinned
                ? "border-white/15 text-[#e7f8eb]"
                : "border-[#edf2ec] text-[#4e5950]"
            }`}
          >
            <p className="flex items-center gap-2.5">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">Created on {project.createdOn}</span>
            </p>
            <p className="flex min-w-0 items-center gap-2.5">
              <UserRound className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">Created by {project.createdBy}</span>
            </p>
          </div>

          <Button
            asChild
            size="lg"
            variant={project.isPinned ? "default" : "outline"}
            className={`mt-6 w-full ${
              project.isPinned
                ? "bg-[#184e36] text-white shadow-[0_14px_34px_rgba(11,42,28,0.24)]"
                : "border-brand/35 bg-white text-brand"
            }`}
          >
            <Link href={projectHref}>
              View Project
              <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
          </Button>
          {pinError ? (
            <p
              className={`mt-3 text-[13px] font-[600] ${
                project.isPinned ? "text-[#ffe6e2]" : "text-[#b44d45]"
              }`}
            >
              {pinError}
            </p>
          ) : null}
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
