import type { ReactNode } from "react";

export function ProjectPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="text-[25px] font-[700] leading-none tracking-[-0.045em] text-[#0f1411] sm:text-[29px]">
          {title}
        </h1>
        <p className="mt-2 text-[14px] leading-5 text-[#737b74]">
          {description}
        </p>
      </div>

      {actions}
    </div>
  );
}
