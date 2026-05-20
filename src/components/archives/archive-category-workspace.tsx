"use client";

import { useMemo, useState } from "react";
import { Download, Eye, Pencil, ShieldCheck, Trash2 } from "lucide-react";

import {
  getFileTypeIcon,
  type ArchiveItem,
} from "@/components/archives/archive-data";
import {
  ArchiveItemDialog,
  type ArchiveItemForm,
} from "@/components/archives/archive-item-dialog";

type ArchiveCategoryWorkspaceProps = {
  categoryTitle: string;
  initialItems: ArchiveItem[];
};

type ArchiveFilters = {
  search: string;
  project: string;
  date: string;
  createdBy: string;
  tag: string;
  country: string;
};

const defaultFilters: ArchiveFilters = {
  search: "",
  project: "",
  date: "",
  createdBy: "",
  tag: "",
  country: "",
};

function uniqueValues(items: ArchiveItem[], key: keyof ArchiveItem) {
  return Array.from(new Set(items.map((item) => item[key] as string)));
}

function getDefaultForm(): ArchiveItemForm {
  return {
    fileName: "",
    projectName: "",
    projectLabel: "",
    date: "",
    listedBy: "",
    createdBy: "",
    fileTypes: "PDF, ZIP",
    tag: "",
    country: "",
  };
}

function toItem(form: ArchiveItemForm, id: string): ArchiveItem {
  return {
    id,
    fileName: form.fileName.trim(),
    projectName: form.projectName.trim(),
    projectLabel: form.projectLabel.trim(),
    date: form.date.trim(),
    listedBy: form.listedBy.trim(),
    createdBy: form.createdBy.trim(),
    fileTypes: form.fileTypes
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
    tag: form.tag.trim(),
    country: form.country.trim(),
  };
}

export function ArchiveCategoryWorkspace({
  categoryTitle,
  initialItems,
}: ArchiveCategoryWorkspaceProps) {
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);
  const [filters, setFilters] = useState<ArchiveFilters>(defaultFilters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ArchiveItemForm>(getDefaultForm());

  const options = useMemo(
    () => ({
      project: uniqueValues(items, "projectName"),
      date: uniqueValues(items, "date"),
      createdBy: uniqueValues(items, "createdBy"),
      tag: uniqueValues(items, "tag"),
      country: uniqueValues(items, "country"),
    }),
    [items],
  );

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (
        filters.search &&
        ![
          item.fileName,
          item.projectName,
          item.projectLabel,
          item.createdBy,
          item.tag,
          item.country,
        ]
          .join(" ")
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      ) {
        return false;
      }

      if (filters.project && item.projectName !== filters.project) return false;
      if (filters.date && item.date !== filters.date) return false;
      if (filters.createdBy && item.createdBy !== filters.createdBy) return false;
      if (filters.tag && item.tag !== filters.tag) return false;
      if (filters.country && item.country !== filters.country) return false;

      return true;
    });
  }, [filters, items]);

  function updateFilter<K extends keyof ArchiveFilters>(
    key: K,
    value: ArchiveFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateForm<K extends keyof ArchiveItemForm>(
    key: K,
    value: ArchiveItemForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openAddDialog() {
    setDialogMode("add");
    setEditingId(null);
    setForm(getDefaultForm());
    setDialogOpen(true);
  }

  function openEditDialog(item: ArchiveItem) {
    setDialogMode("edit");
    setEditingId(item.id);
    setForm({
      fileName: item.fileName,
      projectName: item.projectName,
      projectLabel: item.projectLabel,
      date: item.date,
      listedBy: item.listedBy,
      createdBy: item.createdBy,
      fileTypes: item.fileTypes.join(", "),
      tag: item.tag,
      country: item.country,
    });
    setDialogOpen(true);
  }

  function saveItem() {
    if (!form.fileName.trim() || !form.projectName.trim()) {
      return;
    }

    if (dialogMode === "add") {
      setItems((current) => [...current, toItem(form, `archive-${Date.now()}`)]);
    } else if (editingId) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingId ? toItem(form, editingId) : item,
        ),
      );
    }

    setDialogOpen(false);
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <>
      <section className="space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
            {categoryTitle}
          </h1>
          <button
            type="button"
            onClick={openAddDialog}
            className="inline-flex min-h-[42px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-6 text-[14px] font-[600] text-white"
          >
            Add+
          </button>
        </header>

        <section className="rounded-[30px] bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <div className="rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] p-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
              <input
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Search....."
                className="h-[36px] rounded-full bg-white px-4 text-[12px] text-[#657069] outline-none"
              />

              {(
                [
                  ["project", options.project, "Project"],
                  ["date", options.date, "Date"],
                  ["createdBy", options.createdBy, "Created by"],
                  ["tag", options.tag, "Tag"],
                  ["country", options.country, "Country"],
                ] as const
              ).map(([key, values, label]) => (
                <select
                  key={key}
                  value={filters[key]}
                  onChange={(event) => updateFilter(key, event.target.value)}
                  className="h-[36px] rounded-full bg-white px-4 text-[12px] text-[#657069] outline-none"
                >
                  <option value="">{label}</option>
                  {values.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-[20px] border border-brand/35 bg-white">
            <table className="min-w-[1040px] w-full border-collapse">
              <thead>
                <tr className="text-left text-[13px] font-[600] text-[#6d756f]">
                  <th className="px-5 py-4">File Name / Project Name</th>
                  <th className="px-4 py-4">Date</th>
                  <th className="px-4 py-4">Listed by</th>
                  <th className="px-4 py-4">Created by</th>
                  <th className="px-4 py-4">File types</th>
                  <th className="px-4 py-4">Actions</th>
                </tr>
              </thead>
            </table>
          </div>

          <div className="mt-4 space-y-3">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className="grid min-w-0 gap-4 rounded-[20px] border border-brand/35 bg-white px-5 py-4 shadow-[0_18px_45px_rgba(23,39,28,0.05)] xl:grid-cols-[2fr_0.9fr_0.9fr_1.2fr_1.7fr_1.1fr]"
              >
                <div className="min-w-0">
                  <h3 className="text-[14px] font-[700] leading-[1.25] text-[#111712]">
                    {item.fileName}
                  </h3>
                  <div className="my-3 h-px w-full bg-[#dce2dd]" />
                  <p className="text-[13px] font-[600] text-brand">
                    {item.projectLabel}
                  </p>
                </div>

                <div className="text-[13px] font-[600] text-[#111712] xl:self-center">
                  {item.date}
                </div>

                <div className="text-[13px] font-[600] text-[#111712] xl:self-center">
                  {item.listedBy}
                </div>

                <div className="text-[13px] font-[600] text-[#111712] xl:self-center">
                  {item.createdBy}
                </div>

                <div className="flex flex-wrap gap-2 xl:self-center">
                  {item.fileTypes.map((type) => {
                    const Icon = getFileTypeIcon(type);

                    return (
                      <div
                        key={`${item.id}-${type}`}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-[#ecefed] bg-white shadow-[0_8px_20px_rgba(16,26,20,0.08)]"
                        title={type}
                      >
                        <Icon className="h-5 w-5 text-brand" />
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 xl:self-start">
                  {[
                    { label: "Open", icon: Eye, action: () => undefined },
                    { label: "Download", icon: Download, action: () => undefined },
                    { label: "Manage", icon: ShieldCheck, action: () => undefined },
                    { label: "Edit", icon: Pencil, action: () => openEditDialog(item) },
                  ].map((action) => {
                    const Icon = action.icon;

                    return (
                      <button
                        key={action.label}
                        type="button"
                        onClick={action.action}
                        className="flex min-h-[40px] flex-col items-center justify-center rounded-xl border border-[#ecefed] bg-white px-2 py-2 text-[10px] font-[600] text-[#3a443d] shadow-[0_8px_20px_rgba(16,26,20,0.08)]"
                      >
                        <Icon className="mb-1 h-4 w-4 text-brand" />
                        {action.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="col-span-2 mt-1 inline-flex min-h-[36px] items-center justify-center gap-2 rounded-xl bg-[#fff0ef] text-[11px] font-[700] text-[#ff3b2f]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </article>
            ))}

            {visibleItems.length === 0 ? (
              <div className="rounded-[20px] border border-brand/25 bg-white px-5 py-10 text-center text-[14px] text-[#707a72]">
                No archive files match the current filters.
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <ArchiveItemDialog
        isOpen={dialogOpen}
        mode={dialogMode}
        title={categoryTitle}
        form={form}
        onChange={updateForm}
        onClose={() => setDialogOpen(false)}
        onSubmit={saveItem}
      />
    </>
  );
}
