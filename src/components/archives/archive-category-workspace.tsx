"use client";

import { useMemo, useState } from "react";
import { Download, X } from "lucide-react";

import {
  ArchiveCategoryIconGlyph,
  ArchiveFileTypeIcon,
  getArchiveCategoryIconImageSrc,
} from "@/components/archives/archive-data";
import { ArchiveUploadButton } from "@/components/dashboard/upload-assets-button";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ArchivedProjectFileRecord } from "@/lib/archives";

type ArchiveCategoryWorkspaceProps = {
  categoryId: string;
  categoryTitle: string;
  categoryDescription: string;
  categoryIconUrl: string;
  categoryIconKey: string;
  categoryColor: string;
  items: ArchivedProjectFileRecord[];
  canUploadArchives: boolean;
};

type ArchiveFilters = {
  search: string;
  projectName: string;
  archivedBy: string;
  projectTag: string;
  assetTag: string;
};

const defaultFilters: ArchiveFilters = {
  search: "",
  projectName: "",
  archivedBy: "",
  projectTag: "",
  assetTag: "",
};

const ALL_PROJECTS = "__all_projects__";
const ALL_USERS = "__all_users__";
const ALL_TAGS = "__all_tags__";
const ALL_ASSET_TAGS = "__all_asset_tags__";

function uniqueValues(items: ArchivedProjectFileRecord[], key: keyof ArchivedProjectFileRecord) {
  return Array.from(new Set(items.map((item) => item[key] as string).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function uniqueProjectTags(items: ArchivedProjectFileRecord[]) {
  return Array.from(
    new Set(items.flatMap((item) => item.projectTags).filter(Boolean)),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function uniqueAssetTags(items: ArchivedProjectFileRecord[]) {
  return Array.from(
    new Map(
      items
        .flatMap((item) => item.assetTags)
        .map((tag) => [tag.id, { id: tag.id, label: tag.name }] as const),
    ).values(),
  ).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
  );
}

export function ArchiveCategoryWorkspace({
  categoryId,
  categoryTitle,
  categoryDescription,
  categoryIconUrl,
  categoryIconKey,
  categoryColor,
  items,
  canUploadArchives,
}: ArchiveCategoryWorkspaceProps) {
  const [filters, setFilters] = useState<ArchiveFilters>(defaultFilters);
  const categoryIconSrc = getArchiveCategoryIconImageSrc(categoryIconUrl);

  const options = useMemo(
    () => ({
      projectName: uniqueValues(items, "projectName"),
      archivedBy: uniqueValues(items, "archivedBy"),
      projectTag: uniqueProjectTags(items),
      assetTag: uniqueAssetTags(items),
    }),
    [items],
  );

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (
        filters.search &&
        ![
          item.finalArchiveFileName,
          item.originalFileName,
          item.projectName,
          item.projectCategory,
          item.projectTag,
          ...item.projectTags,
          ...item.assetTags.map((tag) => tag.name),
          item.archivedBy,
          item.recordTypeLabel,
          item.sourceLabel,
        ]
          .join(" ")
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      ) {
        return false;
      }

      if (filters.projectName && item.projectName !== filters.projectName) {
        return false;
      }

      if (filters.archivedBy && item.archivedBy !== filters.archivedBy) {
        return false;
      }

      if (filters.projectTag && !item.projectTags.includes(filters.projectTag)) {
        return false;
      }

      if (
        filters.assetTag &&
        !item.assetTags.some((tag) => tag.id === filters.assetTag)
      ) {
        return false;
      }

      return true;
    });
  }, [filters, items]);
  const hasActiveFilters = Boolean(
    filters.search ||
      filters.projectName ||
      filters.archivedBy ||
      filters.projectTag ||
      filters.assetTag,
  );

  function updateFilter<K extends keyof ArchiveFilters>(key: K, value: ArchiveFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(defaultFilters);
  }

  return (
    <section className="space-y-6">
      <MotionSection>
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <div
                className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] bg-white text-brand shadow-[0_12px_30px_rgba(23,39,28,0.08)]"
                style={categoryColor ? { color: categoryColor } : undefined}
              >
                {categoryIconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={categoryIconSrc} alt="" className="h-10 w-10 object-contain" />
                ) : (
                  <ArchiveCategoryIconGlyph
                    iconKey={categoryIconKey}
                    className="h-9 w-9"
                  />
                )}
              </div>
              <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
                {categoryTitle}
              </h1>
            </div>
            <p className="mt-3 max-w-[760px] text-[15px] leading-6 text-[#5f695f]">
              {categoryDescription ||
                "Final archived files, completion documents, and manual archive uploads are read-only. Allowed users can view or download files in this category."}
            </p>
          </div>
          <ArchiveUploadButton
            canUploadAssets={canUploadArchives}
            disabledReason="You do not have permission to upload to Archive."
            defaultCategoryId={categoryId}
            buttonLabel="Add Archive File"
          />
        </header>
      </MotionSection>

      <MotionSection y={10}>
        <div className="rounded-[30px] bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <div className="rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] p-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <Input
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Search archived files..."
                className="h-[36px] border-0 text-[12px] text-[#657069]"
              />

              <Select
                value={filters.projectName || ALL_PROJECTS}
                onValueChange={(value) =>
                  updateFilter(
                    "projectName",
                    value === ALL_PROJECTS ? "" : value,
                  )
                }
              >
                <SelectTrigger className="h-[36px] border-0 text-[12px] text-[#657069]">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROJECTS}>All Projects</SelectItem>
                  {options.projectName.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.archivedBy || ALL_USERS}
                onValueChange={(value) =>
                  updateFilter("archivedBy", value === ALL_USERS ? "" : value)
                }
              >
                <SelectTrigger className="h-[36px] border-0 text-[12px] text-[#657069]">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_USERS}>All Users</SelectItem>
                  {options.archivedBy.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.projectTag || ALL_TAGS}
                onValueChange={(value) =>
                  updateFilter("projectTag", value === ALL_TAGS ? "" : value)
                }
              >
                <SelectTrigger className="h-[36px] border-0 text-[12px] text-[#657069]">
                  <SelectValue placeholder="Project Tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TAGS}>All project tags</SelectItem>
                  {options.projectTag.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.assetTag || ALL_ASSET_TAGS}
                onValueChange={(value) =>
                  updateFilter("assetTag", value === ALL_ASSET_TAGS ? "" : value)
                }
              >
                <SelectTrigger className="h-[36px] border-0 text-[12px] text-[#657069]">
                  <SelectValue placeholder="Asset Tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ASSET_TAGS}>All asset tags</SelectItem>
                  {options.assetTag.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                className="h-9 rounded-full bg-white/80 px-4 text-[12px] font-[700] text-[#536057] hover:bg-white"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            </div>
          ) : null}

          <MotionStaggerGroup className="mt-4 space-y-3" stagger={0.035}>
            {visibleItems.map((item) => (
                <MotionItem key={item.id} layout className="rounded-[20px]">
                  <article className="grid min-w-0 gap-4 rounded-[20px] border border-brand/35 bg-white px-5 py-4 shadow-[0_18px_45px_rgba(23,39,28,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(23,39,28,0.08)] xl:grid-cols-[minmax(0,2.2fr)_minmax(150px,1.2fr)_minmax(120px,1fr)_minmax(120px,1.1fr)_minmax(220px,auto)]">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] border border-[#ecefed] bg-white shadow-[0_8px_20px_rgba(16,26,20,0.08)]">
                          <ArchiveFileTypeIcon
                            type={item.fileTypeLabel}
                            className="h-5 w-5 text-brand"
                          />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-[14px] font-[700] leading-[1.25] text-[#111712]">
                            {item.finalArchiveFileName}
                          </h3>
                          <p className="mt-1 text-[12px] text-[#667168]">
                            Original: {item.originalFileName}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#6c756e]">
                            <span className="rounded-full bg-[#edf2ff] px-2 py-0.5 font-[700] uppercase tracking-[0.08em] text-[#4760c7]">
                              {item.recordTypeLabel}
                            </span>
                            <span className="rounded-full bg-[#f4f7f4] px-2 py-0.5 font-[700] uppercase tracking-[0.08em] text-[#566259]">
                              {item.fileTypeLabel}
                            </span>
                            <span>{item.fileSizeLabel}</span>
                            <span>{item.sourceLabel}</span>
                          </div>
                          {item.assetTags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.assetTags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag.id}
                                  className="max-w-[120px] truncate rounded-full bg-[#edf7ef] px-2 py-0.5 text-[11px] font-[700] text-[#2d8055]"
                                  title={tag.name}
                                  style={
                                    tag.color
                                      ? {
                                          backgroundColor: `${tag.color}18`,
                                          color: tag.color,
                                        }
                                      : undefined
                                  }
                                >
                                  {tag.name}
                                </span>
                              ))}
                              {item.assetTags.length > 3 ? (
                                <span
                                  className="rounded-full bg-[#f4f7f4] px-2 py-0.5 text-[11px] font-[800] text-[#5d685f]"
                                  title={item.assetTags.map((tag) => tag.name).join(", ")}
                                >
                                  +{item.assetTags.length - 3}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 text-[13px] xl:self-center">
                      <p className="font-[700] text-[#111712]">{item.projectName}</p>
                      <p className="text-[#687269]">{item.projectCategory}</p>
                      {item.projectTags.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-[700] text-[#687269]">
                            Project tags:
                          </span>
                          {item.projectTags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="max-w-[120px] truncate rounded-full bg-[#edf7ef] px-2 py-0.5 text-[11px] font-[700] text-[#2d8055]"
                              title={tag}
                            >
                              {tag}
                            </span>
                          ))}
                          {item.projectTags.length > 3 ? (
                            <span
                              className="rounded-full bg-[#f4f7f4] px-2 py-0.5 text-[11px] font-[800] text-[#5d685f]"
                              title={item.projectTag}
                            >
                              +{item.projectTags.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-[#687269]">Project tags: —</p>
                      )}
                    </div>

                    <div className="space-y-1 text-[13px] xl:self-center">
                      <p className="font-[700] text-[#111712]">{item.archivedAt}</p>
                      <p className="text-[#687269]">Archived date</p>
                    </div>

                    <div className="space-y-1 text-[13px] xl:self-center">
                      <p className="font-[700] text-[#111712]">{item.archivedBy}</p>
                      <p className="text-[#687269]">Archived by</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end xl:self-start">
                      <AssetPreviewButton
                        fileName={item.finalArchiveFileName}
                        mimeType={item.mimeType}
                        previewPath={item.previewPath}
                        downloadPath={item.downloadPath}
                        triggerClassName="h-10 min-w-[94px] justify-center rounded-full border border-[#ecefed] bg-white px-3 text-[13px] font-[600] text-[#3a443d] shadow-[0_8px_20px_rgba(16,26,20,0.08)]"
                        iconOnly={false}
                      />
                      <Button
                        asChild
                        type="button"
                        variant="secondary"
                        className="h-10 min-w-[118px] justify-center rounded-full border border-[#ecefed] bg-white px-3 text-[13px] font-[600] text-[#3a443d] shadow-[0_8px_20px_rgba(16,26,20,0.08)]"
                      >
                        <a href={item.downloadPath} target="_blank" rel="noreferrer">
                          <Download className="h-4 w-4 text-brand" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </article>
                </MotionItem>
              ))}

            {visibleItems.length === 0 ? (
              <MotionItem y={8}>
                <div className="rounded-[20px] border border-brand/25 bg-white px-5 py-10 text-center">
                  <p className="text-[16px] font-[700] text-[#18211a]">
                    No archive files match your filters.
                  </p>
                  <p className="mt-2 text-[14px] text-[#707a72]">
                    Try clearing filters or changing your search.
                  </p>
                  {hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearFilters}
                      className="mt-5"
                    >
                      <X className="h-4 w-4" />
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </MotionItem>
            ) : null}
          </MotionStaggerGroup>
        </div>
      </MotionSection>
    </section>
  );
}
