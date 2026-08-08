import { AlertCircle } from "lucide-react";

import { ProjectBackButton } from "@/components/projects/project-back-button";

type ProjectRouteStateProps = {
  title: string;
  message: string;
  primaryHref?: string;
  primaryLabel?: string;
};

export function ProjectRouteState({
  title,
  message,
  primaryHref,
  primaryLabel,
}: ProjectRouteStateProps) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <article className="w-full max-w-[600px] rounded-[28px] border border-[#e5ece6] bg-white p-8 text-center shadow-[0_18px_42px_rgba(23,39,28,0.06)] sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eef8ef] text-brand">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-[32px] font-[700] leading-tight tracking-[-0.03em] text-[#111712]">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-[440px] text-[16px] leading-7 text-[#657066]">
          {message}
        </p>
        {primaryHref && primaryLabel ? (
          <div className="mt-7 flex justify-center">
            <ProjectBackButton
              href={primaryHref}
              label={primaryLabel}
              ariaLabel={`Back to ${primaryLabel}`}
            />
          </div>
        ) : null}
      </article>
    </section>
  );
}

export function ProjectNotFoundState() {
  return (
    <ProjectRouteState
      title="Project not found"
      message="This project may have been deleted or the link may be outdated."
    />
  );
}

export function ProjectAccessUnavailableState({
  parentHref,
  parentLabel,
}: {
  parentHref?: string;
  parentLabel?: string;
} = {}) {
  return (
    <ProjectRouteState
      title="Access unavailable"
      message="You do not have access to this project, or your access may have been removed."
      primaryHref={parentHref}
      primaryLabel={parentLabel}
    />
  );
}

export function ProjectEditLockedState({ projectHref }: { projectHref: string }) {
  void projectHref;
  return (
    <ProjectRouteState
      title="Project editing locked"
      message="Completed projects cannot be edited."
    />
  );
}

export function StageNotFoundState({ projectHref }: { projectHref: string }) {
  void projectHref;
  return (
    <ProjectRouteState
      title="Stage not found"
      message="This stage may have been deleted or the link may be outdated."
    />
  );
}

export function StageLockedState({
  projectHref,
  message,
}: {
  projectHref: string;
  message: string;
}) {
  void projectHref;
  return (
    <ProjectRouteState
      title="Stage locked"
      message={message}
    />
  );
}
