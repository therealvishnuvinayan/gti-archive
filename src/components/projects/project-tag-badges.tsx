import { getProjectTagColors } from "@/lib/project-tags";

export function ProjectTagBadges({
  tags = [],
  className = "",
}: {
  tags?: string[];
  className?: string;
}) {
  if (!tags.length) return null;
  const colors = getProjectTagColors(tags);
  return (
    <div aria-label="Project tags" className={`flex flex-wrap gap-1.5 ${className}`}>
      {tags.map((tag, index) => (
        <span key={tag} className={`max-w-full break-words rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${colors[index]}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}
