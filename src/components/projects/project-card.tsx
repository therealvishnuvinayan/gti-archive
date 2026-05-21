import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article
      className={`rounded-[22px] p-5 shadow-[0_18px_42px_rgba(23,39,28,0.05)] transition-transform hover:-translate-y-0.5 ${
        project.featured
          ? "bg-[linear-gradient(135deg,#476f5a,#63a67d)] text-white"
          : project.emphasized
            ? "border border-[#a9b2ab] bg-card shadow-[0_12px_18px_rgba(0,0,0,0.18)]"
            : "bg-card"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-[16px] font-extrabold leading-tight ${
              project.featured ? "text-[#9be47e]" : "text-[#111712]"
            }`}
          >
            {project.stage}
          </p>
          <p
            className={`mt-0.5 text-[14px] ${
              project.featured ? "text-[#d8f0dd]" : "text-[#74c771]"
            }`}
          >
            {project.category}
          </p>
        </div>

        {project.featured ? (
          <ArrowUpRight className="h-4 w-4 text-[#93db74]" />
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

      <Link
        href={`/projects/${project.id}`}
        className={`mt-6 inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-full px-6 text-[18px] font-semibold transition-transform hover:-translate-y-0.5 ${
          project.featured
            ? "bg-[linear-gradient(90deg,#31a06a,#133f2d)] text-white"
            : "bg-[linear-gradient(90deg,#247449,#123d2b)] text-white"
        }`}
      >
        View Project
      </Link>
    </article>
  );
}
