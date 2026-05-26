"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BadgeDollarSign,
  Check,
  FolderKanban,
  Pencil,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react";

import {
  deleteProjectCategoryAction,
  deleteProjectCurrencyAction,
  deleteProjectTagAction,
  saveProjectCategoryAction,
  saveProjectCurrencyAction,
  saveProjectTagAction,
} from "@/app/(dashboard)/settings/project-master-data/actions";
import type {
  ProjectMasterCurrencyRecord,
  ProjectMasterDataItemRecord,
  ProjectMasterDataSummary,
} from "@/lib/project-master-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type MasterDataTab = "categories" | "tags" | "currencies";

type MasterDataFormState = {
  id?: string;
  name: string;
  description: string;
  color: string;
  code: string;
  isActive: boolean;
};

type MasterDataFieldErrors = {
  name?: string;
  code?: string;
};

type ProjectMasterDataWorkspaceProps = {
  categories: ProjectMasterDataItemRecord[];
  tags: ProjectMasterDataItemRecord[];
  currencies: ProjectMasterCurrencyRecord[];
  summary: ProjectMasterDataSummary;
  canDeleteItems: boolean;
};

type DeleteTarget = {
  tab: MasterDataTab;
  item: ProjectMasterDataItemRecord | ProjectMasterCurrencyRecord;
} | null;

const colorOptions = [
  "#34a853",
  "#1f7ae0",
  "#8b5cf6",
  "#f59e0b",
  "#0f9ba8",
  "#ef4444",
  "#a1a1aa",
] as const;

const defaultFormState: MasterDataFormState = {
  name: "",
  description: "",
  color: "",
  code: "",
  isActive: true,
};

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: typeof FolderKanban;
}) {
  return (
    <Card className="rounded-[26px] border border-[#ebefe8] bg-white shadow-[0_16px_40px_rgba(23,39,28,0.05)]">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-[#f4faf5] text-brand">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-[30px] font-[700] leading-none tracking-[-0.04em] text-[#121813]">
            {value}
          </p>
          <p className="mt-2 text-[14px] font-[600] text-[#232a25]">{title}</p>
          <p className="text-[13px] text-[#718072]">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[12px] font-[700] ${
        active ? "bg-[#eef8f0] text-brand" : "bg-[#f4f4f5] text-[#666f68]"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ColorDot({ color }: { color: string }) {
  if (!color) {
    return <span className="text-[14px] text-[#90998f]">—</span>;
  }

  return (
    <span
      className="inline-block h-3.5 w-3.5 rounded-full border border-black/5"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

function MasterDataTable({
  type,
  items,
  onAdd,
  onEdit,
  onDelete,
  canDelete,
  pending,
}: {
  type: MasterDataTab;
  items: ProjectMasterDataItemRecord[] | ProjectMasterCurrencyRecord[];
  onAdd: () => void;
  onEdit: (item: ProjectMasterDataItemRecord | ProjectMasterCurrencyRecord) => void;
  onDelete: (item: ProjectMasterDataItemRecord | ProjectMasterCurrencyRecord) => void;
  canDelete: boolean;
  pending: boolean;
}) {
  const isCurrency = type === "currencies";
  const emptyLabel =
    type === "categories"
      ? "No categories added yet."
      : type === "tags"
        ? "No tags added yet."
        : "No currencies added yet.";

  return (
    <Card className="rounded-[28px] border border-[#ebefe8] bg-white shadow-[0_16px_40px_rgba(23,39,28,0.05)]">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[28px] font-[700] tracking-[-0.03em] text-[#131914]">
              {type === "categories"
                ? "Categories"
                : type === "tags"
                  ? "Tags"
                  : "Currencies"}
            </h2>
            <p className="mt-1 text-[14px] text-[#738072]">
              {type === "categories"
                ? "Manage project categories used across the system."
                : type === "tags"
                  ? "Manage tags used to label and group projects."
                  : "Manage active currency codes used in project budgets."}
            </p>
          </div>
          <Button type="button" onClick={onAdd} className="gap-2 self-start">
            <Plus className="h-4 w-4" />
            {type === "categories"
              ? "Add Category"
              : type === "tags"
                ? "Add Tag"
                : "Add Currency"}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-[#dfe7df] bg-[#fbfdfb] px-6 py-16 text-center">
            <p className="text-[22px] font-[700] tracking-[-0.03em] text-[#162019]">
              {emptyLabel}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  {(isCurrency
                    ? ["Currency Name", "Currency Code", "Status", "Actions"]
                    : ["Name", "Description", "Color", "Status", "Actions"]
                  ).map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-[#edf1ec] px-4 py-3 text-[12px] font-[700] uppercase tracking-[0.08em] text-[#7c867d]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const currencyItem = item as ProjectMasterCurrencyRecord;
                  const generalItem = item as ProjectMasterDataItemRecord;

                  return (
                    <tr key={item.id}>
                      <td className="border-b border-[#f1f4f0] px-4 py-4 text-[15px] font-[700] text-[#172019]">
                        {item.name}
                      </td>
                      {isCurrency ? (
                        <td className="border-b border-[#f1f4f0] px-4 py-4 text-[14px] font-[700] text-brand">
                          {currencyItem.code}
                        </td>
                      ) : (
                        <>
                          <td className="max-w-[320px] border-b border-[#f1f4f0] px-4 py-4 text-[14px] text-[#667067]">
                            {generalItem.description || "—"}
                          </td>
                          <td className="border-b border-[#f1f4f0] px-4 py-4">
                            <ColorDot color={generalItem.color} />
                          </td>
                        </>
                      )}
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        <StatusPill active={item.isActive} />
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(item)}
                            disabled={pending}
                            className="gap-2 rounded-full"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          {canDelete ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              onClick={() => onDelete(item)}
                              disabled={pending}
                              className="h-9 w-9 rounded-[12px] border border-[#f0d6d4] bg-white text-[#c5524d] hover:bg-[#fff6f5] hover:text-[#c5524d]"
                              aria-label={`Delete ${item.name}`}
                              title={`Delete ${item.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MasterDataDrawer({
  isOpen,
  tab,
  mode,
  form,
  fieldErrors,
  error,
  saving,
  onClose,
  onSubmit,
  onChange,
}: {
  isOpen: boolean;
  tab: MasterDataTab;
  mode: "add" | "edit";
  form: MasterDataFormState;
  fieldErrors: MasterDataFieldErrors;
  error?: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: <K extends keyof MasterDataFormState>(
    field: K,
    value: MasterDataFormState[K],
  ) => void;
}) {
  if (!isOpen) {
    return null;
  }

  const label =
    tab === "categories" ? "Category" : tab === "tags" ? "Tag" : "Currency";
  const isCurrency = tab === "currencies";

  return (
    <div className="fixed inset-0 z-50 bg-[#102116]/30 backdrop-blur-[2px]">
      <div className="absolute inset-y-0 right-0 w-full max-w-[560px] overflow-y-auto bg-white shadow-[-18px_0_60px_rgba(11,26,18,0.16)]">
        <div className="flex min-h-full flex-col px-6 py-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[34px] font-[700] leading-none tracking-[-0.05em] text-[#111712]">
                {mode === "add" ? `Add New ${label}` : `Edit ${label}`}
              </h2>
              <p className="mt-3 text-[15px] text-[#6d776e]">
                {mode === "add"
                  ? `Create a reusable project ${label.toLowerCase()}.`
                  : `Update this project ${label.toLowerCase()} value.`}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="shrink-0 border border-line"
              aria-label="Close master data drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error ? (
            <div className="mt-6 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
              {error}
            </div>
          ) : null}

          <div className="mt-8 space-y-6">
            <label className="space-y-2">
              <span className="block text-[13px] font-[700] text-[#2b352d]">
                {isCurrency ? "Currency Name" : "Name"}{" "}
                <span className="text-[#c5524d]">*</span>
              </span>
              <Input
                value={form.name}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder={`Enter ${label.toLowerCase()} name`}
                className={`h-12 rounded-2xl border ${
                  fieldErrors.name ? "border-[#e0a8a6]" : "border-line"
                }`}
              />
              {fieldErrors.name ? (
                <span className="text-[12px] font-[600] text-[#bb4d49]">
                  {fieldErrors.name}
                </span>
              ) : null}
            </label>

            {isCurrency ? (
              <label className="space-y-2">
                <span className="block text-[13px] font-[700] text-[#2b352d]">
                  Currency Code <span className="text-[#c5524d]">*</span>
                </span>
                <Input
                  value={form.code}
                  onChange={(event) => onChange("code", event.target.value.toUpperCase())}
                  placeholder="Enter currency code"
                  maxLength={3}
                  className={`h-12 rounded-2xl border uppercase ${
                    fieldErrors.code ? "border-[#e0a8a6]" : "border-line"
                  }`}
                />
                {fieldErrors.code ? (
                  <span className="text-[12px] font-[600] text-[#bb4d49]">
                    {fieldErrors.code}
                  </span>
                ) : (
                  <span className="text-[12px] text-[#6d776e]">
                    Use a 3-letter uppercase currency code, for example AED or USD.
                  </span>
                )}
              </label>
            ) : (
              <>
                <label className="space-y-2">
                  <span className="block text-[13px] font-[700] text-[#2b352d]">
                    Description
                  </span>
                  <Textarea
                    value={form.description}
                    onChange={(event) => onChange("description", event.target.value)}
                    placeholder="Enter description (optional)"
                    className="min-h-[132px] rounded-[22px] border border-line"
                  />
                </label>

                <div className="space-y-3">
                  <span className="block text-[13px] font-[700] text-[#2b352d]">
                    Color Label
                  </span>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => onChange("color", "")}
                      className={`rounded-full border px-3 py-2 text-[12px] font-[700] ${
                        !form.color
                          ? "border-brand bg-[#eef8f0] text-brand"
                          : "border-[#e4eae3] text-[#637064]"
                      }`}
                    >
                      No color
                    </button>
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => onChange("color", color)}
                        className={`grid h-10 w-10 place-items-center rounded-full border-2 transition ${
                          form.color === color ? "border-[#183425]" : "border-transparent"
                        }`}
                        aria-label={`Select color ${color}`}
                      >
                        <span
                          className="grid h-8 w-8 place-items-center rounded-full"
                          style={{ backgroundColor: color }}
                        >
                          {form.color === color ? (
                            <Check className="h-4 w-4 text-white" />
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-3">
              <span className="block text-[13px] font-[700] text-[#2b352d]">Status</span>
              <button
                type="button"
                onClick={() => onChange("isActive", !form.isActive)}
                className="inline-flex items-center gap-3"
              >
                <span
                  className={`relative h-8 w-14 rounded-full transition ${
                    form.isActive ? "bg-brand" : "bg-[#d3dad4]"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-[0_4px_12px_rgba(18,34,25,0.18)] transition ${
                      form.isActive ? "left-7" : "left-1"
                    }`}
                  />
                </span>
                <span className="text-[15px] font-[700] text-[#1e271f]">
                  {form.isActive ? "Active" : "Inactive"}
                </span>
              </button>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-10">
            <Button type="button" onClick={onSubmit} disabled={saving} className="h-14 text-[16px]">
              {saving
                ? mode === "add"
                  ? `Saving ${label}...`
                  : `Updating ${label}...`
                : mode === "add"
                  ? `Save ${label}`
                  : `Update ${label}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
              className="h-12 rounded-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectMasterDataWorkspace({
  categories,
  tags,
  currencies,
  summary,
  canDeleteItems,
}: ProjectMasterDataWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MasterDataTab>("categories");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<MasterDataFormState>(defaultFormState);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<MasterDataFieldErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function openAddDrawer(tab: MasterDataTab) {
    setActiveTab(tab);
    setDialogMode("add");
    setForm(defaultFormState);
    setError(undefined);
    setFieldErrors({});
    setDrawerOpen(true);
  }

  function openEditDrawer(
    tab: MasterDataTab,
    item: ProjectMasterDataItemRecord | ProjectMasterCurrencyRecord,
  ) {
    setActiveTab(tab);
    setDialogMode("edit");
    setForm({
      id: item.id,
      name: item.name,
      description: "description" in item ? item.description : "",
      color: "color" in item ? item.color : "",
      code: "code" in item ? item.code : "",
      isActive: item.isActive,
    });
    setError(undefined);
    setFieldErrors({});
    setDrawerOpen(true);
  }

  function handleSubmit() {
    const normalizedName = form.name.trim();
    const nextFieldErrors: MasterDataFieldErrors = {};

    if (!normalizedName) {
      nextFieldErrors.name = "Name is required.";
    }

    if (activeTab === "currencies") {
      const normalizedCode = form.code.trim().toUpperCase();

      if (!normalizedCode) {
        nextFieldErrors.code = "Currency code is required.";
      } else if (!/^[A-Z]{3}$/.test(normalizedCode)) {
        nextFieldErrors.code = "Currency code must be 3 uppercase letters.";
      }
    }

    if (nextFieldErrors.name || nextFieldErrors.code) {
      setFieldErrors(nextFieldErrors);
      showErrorToast("Unable to save value.", "Please review the highlighted fields.");
      return;
    }

    setFieldErrors({});
    setError(undefined);

    startTransition(async () => {
      try {
        const result =
          activeTab === "categories"
            ? await saveProjectCategoryAction({
                ...form,
                name: normalizedName,
              })
            : activeTab === "tags"
              ? await saveProjectTagAction({
                  ...form,
                  name: normalizedName,
                })
              : await saveProjectCurrencyAction({
                  ...form,
                  name: normalizedName,
                  code: form.code.trim().toUpperCase(),
                });

        if (result.error) {
          setError(result.error);
          showErrorToast(
            activeTab === "currencies"
              ? "Unable to save currency."
              : activeTab === "tags"
                ? "Unable to save tag."
                : "Unable to save category.",
            result.error,
          );
          return;
        }

        setDrawerOpen(false);
        showSuccessToast(
          activeTab === "currencies"
            ? dialogMode === "add"
              ? "Currency added successfully."
              : "Currency updated successfully."
            : activeTab === "tags"
              ? dialogMode === "add"
                ? "Tag added successfully."
                : "Tag updated successfully."
              : dialogMode === "add"
                ? "Category added successfully."
                : "Category updated successfully.",
        );
        router.refresh();
      } catch {
        setError("Unable to save this value right now. Please try again.");
        showErrorToast(
          "Unable to save value.",
          "Unable to save this value right now. Please try again.",
        );
      }
    });
  }

  function handleDelete(
    tab: MasterDataTab,
    item: ProjectMasterDataItemRecord | ProjectMasterCurrencyRecord,
  ) {
    setError(undefined);
    setFieldErrors({});
    setDeleteError(undefined);
    setDeleteTarget({ tab, item });
  }

  function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleteError(undefined);

    startTransition(async () => {
      try {
        const result =
          deleteTarget.tab === "categories"
            ? await deleteProjectCategoryAction(deleteTarget.item.id)
            : deleteTarget.tab === "tags"
              ? await deleteProjectTagAction(deleteTarget.item.id)
              : await deleteProjectCurrencyAction(deleteTarget.item.id);

        if (result.error) {
          setDeleteError(result.error);
          showErrorToast("Unable to delete value.", result.error);
          return;
        }

        showSuccessToast(
          deleteTarget.tab === "currencies"
            ? "Currency deleted successfully."
            : deleteTarget.tab === "tags"
              ? "Tag deleted successfully."
              : "Category deleted successfully.",
        );
        setDeleteTarget(null);
        router.refresh();
      } catch {
        setDeleteError("Unable to delete this item right now. Please try again.");
        showErrorToast(
          "Unable to delete value.",
          "Unable to delete this item right now. Please try again.",
        );
      }
    });
  }

  return (
    <>
      <section className="space-y-6">
        <header className="rounded-[30px] bg-white px-6 py-7 shadow-[0_18px_44px_rgba(23,39,28,0.05)] sm:px-8">
          <p className="text-[13px] font-[700] uppercase tracking-[0.18em] text-brand/75">
            Settings
          </p>
          <h1 className="mt-2 text-[44px] font-[700] leading-none tracking-[-0.05em] text-[#111712]">
            Project Master Data
          </h1>
          <p className="mt-3 max-w-[720px] text-[16px] leading-7 text-[#6f776f]">
            Manage reusable project categories, tags, and currencies used across projects.
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link href="/settings">Back to Settings</Link>
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            title="Total Categories"
            value={summary.totalCategories}
            subtitle="Saved values"
            icon={FolderKanban}
          />
          <SummaryCard
            title="Active Categories"
            value={summary.activeCategories}
            subtitle="Visible in project forms"
            icon={FolderKanban}
          />
          <SummaryCard
            title="Total Tags"
            value={summary.totalTags}
            subtitle="Saved values"
            icon={Tags}
          />
          <SummaryCard
            title="Active Tags"
            value={summary.activeTags}
            subtitle="Visible in project filters"
            icon={Tags}
          />
          <SummaryCard
            title="Total Currencies"
            value={summary.totalCurrencies}
            subtitle="Saved values"
            icon={BadgeDollarSign}
          />
          <SummaryCard
            title="Active Currencies"
            value={summary.activeCurrencies}
            subtitle="Visible in project budgets"
            icon={BadgeDollarSign}
          />
        </div>

        {error && !drawerOpen ? (
          <div className="rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
            {error}
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as MasterDataTab)}
          className="space-y-6"
        >
          <div className="rounded-[28px] border border-[#ebefe8] bg-white p-4 shadow-[0_16px_40px_rgba(23,39,28,0.05)]">
            <TabsList className="w-full justify-start sm:w-auto">
              <TabsTrigger value="categories" className="min-w-[140px] py-3 text-[15px]">
                Categories
              </TabsTrigger>
              <TabsTrigger value="tags" className="min-w-[140px] py-3 text-[15px]">
                Tags
              </TabsTrigger>
              <TabsTrigger value="currencies" className="min-w-[140px] py-3 text-[15px]">
                Currencies
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="categories">
            <MasterDataTable
              type="categories"
              items={categories}
              onAdd={() => openAddDrawer("categories")}
              onEdit={(item) => openEditDrawer("categories", item)}
              onDelete={(item) => handleDelete("categories", item)}
              canDelete={canDeleteItems}
              pending={isPending}
            />
          </TabsContent>

          <TabsContent value="tags">
            <MasterDataTable
              type="tags"
              items={tags}
              onAdd={() => openAddDrawer("tags")}
              onEdit={(item) => openEditDrawer("tags", item)}
              onDelete={(item) => handleDelete("tags", item)}
              canDelete={canDeleteItems}
              pending={isPending}
            />
          </TabsContent>

          <TabsContent value="currencies">
            <MasterDataTable
              type="currencies"
              items={currencies}
              onAdd={() => openAddDrawer("currencies")}
              onEdit={(item) => openEditDrawer("currencies", item)}
              onDelete={(item) => handleDelete("currencies", item)}
              canDelete={canDeleteItems}
              pending={isPending}
            />
          </TabsContent>
        </Tabs>
      </section>

      <MasterDataDrawer
        isOpen={drawerOpen}
        tab={activeTab}
        mode={dialogMode}
        form={form}
        fieldErrors={fieldErrors}
        error={error}
        saving={isPending}
        onClose={() => {
          if (!isPending) {
            setDrawerOpen(false);
            setError(undefined);
            setFieldErrors({});
          }
        }}
        onSubmit={handleSubmit}
        onChange={(field, value) =>
          setForm((current) => ({
            ...current,
            [field]: value,
          }))
        }
      />

      <ConfirmationDialog
        isOpen={deleteTarget !== null}
        title={
          deleteTarget?.tab === "categories"
            ? "Delete Category"
            : deleteTarget?.tab === "tags"
              ? "Delete Tag"
              : "Delete Currency"
        }
        description={
          deleteTarget
            ? `Delete "${deleteTarget.item.name}"? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="destructive"
        pending={isPending}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!isPending) {
            setDeleteTarget(null);
            setDeleteError(undefined);
          }
        }}
      />
    </>
  );
}
