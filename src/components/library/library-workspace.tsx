"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCheck2,
  FileStack,
  ReceiptText,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";

import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { AttachmentFavoriteButton } from "@/components/projects/attachment-favorite-button";
import { MotionSection } from "@/components/motion/motion-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  libraryTypeFilterOptions,
  type LibraryDateFilter,
  type LibraryItemRecord,
  type LibraryPageData,
  type LibraryQuickMenuOption,
  type LibraryTypeFilter,
} from "@/lib/library-shared";
import {
  showErrorToast,
  showInfoToast,
  showSuccessToast,
} from "@/lib/toast";

const pageSizeOptions = [10, 20, 50] as const;
const dateFilterOptions: Array<{ value: LibraryDateFilter; label: string }> = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
];

function buildLibraryUrl(input: {
  page: number;
  pageSize: number;
  search: string;
  projectId: string;
  createdById: string;
  date: LibraryDateFilter;
  type: LibraryTypeFilter;
  quickMenu: LibraryQuickMenuOption;
}) {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    search: input.search,
    projectId: input.projectId,
    createdById: input.createdById,
    date: input.date,
    type: input.type,
    quickMenu: input.quickMenu,
  });

  return `/api/library?${searchParams.toString()}`;
}

function isPreviewableLibraryFile(fileName: string, mimeType: string) {
  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    fileName.toLowerCase().endsWith(".pdf")
  );
}

function QuickMenuCard({
  active,
  title,
  description,
  actionLabel,
  onClick,
  icon: Icon,
}: {
  active: boolean;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  icon: typeof FileStack;
}) {
  return (
    <Card
      className={`rounded-[22px] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(23,39,28,0.08)] ${
        active ? "ring-2 ring-brand/45" : ""
      }`}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand">
          <Icon className="h-8 w-8" />
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#edf4ee] text-brand">
          <FileCheck2 className="h-5 w-5" />
        </div>
      </div>

      <h3 className="text-[16px] font-[700] text-[#141915]">{title}</h3>
      <p className="mt-2 text-[13px] leading-6 text-[#79817b]">{description}</p>

      <Button
        type="button"
        onClick={onClick}
        size="default"
        className="mt-5 w-full text-[14px]"
      >
        {actionLabel}
      </Button>
    </Card>
  );
}

function LibraryPreviewAction({ item }: { item: LibraryItemRecord }) {
  if (isPreviewableLibraryFile(item.fileName, item.mimeType)) {
    return (
      <AssetPreviewButton
        fileName={item.fileName}
        mimeType={item.mimeType}
        previewPath={item.previewPath}
        downloadPath={item.downloadPath}
        triggerClassName="h-9 w-9 rounded-full text-brand hover:bg-[#eef6ef]"
      />
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full text-brand"
      onClick={() =>
        showInfoToast(
          "Preview not available.",
          "Preview is not available for this file type. Please download the file.",
        )
      }
      aria-label={`Preview ${item.fileName}`}
      title="Preview"
    >
      <Eye className="h-4.5 w-4.5" />
    </Button>
  );
}

type LibraryWorkspaceProps = {
  initialData: LibraryPageData;
};

export function LibraryWorkspace({ initialData }: LibraryWorkspaceProps) {
  const [activeQuickMenu, setActiveQuickMenu] =
    useState<LibraryQuickMenuOption>("assets");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [projectId, setProjectId] = useState("all");
  const [dateFilter, setDateFilter] = useState<LibraryDateFilter>("all");
  const [createdById, setCreatedById] = useState("all");
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>("All Types");
  const [currentPage, setCurrentPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(
    initialData.pageSize as (typeof pageSizeOptions)[number],
  );
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryItemRecord | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLibraryPage() {
      try {
        const response = await fetch(
          buildLibraryUrl({
            page: currentPage,
            pageSize,
            search: deferredSearch,
            projectId: projectId === "all" ? "" : projectId,
            createdById: createdById === "all" ? "" : createdById,
            date: dateFilter,
            type: typeFilter,
            quickMenu: activeQuickMenu,
          }),
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as LibraryPageData | { error?: string };

        if (!response.ok) {
          throw new Error(
            typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
              ? payload.error
              : "Unable to load library files right now.",
          );
        }

        if (cancelled) {
          return;
        }

        setData(payload as LibraryPageData);
        setError(null);
        setLoading(false);
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load library files right now.",
        );
        setLoading(false);
      }
    }

    loadLibraryPage().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeQuickMenu, createdById, currentPage, dateFilter, deferredSearch, pageSize, projectId, typeFilter]);

  async function refetchLibraryPage() {
    setLoading(true);

    try {
      const response = await fetch(
        buildLibraryUrl({
          page: currentPage,
          pageSize,
          search: deferredSearch,
          projectId: projectId === "all" ? "" : projectId,
          createdById: createdById === "all" ? "" : createdById,
          date: dateFilter,
          type: typeFilter,
          quickMenu: activeQuickMenu,
        }),
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as LibraryPageData | { error?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : "Unable to load library files right now.",
        );
      }

      setData(payload as LibraryPageData);
      setError(null);
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Unable to load library files right now.";
      setError(message);
      showErrorToast("Unable to load library files.", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteFile() {
    if (!deleteTarget) {
      return;
    }

    setPendingDeleteId(deleteTarget.id);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/library/attachments/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete the file right now.");
      }

      setDeleteTarget(null);
      showSuccessToast("File deleted from library.");
      await refetchLibraryPage();
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Unable to delete the file right now.";
      setDeleteError(message);
      showErrorToast("Unable to delete file.", message);
    } finally {
      setPendingDeleteId(null);
    }
  }

  function handleFavoriteChange(itemId: string, isFavorited: boolean) {
    setData((current) => {
      const currentItem = current.items.find((item) => item.id === itemId);
      const wasFavorited = currentItem?.isFavoritedByCurrentUser ?? false;

      let nextItems = current.items.map((item) =>
        item.id === itemId ? { ...item, isFavoritedByCurrentUser: isFavorited } : item,
      );
      let nextTotal = current.total;

      if (activeQuickMenu === "favourites" && !isFavorited) {
        nextItems = nextItems.filter((item) => item.id !== itemId);
        nextTotal = Math.max(0, current.total - 1);
      }

      const favouritesDelta =
        isFavorited === wasFavorited ? 0 : isFavorited ? 1 : -1;

      return {
        ...current,
        items: nextItems,
        total: nextTotal,
        totalPages: Math.max(1, Math.ceil(nextTotal / current.pageSize)),
        counts: {
          ...current.counts,
          favourites: Math.max(0, current.counts.favourites + favouritesDelta),
        },
      };
    });
  }

  function handleQuickMenuSelection(nextQuickMenu: LibraryQuickMenuOption) {
    setLoading(true);
    setActiveQuickMenu(nextQuickMenu);
    setCurrentPage(1);

    if (nextQuickMenu === "users") {
      window.requestAnimationFrame(() => {
        const trigger = document.querySelector<HTMLElement>(
          '[data-library-created-by-trigger="true"]',
        );
        trigger?.focus();
      });
    }
  }

  const noLibraryFiles = data.counts.projectAssets === 0;
  const noFilteredFiles = !loading && data.items.length === 0;

  return (
    <section className="space-y-6">
      <MotionSection>
        <header className="space-y-2">
          <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
            Library
          </h1>
          <p className="text-[16px] text-[#68736a]">
            Browse working project files, attachments, and submissions from real uploads across the PMS.
          </p>
        </header>
      </MotionSection>

      <MotionSection y={10}>
        <Card className="rounded-[30px] border-0 bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#434747]">
                  Quick Menu
                </h2>
                <p className="mt-1 text-[13px] text-[#79817b]">
                  Jump into the most useful library views without leaving the page.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <QuickMenuCard
                active={activeQuickMenu === "assets"}
                title="Project Assets"
                description={`${data.counts.projectAssets} files available`}
                actionLabel="View"
                onClick={() => handleQuickMenuSelection("assets")}
                icon={FileStack}
              />
              <QuickMenuCard
                active={activeQuickMenu === "finance"}
                title="Quotations/Invoices"
                description={`${data.counts.quotationsAndInvoices} files available`}
                actionLabel="View"
                onClick={() => handleQuickMenuSelection("finance")}
                icon={ReceiptText}
              />
              <QuickMenuCard
                active={activeQuickMenu === "users"}
                title="From Users"
                description={`${data.counts.fromUsers} uploaders available`}
                actionLabel="Filter"
                onClick={() => handleQuickMenuSelection("users")}
                icon={UserRound}
              />
              <QuickMenuCard
                active={activeQuickMenu === "favourites"}
                title="Favourites"
                description={`${data.counts.favourites} files saved`}
                actionLabel="View"
                onClick={() => handleQuickMenuSelection("favourites")}
                icon={Star}
              />
            </div>
          </div>

          <Card className="rounded-[24px] border-0 bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] p-4 shadow-none">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
              <Input
                value={search}
                onChange={(event) => {
                  setLoading(true);
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by file, project, user, or type"
                className="h-[42px] border-0 px-5 text-[13px] text-[#657069]"
              />

              <Select
                value={projectId}
                onValueChange={(value) => {
                  setLoading(true);
                  setProjectId(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-[42px] border-0 text-[13px] text-[#657069]">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {data.filters.projects.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={dateFilter}
                onValueChange={(value) => {
                  setLoading(true);
                  setDateFilter(value as LibraryDateFilter);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-[42px] border-0 text-[13px] text-[#657069]">
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  {dateFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={createdById}
                onValueChange={(value) => {
                  setLoading(true);
                  setCreatedById(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger
                  data-library-created-by-trigger="true"
                  className="h-[42px] border-0 text-[13px] text-[#657069]"
                >
                  <SelectValue placeholder="Created by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {data.filters.createdBy.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setLoading(true);
                  setTypeFilter(value as LibraryTypeFilter);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-[42px] border-0 text-[13px] text-[#657069]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {libraryTypeFilterOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-[#e3e8e3] bg-white shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full border-collapse">
                <thead className="bg-[linear-gradient(90deg,#2b7e51,#3ca36d)] text-left text-[13px] font-[700] text-white">
                  <tr>
                    <th className="px-5 py-4">File Name</th>
                    <th className="px-4 py-4">Project</th>
                    <th className="px-4 py-4">Date</th>
                    <th className="px-4 py-4">Created by</th>
                    <th className="px-4 py-4">Type</th>
                    <th className="px-4 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-[14px] text-[#707a72]">
                        Loading library files...
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <p className="text-[16px] font-[700] text-[#18211a]">
                          Unable to load library files.
                        </p>
                        <p className="mt-2 text-[14px] text-[#68736a]">{error}</p>
                        <Button
                          type="button"
                          className="mt-5"
                          onClick={() => {
                            void refetchLibraryPage();
                          }}
                        >
                          Retry
                        </Button>
                      </td>
                    </tr>
                  ) : data.items.length > 0 ? (
                    data.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-[#edf0ee] text-[13px] text-[#141915] transition-colors hover:bg-[#f8fbf8]"
                      >
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-[700] leading-[1.25] text-[#18211a]">
                              {item.fileName}
                            </p>
                            {item.projectTag ? (
                              <p className="mt-1 text-[11px] text-[#7a847d]">
                                Tag: {item.projectTag}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[#314036]">{item.projectName}</td>
                        <td className="px-4 py-4 text-[#5f6b62]">{item.uploadedAt}</td>
                        <td className="px-4 py-4 text-[#314036]">{item.createdBy}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-[#edf7ef] px-3 py-1 text-[11px] font-[700] text-[#2b8b56]">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <LibraryPreviewAction item={item} />
                            <AttachmentFavoriteButton
                              attachmentId={item.id}
                              initialIsFavorited={item.isFavoritedByCurrentUser}
                              onChange={(isFavorited) =>
                                handleFavoriteChange(item.id, isFavorited)
                              }
                              className="h-9 w-9 rounded-full text-[#7a847d] hover:bg-[#fff4f5]"
                              iconClassName="h-4.5 w-4.5"
                              showToast={true}
                            />
                            <Button asChild type="button" size="sm" className="min-h-[32px] px-3 text-[11px]">
                              <a
                                href={item.downloadPath}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Download ${item.fileName}`}
                              >
                                <span className="mr-1.5">Download</span>
                                <Download className="h-3 w-3" />
                              </a>
                            </Button>
                            {item.canDelete ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeleteTarget(item);
                                  setDeleteError(null);
                                }}
                                className="h-9 w-9 rounded-full text-[#ff2e00] hover:bg-[#fff3f0] hover:text-[#ff2e00]"
                                aria-label={`Delete ${item.fileName}`}
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-[14px] text-[#707a72]">
                        {noLibraryFiles
                          ? "No library files found."
                          : activeQuickMenu === "favourites"
                            ? "No favorite files yet. Mark files with the heart icon to find them here later."
                          : noFilteredFiles
                            ? "No files match your filters. Try changing your search or filters."
                            : "No library files found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 border-t border-[#e7ece7] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-[14px] text-[#5f6b62]">
                Showing {data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1} to{" "}
                {Math.min(data.page * data.pageSize, data.total)} of {data.total} files
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => {
                      setLoading(true);
                      setCurrentPage((current) => Math.max(1, current - 1));
                    }}
                    disabled={data.page === 1 || loading}
                    className="border border-[#dce4dc]"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {Array.from({ length: data.totalPages }, (_, index) => index + 1)
                    .slice(0, 5)
                    .map((pageNumber) => (
                      <Button
                        key={pageNumber}
                        type="button"
                        variant={pageNumber === data.page ? "default" : "secondary"}
                        className="min-w-[44px] rounded-[16px] px-3 text-[14px]"
                        onClick={() => {
                          setLoading(true);
                          setCurrentPage(pageNumber);
                        }}
                        disabled={loading}
                      >
                        {pageNumber}
                      </Button>
                    ))}

                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => {
                      setLoading(true);
                      setCurrentPage((current) => Math.min(data.totalPages, current + 1));
                    }}
                    disabled={data.page === data.totalPages || loading}
                    className="border border-[#dce4dc]"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setLoading(true);
                    setPageSize(Number(value) as (typeof pageSizeOptions)[number]);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-11 w-[126px] border border-[#dce4dc] text-[14px] shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>
      </MotionSection>

      <ConfirmationDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete file?"
        description="This file will be removed from the library. This action cannot be undone."
        confirmLabel="Delete File"
        cancelLabel="Cancel"
        tone="destructive"
        pending={pendingDeleteId === deleteTarget?.id}
        error={deleteError ?? undefined}
        onClose={() => {
          if (pendingDeleteId) {
            return;
          }

          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          void handleDeleteFile();
        }}
      />
    </section>
  );
}
