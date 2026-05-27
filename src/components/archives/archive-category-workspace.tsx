"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { getFileTypeIcon } from "@/components/archives/archive-data";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  categoryTitle: string;
  items: ArchivedProjectFileRecord[];
};

type ArchiveFilters = {
  search: string;
  projectName: string;
  archivedBy: string;
  projectTag: string;
};

const defaultFilters: ArchiveFilters = {
  search: "",
  projectName: "",
  archivedBy: "",
  projectTag: "",
};

function uniqueValues(items: ArchivedProjectFileRecord[], key: keyof ArchivedProjectFileRecord) {
  return Array.from(new Set(items.map((item) => item[key] as string).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function ArchiveCategoryWorkspace({
  categoryTitle,
  items,
}: ArchiveCategoryWorkspaceProps) {
  const [filters, setFilters] = useState<ArchiveFilters>(defaultFilters);

  const options = useMemo(
    () => ({
      projectName: uniqueValues(items, "projectName"),
      archivedBy: uniqueValues(items, "archivedBy"),
      projectTag: uniqueValues(items, "projectTag"),
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

      if (filters.projectTag && item.projectTag !== filters.projectTag) {
        return false;
      }

      return true;
    });
  }, [filters, items]);

  function updateFilter<K extends keyof ArchiveFilters>(key: K, value: ArchiveFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="space-y-6">
      <MotionSection>
        <header className="flex flex-col gap-3">
          <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
            {categoryTitle}
          </h1>
          <p className="max-w-[760px] text-[15px] leading-6 text-[#5f695f]">
            Final archived files and completion documents are read-only. Allowed users
            can view or download the approved files and completion records that were
            saved when a project was completed.
          </p>
        </header>
      </MotionSection>

      <MotionSection y={10}>
        <Card className="rounded-[30px] border-0 bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <Card className="rounded-[18px] border-0 bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] p-3 shadow-none">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <Input
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Search archived files..."
                className="h-[36px] border-0 text-[12px] text-[#657069]"
              />

              <Select
                value={filters.projectName}
                onValueChange={(value) => updateFilter("projectName", value)}
              >
                <SelectTrigger className="h-[36px] border-0 text-[12px] text-[#657069]">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  {options.projectName.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.archivedBy}
                onValueChange={(value) => updateFilter("archivedBy", value)}
              >
                <SelectTrigger className="h-[36px] border-0 text-[12px] text-[#657069]">
                  <SelectValue placeholder="Archived by" />
                </SelectTrigger>
                <SelectContent>
                  {options.archivedBy.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.projectTag}
                onValueChange={(value) => updateFilter("projectTag", value)}
              >
                <SelectTrigger className="h-[36px] border-0 text-[12px] text-[#657069]">
                  <SelectValue placeholder="Project tag" />
                </SelectTrigger>
                <SelectContent>
                  {options.projectTag.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          <MotionStaggerGroup className="mt-4 space-y-3" stagger={0.035}>
            {visibleItems.map((item) => {
              const Icon = getFileTypeIcon(item.fileTypeLabel);

              return (
                <MotionItem key={item.id} layout className="rounded-[20px]">
                  <article className="grid min-w-0 gap-4 rounded-[20px] border border-brand/35 bg-white px-5 py-4 shadow-[0_18px_45px_rgba(23,39,28,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(23,39,28,0.08)] xl:grid-cols-[2.2fr_1.2fr_1fr_1.1fr_0.9fr]">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <Card className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] border border-[#ecefed] bg-white shadow-[0_8px_20px_rgba(16,26,20,0.08)]">
                          <Icon className="h-5 w-5 text-brand" />
                        </Card>
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
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 text-[13px] xl:self-center">
                      <p className="font-[700] text-[#111712]">{item.projectName}</p>
                      <p className="text-[#687269]">{item.projectCategory}</p>
                      <p className="text-[#687269]">Tag: {item.projectTag}</p>
                    </div>

                    <div className="space-y-1 text-[13px] xl:self-center">
                      <p className="font-[700] text-[#111712]">{item.archivedAt}</p>
                      <p className="text-[#687269]">Archived date</p>
                    </div>

                    <div className="space-y-1 text-[13px] xl:self-center">
                      <p className="font-[700] text-[#111712]">{item.archivedBy}</p>
                      <p className="text-[#687269]">Archived by</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 xl:self-start">
                      <AssetPreviewButton
                        fileName={item.finalArchiveFileName}
                        mimeType={item.mimeType}
                        previewPath={item.previewPath}
                        downloadPath={item.downloadPath}
                        triggerClassName="min-h-[40px] rounded-xl border border-[#ecefed] bg-white px-2 py-2 text-[#3a443d] shadow-[0_8px_20px_rgba(16,26,20,0.08)]"
                        iconOnly={false}
                      />
                      <Button
                        asChild
                        type="button"
                        variant="secondary"
                        className="min-h-[40px] rounded-xl border border-[#ecefed] bg-white px-2 py-2 text-[10px] font-[600] text-[#3a443d] shadow-[0_8px_20px_rgba(16,26,20,0.08)]"
                      >
                        <a href={item.downloadPath} target="_blank" rel="noreferrer">
                          <Download className="h-4 w-4 text-brand" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </article>
                </MotionItem>
              );
            })}

            {visibleItems.length === 0 ? (
              <MotionItem y={8}>
                <div className="rounded-[20px] border border-brand/25 bg-white px-5 py-10 text-center text-[14px] text-[#707a72]">
                  No archived files match the current filters.
                </div>
              </MotionItem>
            ) : null}
          </MotionStaggerGroup>
        </Card>
      </MotionSection>
    </section>
  );
}
