"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  CloudAlert,
  CloudCheck,
  Columns3,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  History,
  Link2,
  Link2Off,
  Loader2,
  PanelRightOpen,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import type { ProjectTrackerColumnType } from "@prisma/client";

import {
  addProjectTrackerColumnAction,
  addProjectTrackerRowAction,
  applyProjectTrackerLayoutAction,
  deleteProjectTrackerColumnAction,
  deleteProjectTrackerRowsAction,
  importProjectTrackerAction,
  initializeProjectTrackerAction,
  linkProjectTrackerRowAction,
  resetProjectTrackerToBlankAction,
  reorderProjectTrackerRowsAction,
  resolveProjectTrackerCellAction,
  restoreProjectTrackerItemAction,
  saveProjectTrackerCellAction,
  saveProjectTrackerCellsAction,
  saveProjectTrackerWorkbookAction,
  getProjectTrackerTrashAction,
  unlinkProjectTrackerRowAction,
  updateProjectTrackerColumnAction,
} from "@/app/(dashboard)/project-tracker/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ProjectTrackerSpreadsheetClient } from "@/components/project-tracker/project-tracker-spreadsheet-client";
import {
  PROJECT_TRACKER_SHEET_COLUMNS,
  PROJECT_TRACKER_SHEET_ROWS,
  type SpreadsheetExportRequest,
  type SpreadsheetFocusRequest,
} from "@/components/project-tracker/project-tracker-spreadsheet";
import type { TrackerCellChange } from "@/components/project-tracker/spreadsheet/hooks/use-spreadsheet";
import { buildProjectTrackerWorkbook, mergeImportedWorkbook } from "@/components/project-tracker/spreadsheet/lib/workbook";
import type { SpreadsheetWorkbook } from "@/components/project-tracker/spreadsheet/types/spreadsheet";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type {
  ProjectTrackerCellRecord,
  ProjectTrackerColumnRecord,
  ProjectTrackerProjectOption,
  ProjectTrackerRowRecord,
  ProjectTrackerTrashItemRecord,
  ProjectTrackerWorkspaceRecord,
  TrackerCellValue,
} from "@/lib/project-tracker";

type ProjectTrackerWorkspaceProps = {
  initialWorkspace: ProjectTrackerWorkspaceRecord;
};

type ActionResult =
  | { workspace: ProjectTrackerWorkspaceRecord; message?: string }
  | { ok: true; message?: string }
  | { error: string };

type ImportProgress = {
  stage: "reading" | "importing" | "rendering";
  fileName: string;
  rowCount?: number;
};
type ParsedSpreadsheet = {
  columns: Array<{ name: string; type: ProjectTrackerColumnType }>;
  rows: TrackerCellValue[][];
  workbook: SpreadsheetWorkbook;
  warnings: string[];
};
type ImportWorkerResponse =
  | ({ ok: true } & ParsedSpreadsheet)
  | { ok: false; error: string };
type DeleteConfirmation =
  | {
      kind: "rows";
      rowIds: string[];
      title: string;
      description: string;
      confirmLabel: string;
    }
  | {
      kind: "column";
      columnId: string;
      title: string;
      description: string;
      confirmLabel: string;
    };

const columnTypes: Array<{ value: ProjectTrackerColumnType; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "CURRENCY", label: "Currency" },
  { value: "DATE", label: "Date" },
  { value: "DATETIME", label: "Date & time" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "BOOLEAN", label: "Yes / No" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "PERSON", label: "Person" },
  { value: "CLIENT", label: "Client" },
  { value: "VENDOR", label: "Vendor" },
  { value: "PROJECT", label: "Project" },
  { value: "BRAND", label: "Brand" },
  { value: "URL", label: "URL" },
  { value: "FILE", label: "File" },
  { value: "STATUS", label: "Status" },
  { value: "PRIORITY", label: "Priority" },
  { value: "PERCENTAGE", label: "Progress" },
  { value: "TAGS", label: "Tags" },
  { value: "NOTES", label: "Notes" },
];

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./project-tracker-import.worker.ts", import.meta.url),
      { type: "module" },
    );
    const close = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => {
      close();
      if (event.data.ok) {
        resolve({
          columns: event.data.columns,
          rows: event.data.rows,
          workbook: event.data.workbook,
          warnings: event.data.warnings,
        });
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      close();
      reject(new Error(event.message || "The spreadsheet could not be read."));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toSearchText(value: TrackerCellValue) {
  if (Array.isArray(value)) return value.join(" ");
  if (value === null) return "";
  return String(value);
}

function formatDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function trackerHistoryDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatTrackerHistoryDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTrackerHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCellValue(value: TrackerCellValue, type?: ProjectTrackerColumnType) {
  if (value === null || value === "") return "";
  if (Array.isArray(value)) {
    if (value.length <= 2) return value.join(" · ");
    return `${value[0]} +${value.length - 1}`;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (type === "DATE" && typeof value === "string") return formatDate(value);
  if (type === "DATETIME" && typeof value === "string") return formatDate(value, true);
  if (type === "PERCENTAGE" && typeof value === "number") return `${value}%`;
  return String(value);
}

function SyncIndicator({ cell }: { cell: ProjectTrackerCellRecord }) {
  if (cell.syncState === "custom" || cell.syncState === "unavailable") return null;
  if (cell.syncState === "update-available") {
    return (
      <span title="Update available" className="grid size-5 place-items-center rounded-full bg-[#fff3df] text-[#c7751d]">
        <CircleAlert className="size-3" />
      </span>
    );
  }
  if (cell.syncState === "local-override") {
    return (
      <span title="Local tracker value" className="grid size-5 place-items-center rounded-full bg-[#f0f2ef] text-[#6b766e]">
        <Link2Off className="size-3" />
      </span>
    );
  }
  return (
    <span title="Connected to Flux" className="grid size-5 place-items-center rounded-full bg-[#edf8ef] text-[#268153]">
      <Link2 className="size-3" />
    </span>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
  widthClass = "max-w-[620px]",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-[#142119]/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`max-h-[88dvh] w-full ${widthClass} overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_34px_100px_rgba(15,31,21,0.24)]`}>
        <div className="flex items-start justify-between gap-4 border-b border-[#e5eae5] px-6 py-5">
          <div>
            <h2 className="text-[22px] font-[800] tracking-[-0.03em] text-[#142019]">{title}</h2>
            {description ? <p className="mt-1 text-[13px] leading-5 text-[#6c776f]">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full border border-[#dfe6df] text-[#4f5b53] hover:bg-[#f4f7f4]" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[calc(88dvh-92px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function ImportProgressDialog({ progress }: { progress: ImportProgress | null }) {
  if (!progress || typeof document === "undefined") return null;

  const content = progress.stage === "reading"
    ? {
        title: "Reading spreadsheet",
        description: `Checking ${progress.fileName} and preparing its rows and columns.`,
        step: 1,
      }
    : progress.stage === "importing"
      ? {
          title: `Importing ${progress.rowCount?.toLocaleString() ?? ""} rows`,
          description: "Saving the spreadsheet in optimized batches. You can keep this window open.",
          step: 2,
        }
      : {
          title: "Preparing your tracker",
          description: "The import is saved. Flux is preparing the first rows for display.",
          step: 3,
        };

  return createPortal(
    <div
      className="fixed inset-0 z-[100100] flex items-center justify-center bg-[#112118]/50 px-4 py-8 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={content.title}
    >
      <div className="w-full max-w-[480px] rounded-[28px] border border-white/70 bg-white p-7 shadow-[0_35px_100px_rgba(11,26,18,0.24)]">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-[#eaf6ed] text-[#287b50]">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[22px] font-[800] tracking-[-0.03em] text-[#142019]">{content.title}</h2>
            <p className="mt-1.5 text-[13px] leading-5 text-[#6c776f]">{content.description}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2" aria-label={`Import step ${content.step} of 3`}>
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1.5 rounded-full transition-colors ${step <= content.step ? "bg-[#2d8053]" : "bg-[#e2e8e2]"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-[10px] font-[750] uppercase tracking-[0.1em] text-[#879189]">
          Step {content.step} of 3 · Please do not close this page
        </p>
      </div>
    </div>,
    document.body,
  );
}

function scoreProjectMatch(value: string, projectName: string) {
  const left = normalize(value);
  const right = normalize(projectName);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function findProjectSuggestions(workspace: ProjectTrackerWorkspaceRecord) {
  const projectColumn = workspace.columns.find((column) => column.sourceFieldKey === "project.name");
  if (!projectColumn) return [];
  return workspace.rows.flatMap((row) => {
    if (row.project) return [];
    const value = toSearchText(row.cells[projectColumn.id]?.value ?? null);
    if (!value) return [];
    const candidates = workspace.projectOptions
      .map((project) => ({ project, score: scoreProjectMatch(value, project.name) }))
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.score >= 0.5
      ? [{ row, value, project: candidates[0].project, score: candidates[0].score }]
      : [];
  });
}

function findLatestImportFocus(
  workspace: ProjectTrackerWorkspaceRecord,
): Omit<SpreadsheetFocusRequest, "id"> | null {
  const latestImport = workspace.activities.find(
    (activity) => activity.action === "IMPORT_COMPLETED" && activity.importRowCount,
  );
  if (!latestImport?.importRowCount) return null;
  const importedAt = new Date(latestImport.createdAt).getTime();
  const rowsAvailableAtImport = workspace.rows.filter(
    (row) => new Date(row.createdAt).getTime() <= importedAt,
  );
  const importedRows = rowsAvailableAtImport.slice(-latestImport.importRowCount);
  for (const row of importedRows) {
    const column = workspace.columns.find((candidate) => {
      const value = row.cells[candidate.id]?.value;
      return value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
    });
    if (!column) continue;
    const rowIndex = workspace.rows.findIndex((candidate) => candidate.id === row.id);
    const columnIndex = workspace.columns.findIndex((candidate) => candidate.id === column.id);
    if (rowIndex >= 0 && columnIndex >= 0) return { row: rowIndex + 1, column: columnIndex };
  }
  return null;
}

function emptyCell(): ProjectTrackerCellRecord {
  return {
    id: null,
    value: null,
    sourceValue: null,
    syncState: "custom",
    lastSyncedAt: null,
  };
}

function sourceCell(
  existing: ProjectTrackerCellRecord | undefined,
  sourceValue: TrackerCellValue,
): ProjectTrackerCellRecord {
  const current = existing ?? emptyCell();
  const currentEmpty =
    current.value === null ||
    current.value === "" ||
    (Array.isArray(current.value) && current.value.length === 0);
  const sourceEmpty =
    sourceValue === null ||
    sourceValue === "" ||
    (Array.isArray(sourceValue) && sourceValue.length === 0);
  if (sourceEmpty) {
    return { ...current, sourceValue: null, syncState: "unavailable" };
  }
  if (currentEmpty || JSON.stringify(current.value) === JSON.stringify(sourceValue)) {
    return {
      ...current,
      value: sourceValue,
      sourceValue,
      syncState: "synced",
      lastSyncedAt: new Date().toISOString(),
    };
  }
  return {
    ...current,
    sourceValue,
    syncState:
      current.syncState === "local-override" ? "local-override" : "update-available",
  };
}

function optimisticCellUpdate(
  workspace: ProjectTrackerWorkspaceRecord,
  rowId: string,
  columnId: string,
  value: TrackerCellValue,
): ProjectTrackerWorkspaceRecord {
  const column = workspace.columns.find((item) => item.id === columnId);
  if (!column) return workspace;
  return {
    ...workspace,
    rows: workspace.rows.map((row) => {
      if (row.id !== rowId) return row;
      const current = row.cells[columnId] ?? emptyCell();
      const synced =
        Boolean(column.sourceFieldKey) &&
        JSON.stringify(value) === JSON.stringify(current.sourceValue);
      const syncState: ProjectTrackerCellRecord["syncState"] = column.sourceFieldKey
        ? synced
          ? "synced"
          : "local-override"
        : "custom";
      return {
        ...row,
        updatedAt: new Date().toISOString(),
        cells: {
          ...row.cells,
          [columnId]: {
            ...current,
            value,
            syncState,
          },
        },
      };
    }),
  };
}

function optimisticProjectLink(
  workspace: ProjectTrackerWorkspaceRecord,
  rowId: string,
  project: ProjectTrackerProjectOption,
) {
  return {
    ...workspace,
    rows: workspace.rows.map((row) => {
      if (row.id !== rowId) return row;
      const cells = { ...row.cells };
      for (const column of workspace.columns) {
        if (!column.sourceFieldKey) continue;
        cells[column.id] = sourceCell(
          cells[column.id],
          project.fields[column.sourceFieldKey] ?? null,
        );
      }
      return {
        ...row,
        project,
        cells,
        updatedAt: new Date().toISOString(),
      };
    }),
  };
}

function optimisticColumnUpdate(
  workspace: ProjectTrackerWorkspaceRecord,
  input: {
    columnId: string;
    name?: string;
    type?: ProjectTrackerColumnType;
    sourceFieldKey?: string | null;
    hidden?: boolean;
    frozen?: boolean;
    width?: number;
    move?: -1 | 1;
  },
) {
  const currentIndex = workspace.columns.findIndex((column) => column.id === input.columnId);
  if (currentIndex < 0) return workspace;
  const columns = [...workspace.columns];
  const current = columns[currentIndex];
  const field =
    input.sourceFieldKey === undefined
      ? null
      : workspace.availableFields.find((item) => item.key === input.sourceFieldKey) ?? null;
  columns[currentIndex] = {
    ...current,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.sourceFieldKey !== undefined
      ? {
          sourceFieldKey: field?.key ?? null,
          ...(field ? { type: field.type } : {}),
        }
      : {}),
    ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
    ...(input.frozen !== undefined ? { frozen: input.frozen } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
  };
  if (input.move) {
    const targetIndex = currentIndex + input.move;
    if (targetIndex >= 0 && targetIndex < columns.length) {
      [columns[currentIndex], columns[targetIndex]] = [columns[targetIndex], columns[currentIndex]];
    }
  }
  const orderedColumns = columns.map((column, index) => ({ ...column, sortOrder: index }));
  const updatedColumn = orderedColumns.find((column) => column.id === input.columnId) ?? current;
  const rows = workspace.rows.map((row) => {
    const cell = row.cells[input.columnId] ?? emptyCell();
    if (input.sourceFieldKey === undefined) return row;
    const nextCell = updatedColumn.sourceFieldKey && row.project
      ? sourceCell(cell, row.project.fields[updatedColumn.sourceFieldKey] ?? null)
      : {
          ...cell,
          sourceValue: null,
          syncState: updatedColumn.sourceFieldKey ? "unavailable" as const : "custom" as const,
        };
    return { ...row, cells: { ...row.cells, [input.columnId]: nextCell } };
  });
  return { ...workspace, columns: orderedColumns, rows };
}

function withComputedUpdateCount(workspace: ProjectTrackerWorkspaceRecord) {
  return {
    ...workspace,
    updateCount: workspace.rows.reduce(
      (total, row) =>
        total +
        workspace.columns.filter(
          (column) => row.cells[column.id]?.syncState === "update-available",
        ).length,
      0,
    ),
  };
}

function EmptyState({
  canEdit,
  pending,
  onBlank,
  onImport,
  onLayout,
  onOpenTrash,
}: {
  canEdit: boolean;
  pending: boolean;
  onBlank: () => void;
  onImport: () => void;
  onLayout: () => void;
  onOpenTrash: () => void;
}) {
  return (
    <div className="flex h-full min-h-[560px] items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[920px] text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[linear-gradient(145deg,#e9f7ec,#d9ecdf)] text-[#24764c] shadow-[0_18px_44px_rgba(32,112,70,0.12)]">
          <FileSpreadsheet className="size-7" />
        </span>
        <h1 className="mt-6 text-[32px] font-[850] tracking-[-0.045em] text-[#152019] sm:text-[40px]">Project Tracker</h1>
        <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-6 text-[#6a756d]">Track every department project in one clean, flexible table—connected to live Flux information when you want it.</p>
        {canEdit ? (
          <>
            <TrackerSetupOptions
              pending={pending}
              onBlank={onBlank}
              onImport={onImport}
              onLayout={onLayout}
            />
            <Button type="button" variant="secondary" className="mt-5" onClick={onOpenTrash}>
              <Trash2 className="size-4" /> Open Bin
            </Button>
          </>
        ) : (
          <div className="mx-auto mt-8 max-w-[520px] rounded-[22px] border border-[#e1e7e1] bg-white p-6 text-[13px] leading-6 text-[#667169]">Project Tracker has not been set up yet. A user with project editing permission can create the first layout.</div>
        )}
      </div>
    </div>
  );
}

function TrackerTrashModal({
  items,
  loading,
  restoringId,
  onRestore,
  onClose,
}: {
  items: ProjectTrackerTrashItemRecord[] | null;
  loading: boolean;
  restoringId: string | null;
  onRestore: (item: ProjectTrackerTrashItemRecord) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Project Tracker Bin"
      description="Deleted rows and columns stay here with their saved values. Restore an item whenever you need it again."
      onClose={onClose}
      widthClass="max-w-[720px]"
    >
      {loading ? (
        <div className="flex min-h-44 items-center justify-center gap-2 text-[13px] font-[700] text-[#68746c]">
          <Loader2 className="size-4 animate-spin text-[#2d8053]" /> Loading deleted items...
        </div>
      ) : items?.length ? (
        <div className="space-y-2">
          {items.map((item) => {
            const ItemIcon = item.kind === "column" ? Columns3 : Rows3;
            const restoring = restoringId === item.id;
            return (
              <div key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center gap-3 rounded-[18px] border border-[#e2e8e2] bg-white px-4 py-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#eef5ef] text-[#3f7f5d]">
                  <ItemIcon className="size-4.5" />
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-[800] text-[#2d3830]">{item.name}</p>
                    <span className="rounded-full bg-[#f0f3f0] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] text-[#748078]">{item.kind}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[#7b867e]">{item.detail} · Deleted {formatDate(item.deletedAt, true)}</p>
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={Boolean(restoringId)} onClick={() => onRestore(item)}>
                  {restoring ? <Loader2 className="size-4 animate-spin" /> : <History className="size-4" />}
                  {restoring ? "Restoring..." : "Restore"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-[#dbe4dc] bg-[#f8faf8] px-6 py-12 text-center">
          <Trash2 className="mx-auto size-8 text-[#95a198]" />
          <p className="mt-3 text-[14px] font-[800] text-[#344139]">Bin is empty</p>
          <p className="mt-1 text-[11px] text-[#7c867f]">Deleted tracker rows and columns will appear here.</p>
        </div>
      )}
    </Modal>
  );
}

function TrackerSetupOptions({
  pending,
  existingTracker = false,
  onBlank,
  onImport,
  onLayout,
}: {
  pending: boolean;
  existingTracker?: boolean;
  onBlank: () => void;
  onImport: () => void;
  onLayout: () => void;
}) {
  const options = [
    {
      title: "Start Blank",
      description: existingTracker
        ? "Permanently reset this tracker, including its Bin, to one empty Project column."
        : "Begin with one Project column and add anything you need.",
      icon: Plus,
      action: onBlank,
      primary: !existingTracker,
      destructive: existingTracker,
    },
    {
      title: "Import File",
      description: existingTracker
        ? "Add rows from an XLSX, XLS, CSV, or XML spreadsheet."
        : "Bring in XLSX, XLS, CSV, or XML without a mapping wizard.",
      icon: Upload,
      action: onImport,
      primary: false,
      destructive: false,
    },
    {
      title: "Use Existing Layout",
      description: existingTracker
        ? "Add any missing Owner, Status, Deadline, Client, Vendor, and other standard columns."
        : "Start with common Flux fields and a custom comment column.",
      icon: Columns3,
      action: onLayout,
      primary: false,
      destructive: false,
    },
  ];

  return (
    <div className="mt-9 grid gap-4 md:grid-cols-3">
      {options.map((option) => (
        <button
          type="button"
          key={option.title}
          onClick={option.action}
          disabled={pending}
          className={`group rounded-[24px] border p-6 text-left transition hover:-translate-y-1 disabled:cursor-wait disabled:opacity-60 ${
            option.primary
              ? "border-[#b9d9c3] bg-[#f4fbf5] shadow-[0_18px_42px_rgba(40,116,75,0.09)]"
              : option.destructive
                ? "border-[#efcfcd] bg-[#fff8f7]"
                : "border-[#e0e6e0] bg-white shadow-[0_14px_36px_rgba(23,39,28,0.045)]"
          }`}
        >
          <span className={`grid size-11 place-items-center rounded-[14px] bg-white shadow-[0_8px_24px_rgba(27,79,50,0.08)] ${option.destructive ? "text-[#c94843]" : "text-[#2a8053]"}`}>
            <option.icon className="size-5" />
          </span>
          <span className="mt-5 block text-[17px] font-[800] text-[#1e2922]">{option.title}</span>
          <span className="mt-2 block text-[12px] leading-5 text-[#727c75]">{option.description}</span>
        </button>
      ))}
    </div>
  );
}

export function ProjectTrackerWorkspace({ initialWorkspace }: ProjectTrackerWorkspaceProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [pending, startTransition] = useTransition();
  const [savingCount, setSavingCount] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [columnEditor, setColumnEditor] = useState<ProjectTrackerColumnRecord | "new" | null>(null);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<ProjectTrackerTrashItemRecord[] | null>(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringTrashId, setRestoringTrashId] = useState<string | null>(null);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [detailsRowId, setDetailsRowId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [resetBlankOpen, setResetBlankOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [activeSpreadsheetRowId, setActiveSpreadsheetRowId] = useState<string | null>(null);
  const [spreadsheetRevision, setSpreadsheetRevision] = useState(0);
  const [workbookSaving, setWorkbookSaving] = useState(false);
  const [exportRequest, setExportRequest] = useState<SpreadsheetExportRequest | null>(null);
  const [spreadsheetFocus, setSpreadsheetFocus] = useState<SpreadsheetFocusRequest | null>(null);
  const [lastImportFocus, setLastImportFocus] = useState<Omit<SpreadsheetFocusRequest, "id"> | null>(
    () => findLatestImportFocus(initialWorkspace),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!initialWorkspace.canEdit || !initialWorkspace.isInitialized) return;
    const storageKey = `project-tracker:setup-seen:${initialWorkspace.id}:spreadsheet-v2`;
    try {
      if (window.localStorage.getItem(storageKey)) return;
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // If storage is unavailable, keep the setup accessible through Layouts
      // without forcing it open again on every navigation.
      return;
    }
    const frame = window.requestAnimationFrame(() => setSetupOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [initialWorkspace.canEdit, initialWorkspace.id, initialWorkspace.isInitialized]);

  function applyResult(result: ActionResult) {
    if ("error" in result) {
      showErrorToast("Project Tracker", result.error);
      return false;
    }
    if ("workspace" in result) {
      setWorkspace(result.workspace);
      setSelectedRows((current) => new Set([...current].filter((id) => result.workspace.rows.some((row) => row.id === id))));
    }
    if (result.message) showSuccessToast(result.message);
    return true;
  }

  function runAction(action: () => Promise<ActionResult>, after?: (workspace: ProjectTrackerWorkspaceRecord) => void) {
    startTransition(async () => {
      const result = await action();
      const applied = applyResult(result);
      if (applied && "workspace" in result) after?.(result.workspace);
    });
  }

  async function openTrash() {
    setTrashOpen(true);
    if (trashItems !== null) return;
    setTrashLoading(true);
    try {
      const result = await getProjectTrackerTrashAction();
      if ("error" in result) {
        showErrorToast("Project Tracker Bin", result.error);
        return;
      }
      setTrashItems(result.items);
    } catch (error) {
      showErrorToast(
        "Project Tracker Bin",
        error instanceof Error ? error.message : "Deleted items could not be loaded.",
      );
    } finally {
      setTrashLoading(false);
    }
  }

  async function restoreTrashItem(item: ProjectTrackerTrashItemRecord) {
    setRestoringTrashId(item.id);
    try {
      const result = await restoreProjectTrackerItemAction({ id: item.id, kind: item.kind });
      if (!applyResult(result)) return;
      setSpreadsheetRevision((revision) => revision + 1);
      setTrashItems((current) => current?.filter(
        (candidate) => candidate.id !== item.id || candidate.kind !== item.kind,
      ) ?? []);
    } catch (error) {
      showErrorToast(
        "Project Tracker",
        error instanceof Error ? error.message : "The item could not be restored.",
      );
    } finally {
      setRestoringTrashId(null);
    }
  }

  function runFastAction(
    action: () => Promise<ActionResult>,
    optimisticUpdate: (current: ProjectTrackerWorkspaceRecord) => ProjectTrackerWorkspaceRecord,
  ) {
    setWorkspace((current) => withComputedUpdateCount(optimisticUpdate(current)));
    setSavingCount((count) => count + 1);
    mutationQueueRef.current = mutationQueueRef.current
      .then(async () => {
        const result = await action();
        if ("error" in result) {
          showErrorToast(
            "Project Tracker could not save this change",
            `${result.error} Refresh the page to restore the saved version.`,
          );
          return;
        }
        if (result.message) showSuccessToast(result.message);
      })
      .catch((error: unknown) => {
        showErrorToast(
          "Project Tracker could not save this change",
          error instanceof Error ? error.message : "Refresh the page to restore the saved version.",
        );
      })
      .finally(() => setSavingCount((count) => Math.max(0, count - 1)));
  }

  const conflictUpdates = useMemo(() => {
    if (!updatesOpen) return [];
    return workspace.rows.flatMap((row) => workspace.columns.flatMap((column) => {
      const cell = row.cells[column.id];
      return cell?.syncState === "update-available" ? [{ row, column, cell }] : [];
    }));
  }, [updatesOpen, workspace.columns, workspace.rows]);

  const localOverrides = useMemo(() => {
    if (!updatesOpen) return [];
    return workspace.rows.flatMap((row) => workspace.columns.flatMap((column) => {
      const cell = row.cells[column.id];
      return cell?.syncState === "local-override" ? [{ row, column, cell }] : [];
    }));
  }, [updatesOpen, workspace.columns, workspace.rows]);

  const trackerActivities = workspace.activities;
  const versionHistoryDays = useMemo(() => {
    const days = new Map<string, typeof trackerActivities>();
    for (const activity of trackerActivities) {
      const key = trackerHistoryDayKey(activity.createdAt);
      days.set(key, [...(days.get(key) ?? []), activity]);
    }
    return [...days.entries()].map(([key, activities]) => ({
      key,
      label: formatTrackerHistoryDay(activities[0]?.createdAt ?? key),
      activities,
    }));
  }, [trackerActivities]);

  const projectSuggestions = useMemo(() => {
    if (!matchesOpen) return [];
    return findProjectSuggestions(workspace);
  }, [matchesOpen, workspace]);

  function saveCellFast(rowId: string, columnId: string, value: TrackerCellValue) {
    runFastAction(
      () => saveProjectTrackerCellAction({ rowId, columnId, value }),
      (current) => optimisticCellUpdate(current, rowId, columnId, value),
    );
  }

  function saveCellsFast(changes: TrackerCellChange[]) {
    if (!changes.length) return;
    runFastAction(
      async () => {
        for (let index = 0; index < changes.length; index += 400) {
          const result = await saveProjectTrackerCellsAction({ changes: changes.slice(index, index + 400) });
          if ("error" in result) return result;
        }
        return { ok: true };
      },
      (current) => changes.reduce(
        (next, change) => optimisticCellUpdate(next, change.rowId, change.columnId, change.value),
        current,
      ),
    );
  }

  function linkProjectFast(rowId: string, project: ProjectTrackerProjectOption) {
    runFastAction(
      () => linkProjectTrackerRowAction({ rowId, kind: project.kind, projectId: project.id }),
      (current) => optimisticProjectLink(current, rowId, project),
    );
    setSpreadsheetRevision((revision) => revision + 1);
  }

  function updateColumnFast(input: Parameters<typeof updateProjectTrackerColumnAction>[0]) {
    runFastAction(
      () => updateProjectTrackerColumnAction(input),
      (current) => optimisticColumnUpdate(current, input),
    );
  }

  function addRowFast(insertIndex = workspace.rows.length) {
    const id = crypto.randomUUID();
    const beforeRowId = workspace.rows[insertIndex]?.id;
    runFastAction(
      () => addProjectTrackerRowAction({ id, beforeRowId }),
      (current) => ({
        ...current,
        rows: (() => {
          const rows = [...current.rows];
          rows.splice(Math.min(insertIndex, rows.length), 0, {
            id,
            sortOrder: insertIndex,
            project: null,
            cells: Object.fromEntries(current.columns.map((column) => [column.id, emptyCell()])),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return rows.map((row, index) => ({ ...row, sortOrder: index }));
        })(),
      }),
    );
  }

  function addColumnFast(input: {
    name: string;
    type: ProjectTrackerColumnType;
    sourceFieldKey?: string | null;
  }, insertIndex = workspace.columns.length) {
    const id = crypto.randomUUID();
    const beforeColumnId = workspace.columns[insertIndex]?.id;
    runFastAction(
      () => addProjectTrackerColumnAction({ id, ...input, beforeColumnId }),
      (current) => {
        const field = current.availableFields.find((item) => item.key === input.sourceFieldKey);
        const column: ProjectTrackerColumnRecord = {
          id,
          name: input.name,
          type: field?.type ?? input.type,
          sourceFieldKey: field?.key ?? null,
          options: [],
          sortOrder: insertIndex,
          width: field?.type === "LONG_TEXT" ? 260 : 180,
          hidden: false,
          frozen: false,
        };
        return {
          ...current,
          columns: (() => {
            const columns = [...current.columns];
            columns.splice(Math.min(insertIndex, columns.length), 0, column);
            return columns.map((item, index) => ({ ...item, sortOrder: index }));
          })(),
          rows: current.rows.map((row) => ({
            ...row,
            cells: {
              ...row.cells,
              [id]: column.sourceFieldKey && row.project
                ? sourceCell(undefined, row.project.fields[column.sourceFieldKey] ?? null)
                : emptyCell(),
            },
          })),
        };
      },
    );
    setColumnEditor(null);
  }

  function sortTrackerRows(sortedRowIds: string[]) {
    const selectedIds = new Set(sortedRowIds);
    const selectedPositions = workspace.rows.flatMap((row, index) => selectedIds.has(row.id) ? [index] : []);
    if (!selectedPositions.length) return;
    const nextRows = [...workspace.rows];
    selectedPositions.forEach((position, index) => {
      const row = workspace.rows.find((candidate) => candidate.id === sortedRowIds[index]);
      if (row) nextRows[position] = row;
    });
    const orderedIds = nextRows.map((row) => row.id);
    runFastAction(
      () => reorderProjectTrackerRowsAction(orderedIds),
      (current) => ({
        ...current,
        rows: orderedIds.flatMap((id, index) => {
          const row = current.rows.find((candidate) => candidate.id === id);
          return row ? [{ ...row, sortOrder: index }] : [];
        }),
      }),
    );
  }

  function deleteColumnFast(columnId: string) {
    setTrashItems(null);
    runFastAction(
      () => deleteProjectTrackerColumnAction(columnId),
      (current) => ({
        ...current,
        columns: current.columns
          .filter((column) => column.id !== columnId)
          .map((column, index) => ({ ...column, sortOrder: index })),
        rows: current.rows.map((row) => {
          const cells = { ...row.cells };
          delete cells[columnId];
          return { ...row, cells };
        }),
      }),
    );
  }

  function deleteRowsFast(rowIds: string[]) {
    const ids = new Set(rowIds);
    setTrashItems(null);
    runFastAction(
      () => deleteProjectTrackerRowsAction(rowIds),
      (current) => ({
        ...current,
        rows: current.rows
          .filter((row) => !ids.has(row.id))
          .map((row, index) => ({ ...row, sortOrder: index })),
      }),
    );
    setSelectedRows((current) => new Set([...current].filter((id) => !ids.has(id))));
  }

  function confirmDelete() {
    if (!deleteConfirmation) return;

    if (deleteConfirmation.kind === "rows") {
      deleteRowsFast(deleteConfirmation.rowIds);
    } else {
      deleteColumnFast(deleteConfirmation.columnId);
    }
    setDeleteConfirmation(null);
  }

  function unlinkProjectFast(rowId: string) {
    runFastAction(
      () => unlinkProjectTrackerRowAction(rowId),
      (current) => ({
        ...current,
        rows: current.rows.map((row) => {
          if (row.id !== rowId) return row;
          return {
            ...row,
            project: null,
            cells: Object.fromEntries(
              Object.entries(row.cells).map(([columnId, cell]) => {
                const column = current.columns.find((item) => item.id === columnId);
                return [
                  columnId,
                  column?.sourceFieldKey
                    ? { ...cell, sourceValue: null, syncState: "unavailable" as const }
                    : cell,
                ];
              }),
            ),
          };
        }),
      }),
    );
    setSpreadsheetRevision((revision) => revision + 1);
  }

  function resolveCellFast(
    row: ProjectTrackerRowRecord,
    column: ProjectTrackerColumnRecord,
    resolution: "use-source" | "keep-local",
  ) {
    runFastAction(
      () => resolveProjectTrackerCellAction({ rowId: row.id, columnId: column.id, resolution }),
      (current) => ({
        ...current,
        rows: current.rows.map((item) => {
          if (item.id !== row.id) return item;
          const cell = item.cells[column.id] ?? emptyCell();
          return {
            ...item,
            cells: {
              ...item.cells,
              [column.id]: resolution === "use-source"
                ? {
                    ...cell,
                    value: cell.sourceValue,
                    syncState: "synced" as const,
                    lastSyncedAt: new Date().toISOString(),
                  }
                : { ...cell, syncState: "local-override" as const },
            },
          };
        }),
      }),
    );
    setSpreadsheetRevision((revision) => revision + 1);
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const existingDataRowCount = workspace.rows.filter(
      (row) =>
        Boolean(row.project) ||
        Object.values(row.cells).some((cell) => {
          const value = cell.value;
          return value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
        }),
    ).length;
    const firstImportedSpreadsheetRow = existingDataRowCount + 1;
    setImportProgress({ stage: "reading", fileName: file.name });
    await waitForNextPaint();
    try {
      const { columns, rows, workbook: importedWorkbook, warnings } = await parseSpreadsheetFile(file);
      setImportProgress({
        stage: "importing",
        fileName: file.name,
        rowCount: rows.length,
      });
      const result = await importProjectTrackerAction({ columns, rows, fileName: file.name });
      if ("error" in result) {
        applyResult(result);
        return;
      }
      if (!("workspace" in result)) throw new Error("The imported tracker could not be reloaded.");

      const baseWorkbook = buildProjectTrackerWorkbook(
        result.workspace,
        result.workspace.spreadsheetState,
      );
      const mergedWorkbook = mergeImportedWorkbook(
        baseWorkbook,
        importedWorkbook,
        existingDataRowCount,
        result.workspace.columns.map((column) => column.name),
      );
      const workbookSave = await saveProjectTrackerWorkbookAction({ workbook: mergedWorkbook });
      if ("error" in workbookSave) {
        showErrorToast("Imported formatting could not be saved", workbookSave.error);
      } else {
        result.workspace.spreadsheetState = mergedWorkbook;
      }
      if (warnings.length) {
        showErrorToast("Some Excel features were not imported", warnings.slice(0, 3).join(" "));
      }

      setImportProgress({
        stage: "rendering",
        fileName: file.name,
        rowCount: rows.length,
      });
      await waitForNextPaint();
      if (applyResult(result) && "workspace" in result) {
        let sourceRowIndex = 0;
        let sourceColumnIndex = 0;
        let foundValue = false;
        for (const [rowIndex, row] of rows.entries()) {
          const columnIndex = row.findIndex((value) =>
            value !== null && value !== "" && (!Array.isArray(value) || value.length > 0),
          );
          if (columnIndex >= 0) {
            sourceRowIndex = rowIndex;
            sourceColumnIndex = columnIndex;
            foundValue = true;
            break;
          }
        }
        const importedColumnName = columns[sourceColumnIndex]?.name;
        const targetColumn = result.workspace.columns.findIndex((column) =>
          normalize(column.name) === normalize(importedColumnName ?? ""),
        );
        const focus = {
          row: firstImportedSpreadsheetRow + (foundValue ? sourceRowIndex : 0),
          column: Math.max(0, targetColumn),
        };
        setLastImportFocus(focus);
        setSpreadsheetFocus({ id: Date.now(), ...focus });
        setSpreadsheetRevision((revision) => revision + 1);
        await waitForNextPaint();
        if (rows.length <= 200 && findProjectSuggestions(result.workspace).length > 0) {
          window.setTimeout(() => setMatchesOpen(true), 80);
        }
      }
    } catch (error) {
      showErrorToast("Import failed", error instanceof Error ? error.message : "The file could not be read.");
    } finally {
      setImportProgress(null);
    }
  }

  async function exportFile(format: "xlsx" | "csv") {
    setExportRequest({ id: Date.now(), format });
  }

  if (!workspace.isInitialized) {
    return (
      <>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/xml,application/xml" className="hidden" onChange={handleImport} />
        <EmptyState
          canEdit={workspace.canEdit}
          pending={pending || Boolean(importProgress)}
          onBlank={() => runAction(() => initializeProjectTrackerAction("blank"))}
          onImport={() => fileInputRef.current?.click()}
          onLayout={() => runAction(() => initializeProjectTrackerAction("layout"))}
          onOpenTrash={() => void openTrash()}
        />
        {trashOpen ? (
          <TrackerTrashModal
            items={trashItems}
            loading={trashLoading}
            restoringId={restoringTrashId}
            onRestore={(item) => void restoreTrashItem(item)}
            onClose={() => setTrashOpen(false)}
          />
        ) : null}
        <ImportProgressDialog progress={importProgress} />
      </>
    );
  }

  const detailsRow = detailsRowId ? workspace.rows.find((row) => row.id === detailsRowId) ?? null : null;

  return (
    <div className="flex h-full min-h-[620px] min-w-0 flex-col overflow-hidden rounded-[22px] border border-[#e0e7e0] bg-white shadow-[0_16px_44px_rgba(23,39,28,0.04)]">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/xml,application/xml" className="hidden" onChange={handleImport} />

      <header className="border-b border-[#e4e9e4] bg-[linear-gradient(180deg,#ffffff,#fbfcfb)] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-[#eaf6ed] text-[#287b50]"><FileSpreadsheet className="size-5" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-[850] tracking-[-0.035em] text-[#142019]">{workspace.name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-[650] text-[#7b867e]">
                {Math.max(PROJECT_TRACKER_SHEET_ROWS, workspace.rows.length + 1)} sheet rows · {Math.max(PROJECT_TRACKER_SHEET_COLUMNS, workspace.columns.length)} sheet columns ·
                {savingCount > 0 || workbookSaving ? (
                  <span className="inline-flex items-center gap-1 text-[#47735a]"><Loader2 className="size-3 animate-spin" /> Saving</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[#498063]"><Check className="size-3" /> Saved</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}><History className="size-4" /> Version history</Button>
            {workspace.canEdit ? <Button type="button" variant="secondary" size="sm" disabled={savingCount > 0} onClick={() => void openTrash()}><Trash2 className="size-4" /> Bin</Button> : null}
            <Button
              type="button"
              variant={workspace.updateCount ? "outline" : "ghost"}
              size="sm"
              title="Shows whether linked Flux project fields match this tracker"
              aria-label={workspace.updateCount ? `Review ${workspace.updateCount} linked project updates` : "Linked project data is synced"}
              onClick={() => setUpdatesOpen(true)}
              className={workspace.updateCount ? "border-[#e7ba7d] bg-[#fff8ec] text-[#a96114]" : "text-[#47735a]"}
            >
              {workspace.updateCount ? <CloudAlert className="size-4" /> : <CloudCheck className="size-4" />}
              {workspace.updateCount
                ? `Review ${workspace.updateCount} project ${workspace.updateCount === 1 ? "update" : "updates"}`
                : "Project data synced"}
            </Button>
            {workspace.canEdit ? <Button type="button" size="sm" onClick={() => setColumnEditor("new")}><Plus className="size-4" /> Add Column</Button> : null}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#e4e9e4] bg-white px-3 py-3 sm:px-4">
        {workspace.canEdit ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => addRowFast()}>
            <Plus className="size-4" /> Row
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="sm"><Eye className="size-4" /> Columns <ChevronDown className="size-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[360px] overflow-y-auto">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {workspace.columns.map((column) => (
              <DropdownMenuCheckboxItem key={column.id} checked={!column.hidden} onCheckedChange={(checked) => updateColumnFast({ columnId: column.id, hidden: !checked })}>
                {column.name}
              </DropdownMenuCheckboxItem>
            ))}
            {workspace.canEdit ? <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Column settings</DropdownMenuLabel>
              {workspace.columns.map((column) => (
                <DropdownMenuItem key={`settings:${column.id}`} onSelect={() => setColumnEditor(column)}>
                  <Columns3 className="size-4" /> Edit {column.name}
                </DropdownMenuItem>
              ))}
            </> : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {workspace.canEdit ? <Button type="button" variant="secondary" size="sm" onClick={() => setSetupOpen(true)}><Columns3 className="size-4" /> Layouts</Button> : null}
        {workspace.canEdit ? <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><Download className="size-4" /> Import</Button> : null}
        {lastImportFocus ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSpreadsheetFocus({ id: Date.now(), ...lastImportFocus })}
          >
            <Eye className="size-4" /> View last import
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="sm"><Upload className="size-4" /> Export</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exportFile("xlsx")}><FileSpreadsheet className="size-4" /> Excel workbook (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportFile("csv")}><FileDown className="size-4" /> CSV file</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {activeSpreadsheetRowId && workspace.canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" size="sm"><Link2 className="size-4" /> Link project</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[360px] w-[300px] overflow-y-auto">
              <DropdownMenuLabel>Connect selected row</DropdownMenuLabel>
              {workspace.rows.find((row) => row.id === activeSpreadsheetRowId)?.project ? (
                <>
                  <DropdownMenuItem onSelect={() => setDetailsRowId(activeSpreadsheetRowId)}><PanelRightOpen className="size-4" /> Row details</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => unlinkProjectFast(activeSpreadsheetRowId)}><Link2Off className="size-4" /> Disconnect current project</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              {workspace.projectOptions.map((project) => (
                <DropdownMenuItem key={`${project.kind}:${project.id}`} onSelect={() => linkProjectFast(activeSpreadsheetRowId, project)}>
                  <Link2 className="size-4" />
                  <span className="min-w-0"><span className="block truncate">{project.name}</span><span className="block truncate text-[9px] text-[#89938c]">{project.subtitle}</span></span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {selectedRows.size && workspace.canEdit ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => {
            const count = selectedRows.size;
            setDeleteConfirmation({
              kind: "rows",
              rowIds: [...selectedRows],
              title: `Delete ${count} selected ${count === 1 ? "row" : "rows"}?`,
              description: `This moves the selected ${count === 1 ? "row" : "rows"} and their saved tracker values to Bin. You can restore them later. Any linked Flux projects and their data will remain unchanged.`,
              confirmLabel: `Delete ${count} ${count === 1 ? "row" : "rows"}`,
            });
          }}><Trash2 className="size-4" /> Delete {selectedRows.size}</Button>
        ) : null}
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-white">
        <ProjectTrackerSpreadsheetClient
          workspace={workspace}
          revision={spreadsheetRevision}
          exportRequest={exportRequest}
          focusRequest={spreadsheetFocus}
          onActiveRowChange={setActiveSpreadsheetRowId}
          onSelectedRowsChange={(rowIds) => setSelectedRows(new Set(rowIds))}
          onSaveCell={saveCellFast}
          onSaveCells={saveCellsFast}
          onWorkbookSavingChange={setWorkbookSaving}
          onInsertTrackerRow={(sheetRow, side) => {
            const dataIndex = Math.max(0, sheetRow - 1);
            addRowFast(dataIndex + (side === "below" ? 1 : 0));
          }}
          onDeleteTrackerRows={(sheetRows) => {
            const rowIds = sheetRows.flatMap((sheetRow) => workspace.rows[sheetRow - 1]?.id ? [workspace.rows[sheetRow - 1].id] : []);
            if (!rowIds.length) return;
            setDeleteConfirmation({
              kind: "rows",
              rowIds,
              title: `Delete ${rowIds.length} selected ${rowIds.length === 1 ? "row" : "rows"}?`,
              description: "This moves the selected tracker data to Bin. Linked Flux projects remain unchanged.",
              confirmLabel: `Delete ${rowIds.length} ${rowIds.length === 1 ? "row" : "rows"}`,
            });
          }}
          onInsertTrackerColumn={(sheetColumn, side) => {
            const insertIndex = sheetColumn + (side === "right" ? 1 : 0);
            let suffix = workspace.columns.length + 1;
            const names = new Set(workspace.columns.map((column) => normalize(column.name)));
            while (names.has(normalize(`Column ${suffix}`))) suffix += 1;
            addColumnFast({ name: `Column ${suffix}`, type: "TEXT" }, insertIndex);
          }}
          onDeleteTrackerColumns={(sheetColumns) => {
            const columns = sheetColumns.flatMap((index) => workspace.columns[index] ? [workspace.columns[index]] : []);
            if (columns.length !== 1) {
              showErrorToast("Project Tracker", "Delete tracker columns one at a time so each item remains recoverable from Bin.");
              return;
            }
            const column = columns[0];
            setDeleteConfirmation({
              kind: "column",
              columnId: column.id,
              title: `Delete “${column.name}”?`,
              description: "This moves the column and its saved tracker values to Bin. Connected Flux data remains unchanged.",
              confirmLabel: "Delete column",
            });
          }}
          onSortTrackerRows={sortTrackerRows}
        />
      </div>

      {columnEditor ? (
        <ColumnEditorModal
          workspace={workspace}
          column={columnEditor === "new" ? null : columnEditor}
          pending={pending}
          onClose={() => setColumnEditor(null)}
          onDelete={columnEditor === "new" ? undefined : () => {
            const column = columnEditor;
            setColumnEditor(null);
            setDeleteConfirmation({
              kind: "column",
              columnId: column.id,
              title: `Delete “${column.name}”?`,
              description: "This moves the column and its saved tracker values to Bin. You can restore it later. Connected Flux project data will remain unchanged.",
              confirmLabel: "Delete column",
            });
          }}
          onSave={(input) => {
            if (columnEditor === "new") {
              addColumnFast(input);
            } else {
              updateColumnFast({ columnId: columnEditor.id, ...input });
              setColumnEditor(null);
            }
          }}
        />
      ) : null}

      {setupOpen ? (
        <Modal
          title="Tracker setup"
          description="These options stay available after setup. Import and layouts preserve your current tracker; Start Blank resets it."
          onClose={() => setSetupOpen(false)}
          widthClass="max-w-[920px]"
        >
          <TrackerSetupOptions
            existingTracker
            pending={pending || Boolean(importProgress)}
            onBlank={() => {
              setSetupOpen(false);
              setResetBlankOpen(true);
            }}
            onImport={() => {
              setSetupOpen(false);
              fileInputRef.current?.click();
            }}
            onLayout={() => runAction(
              () => applyProjectTrackerLayoutAction(),
              () => setSetupOpen(false),
            )}
          />
          <div className="mt-6 flex flex-col gap-3 rounded-[18px] border border-[#e2e8e2] bg-[#f8faf8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-[800] text-[#344139]">Your current tracker is still available</p>
              <p className="mt-1 text-[11px] text-[#78837b]">Continue without changing its rows, columns, or linked projects.</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setSetupOpen(false)}>
              Continue current tracker
            </Button>
          </div>
        </Modal>
      ) : null}

      {updatesOpen ? (
        <Modal title="Linked project sync" description="Review differences between tracker cells and their linked Flux project fields. Nothing changes until you choose." onClose={() => setUpdatesOpen(false)} widthClass="max-w-[720px]">
          <div className="space-y-4">
            {!conflictUpdates.length && !localOverrides.length ? <div className="rounded-[20px] border border-[#dce9df] bg-[#f4faf5] p-6 text-center"><CloudCheck className="mx-auto size-7 text-[#33865a]" /><p className="mt-2 text-[14px] font-[800] text-[#284334]">Project data is synced</p><p className="mt-1 text-[12px] text-[#718078]">Linked tracker fields match the Flux projects you can view.</p></div> : null}
            {conflictUpdates.map(({ row, column, cell }) => (
              <div key={`${row.id}:${column.id}`} className="rounded-[20px] border border-[#ecd7b8] bg-[#fffaf2] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[13px] font-[800] text-[#28322b]">{row.project?.name ?? "Tracker row"}</p><p className="mt-0.5 text-[11px] font-[700] text-[#a5651c]">{column.name} changed</p></div><span className="rounded-full bg-[#fff0d9] px-2.5 py-1 text-[9px] font-[800] uppercase tracking-[0.1em] text-[#a86117]">Review</span></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_24px_1fr]"><div className="rounded-[14px] border border-[#e5dfd5] bg-white p-3"><span className="text-[9px] font-[800] uppercase tracking-[0.11em] text-[#8a8176]">Tracker</span><p className="mt-1 text-[13px] font-[750] text-[#343830]">{formatCellValue(cell.value, column.type) || "Empty"}</p></div><ArrowRight className="mx-auto self-center size-4 text-[#a9a094]" /><div className="rounded-[14px] border border-[#cfe3d4] bg-[#f6fbf7] p-3"><span className="text-[9px] font-[800] uppercase tracking-[0.11em] text-[#5d846b]">Flux</span><p className="mt-1 text-[13px] font-[750] text-[#264b35]">{formatCellValue(cell.sourceValue, column.type) || "Empty"}</p></div></div>
                {workspace.canEdit ? <div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => resolveCellFast(row, column, "keep-local")}>Keep tracker value</Button><Button type="button" size="sm" onClick={() => resolveCellFast(row, column, "use-source")}>Use Flux value</Button></div> : null}
              </div>
            ))}
            {localOverrides.length ? <div className="pt-2"><h3 className="text-[11px] font-[850] uppercase tracking-[0.12em] text-[#78847c]">Local overrides</h3><div className="mt-2 space-y-2">{localOverrides.map(({ row, column, cell }) => <div key={`${row.id}:${column.id}`} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[#e2e6e2] bg-[#fafbfa] px-4 py-3"><Link2Off className="size-4 text-[#78827b]" /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-[750] text-[#333e36]">{row.project?.name ?? "Tracker row"} · {column.name}</p><p className="mt-0.5 truncate text-[10px] text-[#7a847d]">Tracker: {formatCellValue(cell.value, column.type)} · Flux: {formatCellValue(cell.sourceValue, column.type)}</p></div>{workspace.canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => resolveCellFast(row, column, "use-source")}>Use Flux value</Button> : null}</div>)}</div></div> : null}
          </div>
        </Modal>
      ) : null}

      {historyOpen ? (
        <Modal title="Version history" description="Important tracker changes grouped by day." onClose={() => setHistoryOpen(false)} widthClass="max-w-[720px]">
          <div className="space-y-6">
            {versionHistoryDays.map((day) => (
              <section key={day.key}>
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-[#e3e8e3] pb-2">
                  <h3 className="text-[12px] font-[850] text-[#26342b]">{day.label}</h3>
                  <span className="text-[9px] font-[800] uppercase tracking-[0.1em] text-[#879188]">
                    {day.activities.length} {day.activities.length === 1 ? "change" : "changes"}
                  </span>
                </div>
                <div className="space-y-2">
                  {day.activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3 rounded-[16px] border border-[#e4e9e4] px-4 py-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#eef5ef] text-[#488064]"><Clock3 className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-[750] text-[#303b33]">{activity.summary}</p>
                        <p className="mt-1 text-[10px] text-[#7d8780]">{formatTrackerHistoryTime(activity.createdAt)} · {activity.actorName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {!versionHistoryDays.length ? <p className="py-8 text-center text-[12px] text-[#7c867f]">No version history yet.</p> : null}
          </div>
        </Modal>
      ) : null}

      {trashOpen ? (
        <TrackerTrashModal
          items={trashItems}
          loading={trashLoading}
          restoringId={restoringTrashId}
          onRestore={(item) => void restoreTrashItem(item)}
          onClose={() => setTrashOpen(false)}
        />
      ) : null}

      {matchesOpen ? (
        <Modal title="Possible Flux projects" description={`We found ${projectSuggestions.length} possible ${projectSuggestions.length === 1 ? "match" : "matches"}. Nothing is connected until you choose it.`} onClose={() => setMatchesOpen(false)} widthClass="max-w-[760px]">
          <div className="space-y-3">
            {projectSuggestions.length ? projectSuggestions.map((suggestion) => <div key={suggestion.row.id} className="grid gap-3 rounded-[18px] border border-[#e1e7e1] p-4 sm:grid-cols-[1fr_28px_1fr_auto] sm:items-center"><div className="min-w-0"><span className="text-[9px] font-[800] uppercase tracking-[0.11em] text-[#8a948d]">Imported row</span><p className="mt-1 truncate text-[13px] font-[750] text-[#343e37]">{suggestion.value}</p></div><ArrowRight className="mx-auto size-4 text-[#9aa49d]" /><div className="min-w-0"><span className="text-[9px] font-[800] uppercase tracking-[0.11em] text-[#4d8765]">Flux project</span><p className="mt-1 truncate text-[13px] font-[750] text-[#246f49]">{suggestion.project.name}</p></div><Button type="button" size="sm" onClick={() => linkProjectFast(suggestion.row.id, suggestion.project)}>Connect</Button></div>) : <div className="rounded-[20px] border border-[#e2e8e2] bg-[#f8faf8] p-7 text-center"><Search className="mx-auto size-7 text-[#91a097]" /><p className="mt-2 text-[13px] font-[750] text-[#3a463e]">No unlinked matches to review</p><p className="mt-1 text-[11px] text-[#7a857d]">You can still choose a project from any Project cell.</p></div>}
            {projectSuggestions.some((suggestion) => suggestion.score >= 0.9) ? <div className="flex justify-end pt-2"><Button type="button" onClick={() => {
              for (const suggestion of projectSuggestions.filter((item) => item.score >= 0.9)) {
                linkProjectFast(suggestion.row.id, suggestion.project);
              }
            }}><Sparkles className="size-4" /> Connect confident matches</Button></div> : null}
          </div>
        </Modal>
      ) : null}

      {detailsRow ? (
        <Modal title="Row details" description="Connection, sync information, and recent history for this tracker row." onClose={() => setDetailsRowId(null)}>
          <div className="space-y-5">
            <div className="rounded-[20px] border border-[#dfe6df] bg-[#f8faf8] p-5">
              <span className="text-[9px] font-[850] uppercase tracking-[0.12em] text-[#7d8880]">Connected project</span>
              {detailsRow.project ? <div className="mt-3 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-[#e7f4ea] text-[#2d7d52]"><Link2 className="size-5" /></span><div className="min-w-0 flex-1"><Link href={detailsRow.project.href} className="truncate text-[14px] font-[800] text-[#1f7048] hover:underline">{detailsRow.project.name}</Link><p className="mt-0.5 text-[10px] text-[#7b867e]">{detailsRow.project.subtitle}</p></div></div> : <p className="mt-2 text-[12px] text-[#768179]">This row is independent from Flux.</p>}
            </div>
            <div><h3 className="text-[10px] font-[850] uppercase tracking-[0.12em] text-[#7c877f]">Field status</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{workspace.columns.filter((column) => column.sourceFieldKey).map((column) => { const cell = detailsRow.cells[column.id]; return <div key={column.id} className="flex items-center gap-2 rounded-[14px] border border-[#e4e9e4] px-3 py-2.5"><SyncIndicator cell={cell} /><span className="min-w-0 flex-1 truncate text-[11px] font-[700] text-[#4b574f]">{column.name}</span><span className="text-[9px] font-[750] uppercase text-[#89938c]">{cell.syncState.replace("-", " ")}</span></div>; })}</div></div>
            <div><h3 className="text-[10px] font-[850] uppercase tracking-[0.12em] text-[#7c877f]">Recent changes</h3><div className="mt-2 space-y-2">{workspace.activities.filter((activity) => activity.rowId === detailsRow.id).slice(0, 8).map((activity) => <div key={activity.id} className="rounded-[14px] border border-[#e5eae5] px-3 py-2.5"><p className="text-[11px] font-[700] text-[#4b574f]">{activity.summary}</p><p className="mt-0.5 text-[9px] text-[#89938c]">{formatDate(activity.createdAt, true)}</p></div>)}{!workspace.activities.some((activity) => activity.rowId === detailsRow.id) ? <p className="rounded-[14px] bg-[#f7f9f7] px-3 py-5 text-center text-[11px] text-[#879189]">No row-specific history yet.</p> : null}</div></div>
          </div>
        </Modal>
      ) : null}

      <ConfirmationDialog
        isOpen={Boolean(deleteConfirmation)}
        title={deleteConfirmation?.title ?? "Confirm deletion"}
        description={deleteConfirmation?.description ?? "This action cannot be undone."}
        confirmLabel={deleteConfirmation?.confirmLabel ?? "Delete"}
        pendingLabel="Deleting..."
        tone="destructive"
        onConfirm={confirmDelete}
        onClose={() => setDeleteConfirmation(null)}
      />

      <ConfirmationDialog
        isOpen={resetBlankOpen}
        title="Start over with a blank tracker?"
        description="This permanently removes every tracker row, column, local value, and item currently in Bin, then creates one empty Project column. Linked Flux projects are not deleted."
        confirmLabel="Reset to blank"
        pendingLabel="Resetting..."
        tone="destructive"
        pending={pending}
        onConfirm={() => runAction(
          () => resetProjectTrackerToBlankAction(),
          () => {
            setResetBlankOpen(false);
            setSelectedRows(new Set());
          },
        )}
        onClose={() => setResetBlankOpen(false)}
      />

      <ImportProgressDialog progress={importProgress} />
    </div>
  );
}

function ColumnEditorModal({
  workspace,
  column,
  pending,
  onClose,
  onDelete,
  onSave,
}: {
  workspace: ProjectTrackerWorkspaceRecord;
  column: ProjectTrackerColumnRecord | null;
  pending: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (input: { name: string; type: ProjectTrackerColumnType; sourceFieldKey?: string | null }) => void;
}) {
  const [name, setName] = useState(column?.name ?? "");
  const [type, setType] = useState<ProjectTrackerColumnType>(column?.type ?? "TEXT");
  const [sourceFieldKey, setSourceFieldKey] = useState<string | null>(column?.sourceFieldKey ?? null);
  const commonFields = workspace.availableFields.slice(0, 9);

  function chooseField(key: string) {
    const field = workspace.availableFields.find((item) => item.key === key);
    if (!field) return;
    setSourceFieldKey(field.key);
    setName(field.label);
    setType(field.type);
  }

  return (
    <Modal title={column ? "Column settings" : "Add column"} description="Choose a common Flux field or create any custom column." onClose={onClose} widthClass="max-w-[760px]">
      {!column ? <div><h3 className="text-[10px] font-[850] uppercase tracking-[0.12em] text-[#7d8880]">Common Flux fields</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{commonFields.map((field) => <button type="button" key={field.key} onClick={() => chooseField(field.key)} className={`rounded-[15px] border px-3 py-3 text-left transition ${sourceFieldKey === field.key ? "border-[#7db18f] bg-[#eff8f1]" : "border-[#e1e7e1] hover:border-[#b9d3c1] hover:bg-[#f7faf7]"}`}><span className="flex items-center gap-2 text-[12px] font-[750] text-[#344038]"><Link2 className="size-3.5 text-[#38845c]" /> {field.label}</span><span className="mt-1 block text-[9px] uppercase tracking-[0.08em] text-[#89938c]">{columnTypes.find((item) => item.value === field.type)?.label}</span></button>)}</div></div> : null}
      <div className={`${column ? "" : "mt-6 border-t border-[#e5eae5] pt-5"} grid gap-4 sm:grid-cols-2`}>
        <label className="block"><span className="text-[11px] font-[750] text-[#4e5a52]">Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Expected Launch" className="mt-1.5 h-11 w-full rounded-[14px] border border-[#d9e1da] px-3 text-[13px] outline-none focus:border-[#82b696] focus:ring-2 focus:ring-[#e0f1e5]" /></label>
        <label className="block"><span className="text-[11px] font-[750] text-[#4e5a52]">Type</span><select value={type} disabled={Boolean(sourceFieldKey)} onChange={(event) => setType(event.target.value as ProjectTrackerColumnType)} className="mt-1.5 h-11 w-full rounded-[14px] border border-[#d9e1da] bg-white px-3 text-[13px] outline-none disabled:bg-[#f3f6f3]">{columnTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="block sm:col-span-2"><span className="text-[11px] font-[750] text-[#4e5a52]">Connect to Flux <span className="font-[550] text-[#8c958e]">(optional)</span></span><select value={sourceFieldKey ?? ""} onChange={(event) => {
          const key = event.target.value || null;
          setSourceFieldKey(key);
          if (key) chooseField(key);
        }} className="mt-1.5 h-11 w-full rounded-[14px] border border-[#d9e1da] bg-white px-3 text-[13px] outline-none"><option value="">Custom tracker field</option>{workspace.availableFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select><span className="mt-1.5 block text-[10px] leading-4 text-[#858f88]">Custom fields stay in the tracker. Connected fields safely read from the linked Flux project.</span></label>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {onDelete ? <Button type="button" variant="destructive" onClick={onDelete}><Trash2 className="size-4" /> Delete column</Button> : null}
        <span className="flex-1" />
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={pending || !name.trim()} onClick={() => onSave({ name: name.trim(), type, sourceFieldKey })}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {column ? "Save changes" : "Add column"}</Button>
      </div>
    </Modal>
  );
}
