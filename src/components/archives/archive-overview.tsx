import Link from "next/link";

import {
  ArchiveCategoryIconGlyph,
  getArchiveCategoryIconImageSrc,
} from "@/components/archives/archive-data";
import { ArchiveUploadButton } from "@/components/dashboard/upload-assets-button";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import { Button } from "@/components/ui/button";
import type { ArchiveCategorySummary } from "@/lib/archives";

type ArchiveOverviewProps = {
  summaries: ArchiveCategorySummary[];
  canUploadArchives: boolean;
  canManageArchiveCategories: boolean;
};

export function ArchiveOverview({
  summaries,
  canUploadArchives,
  canManageArchiveCategories,
}: ArchiveOverviewProps) {
  return (
    <section className="space-y-6">
      <MotionSection>
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
              Archives
            </h1>
            <p className="mt-3 max-w-[760px] text-[15px] leading-6 text-[#5f695f]">
              Completed project files, completion documents, and manual archive uploads
              are grouped by category with secure view and download links.
            </p>
          </div>
          <ArchiveUploadButton
            canUploadAssets={canUploadArchives}
            disabledReason="You do not have permission to upload to Archive."
          />
        </header>
      </MotionSection>

      <MotionSection y={10}>
        <div className="rounded-[30px] bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <div className="mb-8">
            <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#434747]">
              Choose the category
            </h2>
          </div>

          {summaries.length > 0 ? (
            <MotionStaggerGroup
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
              stagger={0.045}
            >
              {summaries.map((category) => {
                const iconSrc = getArchiveCategoryIconImageSrc(category.iconUrl);

                return (
                  <MotionItem key={category.id} y={10}>
                    <Link href={`/archives/${category.slug}`} className="block">
                      <article className="rounded-[22px] bg-white p-5 shadow-[0_12px_34px_rgba(23,39,28,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(23,39,28,0.08)]">
                        <div
                          className="mb-5 grid h-20 place-items-center text-brand"
                          style={category.color ? { color: category.color } : undefined}
                        >
                          {iconSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={iconSrc}
                              alt=""
                              className="h-14 w-14 object-contain"
                            />
                          ) : (
                            <ArchiveCategoryIconGlyph
                              iconKey={category.iconKey}
                              className="h-14 w-14"
                            />
                          )}
                        </div>
                        <h3 className="text-center text-[16px] font-[700] text-[#141915]">
                          {category.title}
                        </h3>
                        {category.description ? (
                          <p className="mt-2 line-clamp-2 text-center text-[12px] leading-5 text-[#718072]">
                            {category.description}
                          </p>
                        ) : null}
                        <div className="mt-5 rounded-[18px] border border-[#e1e8e1] bg-[#f9fbf9] px-4 py-3 text-center">
                          <p className="text-[20px] font-[700] text-[#111712]">
                            {category.fileCount}
                          </p>
                          <p className="text-[11px] font-[600] uppercase tracking-[0.08em] text-[#6b756d]">
                            Archived Files
                          </p>
                          <p className="mt-2 text-[11px] text-[#6b756d]">
                            {category.projectCount
                              ? `${category.projectCount} project${category.projectCount === 1 ? "" : "s"}`
                              : "No completed projects yet"}
                          </p>
                          {category.childCount > 0 ? (
                            <p className="mt-1 text-[11px] text-[#6b756d]">
                              {category.childCount} child {category.childCount === 1 ? "category" : "categories"}
                            </p>
                          ) : null}
                          {category.latestArchivedAt ? (
                            <p className="mt-1 text-[10px] text-[#869086]">
                              Last archived {category.latestArchivedAt}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    </Link>
                  </MotionItem>
                );
              })}
            </MotionStaggerGroup>
          ) : (
            <div className="rounded-[22px] border border-dashed border-[#dfe7df] bg-white px-6 py-16 text-center">
              <p className="text-[22px] font-[700] tracking-[-0.03em] text-[#162019]">
                No archive categories found.
              </p>
              {canManageArchiveCategories ? (
                <Button asChild className="mt-5">
                  <Link href="/settings/project-master-data">Create Archive Category</Link>
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </MotionSection>
    </section>
  );
}
