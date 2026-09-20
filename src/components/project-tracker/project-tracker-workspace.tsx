"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Columns3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  Filter,
  History,
  Link2,
  Link2Off,
  Loader2,
  MoreHorizontal,
  PanelRightOpen,
  Pin,
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
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type UIEvent as ReactUIEvent,
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
  duplicateProjectTrackerRowAction,
  importProjectTrackerAction,
  initializeProjectTrackerAction,
  linkProjectTrackerRowAction,
  moveProjectTrackerRowAction,
  resetProjectTrackerToBlankAction,
  resolveProjectTrackerCellAction,
  saveProjectTrackerCellAction,
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
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type {
  ProjectTrackerCellRecord,
  ProjectTrackerColumnRecord,
  ProjectTrackerProjectOption,
  ProjectTrackerRowRecord,
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

type SortState = { columnId: string; direction: "asc" | "desc" } | null;
type FilterState = { columnId: string; value: string };
type ImportProgress = {
  stage: "reading" | "importing" | "rendering";
  fileName: string;
  rowCount?: number;
};
type ParsedSpreadsheet = {
  columns: Array<{ name: string; type: ProjectTrackerColumnType }>;
  rows: TrackerCellValue[][];
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

const ROW_HEIGHT = 48;
const ROW_WINDOW_SIZE = 50;
const ROW_OVERSCAN = 8;

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

const multiValueTypes = new Set<ProjectTrackerColumnType>([
  "MULTI_SELECT",
  "TAGS",
  "CLIENT",
  "VENDOR",
]);

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
        resolve({ columns: event.data.columns, rows: event.data.rows });
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

function toEditorValue(value: TrackerCellValue, type: ProjectTrackerColumnType) {
  if (value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (type === "DATE" && typeof value === "string") return value.slice(0, 10);
  if (type === "DATETIME" && typeof value === "string") return value.slice(0, 16);
  return String(value);
}

function fromEditorValue(value: string, type: ProjectTrackerColumnType): TrackerCellValue {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (multiValueTypes.has(type)) {
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (type === "NUMBER" || type === "PERCENTAGE") {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : trimmed;
  }
  if (type === "DATE") {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
  }
  if (type === "DATETIME") {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
  }
  return trimmed;
}

function cellInputType(type: ProjectTrackerColumnType) {
  if (type === "NUMBER" || type === "PERCENTAGE") return "number";
  if (type === "DATE") return "date";
  if (type === "DATETIME") return "datetime-local";
  if (type === "URL") return "url";
  return "text";
}

function ProjectKindBadge({ project }: { project: ProjectTrackerProjectOption }) {
  return (
    <span className="rounded-full border border-[#dce5dd] bg-[#f6f9f6] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.1em] text-[#718078]">
      {project.kind === "structured" ? "Artwork" : "Flexible"}
    </span>
  );
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
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#142119]/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={title}>
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
      className="fixed inset-0 z-[240] flex items-center justify-center bg-[#112118]/50 px-4 py-8 backdrop-blur-[3px]"
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

function EditableCell({
  row,
  column,
  cell,
  disabled,
  onSave,
}: {
  row: ProjectTrackerRowRecord;
  column: ProjectTrackerColumnRecord;
  cell: ProjectTrackerCellRecord;
  disabled: boolean;
  onSave: (rowId: string, columnId: string, value: TrackerCellValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toEditorValue(cell.value, column.type));

  if (column.type === "CHECKBOX" || column.type === "BOOLEAN") {
    const checked = cell.value === true || cell.value === "true" || cell.value === "Yes";
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave(row.id, column.id, !checked)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f5f8f5] disabled:cursor-default"
      >
        <span className={`grid size-5 place-items-center rounded-md border ${checked ? "border-[#2e8b59] bg-[#2e8b59] text-white" : "border-[#cfd8d0] bg-white"}`}>
          {checked ? <Check className="size-3.5" /> : null}
        </span>
        <span className="text-[12px] text-[#59645d]">{checked ? "Yes" : "No"}</span>
        <span className="ml-auto"><SyncIndicator cell={cell} /></span>
      </button>
    );
  }

  if (!editing) {
    const display = formatCellValue(cell.value, column.type);
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(toEditorValue(cell.value, column.type));
          setEditing(true);
        }}
        className="group flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f5f8f5] disabled:cursor-default disabled:hover:bg-transparent"
        title={Array.isArray(cell.value) ? cell.value.join(", ") : display}
      >
        <span className={`min-w-0 flex-1 truncate text-[13px] ${display ? "text-[#263129]" : "text-[#a3aaa5]"}`}>
          {display || "—"}
        </span>
        <SyncIndicator cell={cell} />
      </button>
    );
  }

  function commit() {
    const nextValue = fromEditorValue(draft, column.type);
    if (JSON.stringify(nextValue) !== JSON.stringify(cell.value)) {
      onSave(row.id, column.id, nextValue);
    }
    setEditing(false);
  }

  return (
    <input
      autoFocus
      type={cellInputType(column.type)}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(toEditorValue(cell.value, column.type));
          setEditing(false);
        }
      }}
      className="h-9 w-full rounded-lg border border-[#83b99a] bg-white px-2 text-[13px] text-[#263129] outline-none ring-2 ring-[#dff1e5]"
    />
  );
}

function ProjectCell({
  row,
  column,
  cell,
  projects,
  disabled,
  pending,
  onLink,
  onSave,
}: {
  row: ProjectTrackerRowRecord;
  column: ProjectTrackerColumnRecord;
  cell: ProjectTrackerCellRecord;
  projects: ProjectTrackerProjectOption[];
  disabled: boolean;
  pending: boolean;
  onLink: (rowId: string, project: ProjectTrackerProjectOption) => void;
  onSave: (rowId: string, columnId: string, value: TrackerCellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => toSearchText(cell.value));
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectingProjectRef = useRef(false);

  const matches = useMemo(() => {
    const needle = normalize(query.replace(/^@\s*/, ""));
    if (!needle) return projects.slice(0, 8);
    return projects
      .map((project) => {
        const projectName = normalize(project.name);
        const score = projectName.includes(needle)
          ? projectName.startsWith(needle) ? 2 : 1.5
          : scoreProjectMatch(needle, projectName);
        return { project, score };
      })
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || left.project.name.localeCompare(right.project.name))
      .map((match) => match.project)
      .slice(0, 8);
  }, [projects, query]);

  function selectProject(project: ProjectTrackerProjectOption) {
    selectingProjectRef.current = true;
    setQuery(project.name);
    setOpen(false);
    onLink(row.id, project);
  }

  useEffect(() => {
    if (!open) return;

    function positionMenu() {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const placeAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(360, placeAbove ? spaceAbove : spaceBelow));
      setMenuPosition({
        left,
        width,
        maxHeight,
        top: placeAbove ? Math.max(12, rect.top - maxHeight - 6) : rect.bottom + 6,
      });
    }

    const frame = window.requestAnimationFrame(positionMenu);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  if (row.project && !open) {
    const label = formatCellValue(cell.value, column.type) || row.project.name;
    return (
      <div className="flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#f5f8f5]">
        <Link href={row.project.href} className="min-w-0 flex-1 truncate text-[13px] font-[750] text-[#1b7048] hover:underline" title={`Open ${row.project.name}`}>
          {label}
        </Link>
        <SyncIndicator cell={cell} />
        {!disabled ? (
          <button type="button" onClick={() => {
            setQuery(toSearchText(cell.value));
            setOpen(true);
          }} className="grid size-6 place-items-center rounded-md text-[#738078] hover:bg-white hover:text-[#267a50]" aria-label="Change linked project">
            <Search className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#87928a]" />
        <input
          ref={inputRef}
          autoFocus={open}
          value={query}
          disabled={disabled || pending}
          placeholder="Type @ or a project name"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`project-options-${row.id}`}
          onFocus={() => {
            selectingProjectRef.current = false;
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (selectingProjectRef.current) return;
              setOpen(false);
              if (!row.project && query.trim() !== toSearchText(cell.value)) {
                onSave(row.id, column.id, query.trim() || null);
              }
            }, 160);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              selectProject(matches[0]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          className="h-9 w-full rounded-lg border border-transparent bg-transparent pl-8 pr-2 text-[13px] text-[#263129] outline-none placeholder:text-[#9da69f] focus:border-[#83b99a] focus:bg-white focus:ring-2 focus:ring-[#dff1e5]"
        />
      </div>
      {open && menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          id={`project-options-${row.id}`}
          role="listbox"
          className="fixed z-[260] overflow-y-auto rounded-[18px] border border-[#dfe6df] bg-white p-1.5 shadow-[0_22px_55px_rgba(19,39,26,0.17)]"
          style={menuPosition}
        >
          <div className="px-3 py-2 text-[10px] font-[800] uppercase tracking-[0.14em] text-[#7a867e]">
            Flux projects · {projects.length}
          </div>
          {matches.length ? matches.map((project) => (
            <button
              type="button"
              role="option"
              aria-selected={row.project?.id === project.id && row.project.kind === project.kind}
              key={`${project.kind}:${project.id}`}
              onMouseDown={(event) => {
                event.preventDefault();
                selectProject(project);
              }}
              className="flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left hover:bg-[#f1f7f2]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#eaf6ed] text-[#287b50]"><Link2 className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-[750] text-[#202a23]">{project.name}</span>
                <span className="block truncate text-[10px] text-[#778079]">{project.subtitle}</span>
              </span>
              <ProjectKindBadge project={project} />
            </button>
          )) : (
            <p className="px-3 py-5 text-center text-[12px] text-[#7c867f]">
              {projects.length
                ? "No matching Flux projects. Try another name."
                : "No Flux projects are available with your current access."}
            </p>
          )}
        </div>,
        document.body,
      ) : null}
    </div>
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
}: {
  canEdit: boolean;
  pending: boolean;
  onBlank: () => void;
  onImport: () => void;
  onLayout: () => void;
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
          <TrackerSetupOptions
            pending={pending}
            onBlank={onBlank}
            onImport={onImport}
            onLayout={onLayout}
          />
        ) : (
          <div className="mx-auto mt-8 max-w-[520px] rounded-[22px] border border-[#e1e7e1] bg-white p-6 text-[13px] leading-6 text-[#667169]">Project Tracker has not been set up yet. A user with project editing permission can create the first layout.</div>
        )}
      </div>
    </div>
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
        ? "Reset this tracker to one empty Project column."
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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [filter, setFilter] = useState<FilterState>({ columnId: "", value: "" });
  const [showFilter, setShowFilter] = useState(false);
  const [rowWindowStart, setRowWindowStart] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [columnEditor, setColumnEditor] = useState<ProjectTrackerColumnRecord | "new" | null>(null);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [detailsRowId, setDetailsRowId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [resetBlankOpen, setResetBlankOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!initialWorkspace.canEdit || !initialWorkspace.isInitialized) return;
    const frame = window.requestAnimationFrame(() => setSetupOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [initialWorkspace.canEdit, initialWorkspace.isInitialized]);

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

  const visibleColumns = useMemo(
    () => workspace.columns.filter((column) => !column.hidden),
    [workspace.columns],
  );

  const filteredRows = useMemo(() => {
    const searchNeedle = normalize(search);
    const filterNeedle = normalize(filter.value);
    const rows = workspace.rows.filter((row) => {
      if (searchNeedle) {
        const haystack = normalize([
          row.project?.name ?? "",
          ...workspace.columns.map((column) => toSearchText(row.cells[column.id]?.value ?? null)),
        ].join(" "));
        if (!haystack.includes(searchNeedle)) return false;
      }
      if (filter.columnId && filterNeedle) {
        const value = normalize(toSearchText(row.cells[filter.columnId]?.value ?? null));
        if (!value.includes(filterNeedle)) return false;
      }
      return true;
    });
    if (!sort) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = toSearchText(left.cells[sort.columnId]?.value ?? null);
      const rightValue = toSearchText(right.cells[sort.columnId]?.value ?? null);
      const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [filter, search, sort, workspace.columns, workspace.rows]);

  const maxRowWindowStart = Math.max(0, filteredRows.length - ROW_WINDOW_SIZE);
  const visibleRowStart = Math.min(rowWindowStart, maxRowWindowStart);
  const visibleRowEnd = Math.min(filteredRows.length, visibleRowStart + ROW_WINDOW_SIZE);
  const renderedRows = filteredRows.slice(visibleRowStart, visibleRowEnd);
  const topRowSpacerHeight = visibleRowStart * ROW_HEIGHT;
  const bottomRowSpacerHeight = Math.max(0, filteredRows.length - visibleRowEnd) * ROW_HEIGHT;

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

  const projectSuggestions = useMemo(() => {
    if (!matchesOpen) return [];
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
  }, [matchesOpen, workspace.columns, workspace.projectOptions, workspace.rows]);

  function resetRowWindow() {
    setRowWindowStart(0);
    gridScrollRef.current?.scrollTo({ top: 0 });
  }

  function handleGridScroll(event: ReactUIEvent<HTMLDivElement>) {
    const firstRow = Math.max(
      0,
      Math.floor(Math.max(0, event.currentTarget.scrollTop - ROW_HEIGHT) / ROW_HEIGHT) - ROW_OVERSCAN,
    );
    const nextStart = Math.min(firstRow, Math.max(0, filteredRows.length - ROW_WINDOW_SIZE));
    setRowWindowStart((current) => current === nextStart ? current : nextStart);
  }

  function saveCellFast(rowId: string, columnId: string, value: TrackerCellValue) {
    runFastAction(
      () => saveProjectTrackerCellAction({ rowId, columnId, value }),
      (current) => optimisticCellUpdate(current, rowId, columnId, value),
    );
  }

  function linkProjectFast(rowId: string, project: ProjectTrackerProjectOption) {
    runFastAction(
      () => linkProjectTrackerRowAction({ rowId, kind: project.kind, projectId: project.id }),
      (current) => optimisticProjectLink(current, rowId, project),
    );
  }

  function updateColumnFast(input: Parameters<typeof updateProjectTrackerColumnAction>[0]) {
    runFastAction(
      () => updateProjectTrackerColumnAction(input),
      (current) => optimisticColumnUpdate(current, input),
    );
  }

  function addRowFast() {
    const id = crypto.randomUUID();
    runFastAction(
      () => addProjectTrackerRowAction({ id }),
      (current) => ({
        ...current,
        rows: [
          ...current.rows,
          {
            id,
            sortOrder: current.rows.length,
            project: null,
            cells: Object.fromEntries(current.columns.map((column) => [column.id, emptyCell()])),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    window.requestAnimationFrame(() => {
      gridScrollRef.current?.scrollTo({ top: (workspace.rows.length + 1) * ROW_HEIGHT });
    });
  }

  function addColumnFast(input: {
    name: string;
    type: ProjectTrackerColumnType;
    sourceFieldKey?: string | null;
  }) {
    const id = crypto.randomUUID();
    runFastAction(
      () => addProjectTrackerColumnAction({ id, ...input }),
      (current) => {
        const field = current.availableFields.find((item) => item.key === input.sourceFieldKey);
        const column: ProjectTrackerColumnRecord = {
          id,
          name: input.name,
          type: field?.type ?? input.type,
          sourceFieldKey: field?.key ?? null,
          options: [],
          sortOrder: current.columns.length,
          width: field?.type === "LONG_TEXT" ? 260 : 180,
          hidden: false,
          frozen: false,
        };
        return {
          ...current,
          columns: [...current.columns, column],
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

  function deleteColumnFast(columnId: string) {
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

  function duplicateRowFast(row: ProjectTrackerRowRecord) {
    const id = crypto.randomUUID();
    runFastAction(
      () => duplicateProjectTrackerRowAction(row.id, { id }),
      (current) => ({
        ...current,
        rows: [
          ...current.rows,
          {
            ...row,
            id,
            sortOrder: current.rows.length,
            cells: Object.fromEntries(
              Object.entries(row.cells).map(([columnId, cell]) => [
                columnId,
                { ...cell, id: null },
              ]),
            ),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    );
  }

  function moveRowFast(rowId: string, direction: -1 | 1) {
    runFastAction(
      () => moveProjectTrackerRowAction(rowId, direction),
      (current) => {
        const rows = [...current.rows];
        const index = rows.findIndex((row) => row.id === rowId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= rows.length) return current;
        [rows[index], rows[target]] = [rows[target], rows[index]];
        return { ...current, rows: rows.map((row, sortOrder) => ({ ...row, sortOrder })) };
      },
    );
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
  }

  function handleResize(event: ReactMouseEvent, column: ProjectTrackerColumnRecord) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = column.width;
    let finalWidth = startWidth;
    function onMove(moveEvent: globalThis.MouseEvent) {
      finalWidth = Math.max(110, Math.min(480, startWidth + moveEvent.clientX - startX));
      setWorkspace((current) => ({
        ...current,
        columns: current.columns.map((item) => item.id === column.id ? { ...item, width: finalWidth } : item),
      }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      updateColumnFast({ columnId: column.id, width: finalWidth });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportProgress({ stage: "reading", fileName: file.name });
    await waitForNextPaint();
    try {
      const { columns, rows } = await parseSpreadsheetFile(file);
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

      setImportProgress({
        stage: "rendering",
        fileName: file.name,
        rowCount: rows.length,
      });
      await waitForNextPaint();
      if (applyResult(result) && "workspace" in result) {
        await waitForNextPaint();
        gridScrollRef.current?.scrollTo({
          top: result.workspace.rows.length * ROW_HEIGHT,
        });
        if (rows.length <= 200) {
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
    const XLSX = await import("xlsx");
    const data = filteredRows.map((row) => Object.fromEntries(visibleColumns.map((column) => [
      column.name,
      Array.isArray(row.cells[column.id]?.value)
        ? (row.cells[column.id]?.value as string[]).join(", ")
        : row.cells[column.id]?.value ?? "",
    ])));
    const sheet = XLSX.utils.json_to_sheet(data, { header: visibleColumns.map((column) => column.name) });
    sheet["!cols"] = visibleColumns.map((column) => ({ wch: Math.max(12, Math.round(column.width / 8)) }));
    const safeName = workspace.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "project-tracker";
    if (format === "csv") {
      const blob = new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeName}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Project Tracker");
      XLSX.writeFile(book, `${safeName}.xlsx`);
    }
    showSuccessToast(`Exported ${filteredRows.length} rows.`);
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
        />
        <ImportProgressDialog progress={importProgress} />
      </>
    );
  }

  const gridTemplateColumns = `76px ${visibleColumns.map((column) => `${column.width}px`).join(" ")} 48px`;
  const frozenOffsets = new Map<string, number>();
  let frozenLeft = 76;
  for (const column of visibleColumns) {
    if (column.frozen) {
      frozenOffsets.set(column.id, frozenLeft);
      frozenLeft += column.width;
    }
  }
  const allVisibleSelected = renderedRows.length > 0 && renderedRows.every((row) => selectedRows.has(row.id));
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
                {workspace.rows.length} rows · {workspace.columns.length} columns ·
                {savingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[#47735a]"><Loader2 className="size-3 animate-spin" /> Saving</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[#498063]"><Check className="size-3" /> Saved</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}><History className="size-4" /> History</Button>
            <Button type="button" variant={workspace.updateCount ? "outline" : "secondary"} size="sm" onClick={() => setUpdatesOpen(true)} className={workspace.updateCount ? "border-[#e7ba7d] bg-[#fff8ec] text-[#a96114]" : ""}>
              <CircleAlert className="size-4" /> {workspace.updateCount ? `${workspace.updateCount} updates` : "Up to date"}
            </Button>
            {workspace.canEdit ? <Button type="button" size="sm" onClick={() => setColumnEditor("new")}><Plus className="size-4" /> Add Column</Button> : null}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#e4e9e4] bg-white px-3 py-3 sm:px-4">
        {workspace.canEdit ? (
          <Button type="button" variant="secondary" size="sm" onClick={addRowFast}>
            <Plus className="size-4" /> Row
          </Button>
        ) : null}
        <div className="relative min-w-[190px] flex-1 sm:max-w-[360px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#89938c]" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); resetRowWindow(); }} placeholder="Search this tracker..." className="h-9 w-full rounded-full border border-[#dce3dc] bg-[#f9fbf9] pl-9 pr-9 text-[12px] outline-none focus:border-[#86b99a] focus:bg-white focus:ring-2 focus:ring-[#e1f2e6]" />
          {search ? <button type="button" onClick={() => { setSearch(""); resetRowWindow(); }} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[#7c877f] hover:bg-[#edf1ed]"><X className="size-3" /></button> : null}
        </div>
        <Button type="button" variant={filter.value ? "outline" : "secondary"} size="sm" onClick={() => setShowFilter((current) => !current)}><Filter className="size-4" /> Filter</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="sm"><Eye className="size-4" /> Columns <ChevronDown className="size-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[360px] overflow-y-auto">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {workspace.columns.map((column) => (
              <DropdownMenuCheckboxItem key={column.id} checked={!column.hidden} onCheckedChange={(checked) => updateColumnFast({ columnId: column.id, hidden: !checked })}>
                {column.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {workspace.canEdit ? <Button type="button" variant="secondary" size="sm" onClick={() => setSetupOpen(true)}><Columns3 className="size-4" /> Layouts</Button> : null}
        {workspace.canEdit ? <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="size-4" /> Import</Button> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="sm"><Download className="size-4" /> Export</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exportFile("xlsx")}><FileSpreadsheet className="size-4" /> Excel workbook (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportFile("csv")}><FileDown className="size-4" /> CSV file</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {selectedRows.size && workspace.canEdit ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => {
            const count = selectedRows.size;
            setDeleteConfirmation({
              kind: "rows",
              rowIds: [...selectedRows],
              title: `Delete ${count} selected ${count === 1 ? "row" : "rows"}?`,
              description: `This removes the selected ${count === 1 ? "row" : "rows"} from Project Tracker. Any linked Flux projects and their data will remain unchanged.`,
              confirmLabel: `Delete ${count} ${count === 1 ? "row" : "rows"}`,
            });
          }}><Trash2 className="size-4" /> Delete {selectedRows.size}</Button>
        ) : null}
      </div>

      {showFilter ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e6ebe6] bg-[#f8faf8] px-4 py-2.5">
          <span className="text-[11px] font-[800] uppercase tracking-[0.11em] text-[#7b867e]">Show where</span>
          <select value={filter.columnId} onChange={(event) => { setFilter((current) => ({ ...current, columnId: event.target.value })); resetRowWindow(); }} className="h-9 min-w-[160px] rounded-[12px] border border-[#d8e0d9] bg-white px-3 text-[12px] text-[#39443c] outline-none">
            <option value="">Choose column</option>
            {visibleColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
          </select>
          <input value={filter.value} onChange={(event) => { setFilter((current) => ({ ...current, value: event.target.value })); resetRowWindow(); }} placeholder="contains..." className="h-9 min-w-[200px] flex-1 rounded-[12px] border border-[#d8e0d9] bg-white px-3 text-[12px] outline-none sm:max-w-[320px]" />
          {filter.value || filter.columnId ? <Button type="button" variant="ghost" size="sm" onClick={() => { setFilter({ columnId: "", value: "" }); resetRowWindow(); }}><X className="size-3.5" /> Clear</Button> : null}
        </div>
      ) : null}

      <div ref={gridScrollRef} onScroll={handleGridScroll} className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-[#f8faf8]">
        <div className="min-w-max" style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 124) + 124 }}>
          <div role="row" className="sticky top-0 z-40 grid min-h-[48px] border-b border-[#dce4dc] bg-[#f1f5f1]" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-50 flex items-center gap-2 border-r border-[#dce4dc] bg-[#f1f5f1] px-3">
              <input type="checkbox" checked={allVisibleSelected} onChange={(event) => setSelectedRows((current) => {
                const next = new Set(current);
                for (const row of renderedRows) {
                  if (event.target.checked) next.add(row.id); else next.delete(row.id);
                }
                return next;
              })} aria-label="Select all currently rendered rows" className="size-4 accent-[#2e8355]" />
              <span className="text-[10px] font-[800] text-[#8a948d]">#</span>
            </div>
            {visibleColumns.map((column) => {
              const frozenOffset = frozenOffsets.get(column.id);
              const stickyStyle: CSSProperties | undefined = frozenOffset !== undefined ? { position: "sticky", left: frozenOffset, zIndex: 49 } : undefined;
              return (
                <div key={column.id} className={`group relative flex min-w-0 items-center gap-2 border-r border-[#dce4dc] bg-[#f1f5f1] px-3 ${column.frozen ? "shadow-[5px_0_12px_rgba(27,48,34,0.04)]" : ""}`} style={stickyStyle}>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-[850] uppercase tracking-[0.065em] text-[#59665d]">{column.name}</span>
                  {column.sourceFieldKey ? <Link2 className="size-3.5 shrink-0 text-[#45906a]" /> : null}
                  {column.frozen ? <Pin className="size-3.5 shrink-0 text-[#758078]" /> : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button type="button" className="grid size-7 shrink-0 place-items-center rounded-md text-[#78847b] opacity-50 hover:bg-white hover:text-[#2a7a50] group-hover:opacity-100" aria-label={`${column.name} settings`}><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>{column.name}</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => { setSort({ columnId: column.id, direction: "asc" }); resetRowWindow(); }}><ArrowUp className="size-4" /> Sort A–Z</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setSort({ columnId: column.id, direction: "desc" }); resetRowWindow(); }}><ArrowDown className="size-4" /> Sort Z–A</DropdownMenuItem>
                      {sort?.columnId === column.id ? <DropdownMenuItem onSelect={() => { setSort(null); resetRowWindow(); }}><X className="size-4" /> Clear sort</DropdownMenuItem> : null}
                      {workspace.canEdit ? <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setColumnEditor(column)}><Columns3 className="size-4" /> Column settings</DropdownMenuItem>
                        <DropdownMenuItem disabled={column.sortOrder === workspace.columns[0]?.sortOrder} onSelect={() => updateColumnFast({ columnId: column.id, move: -1 })}><ArrowLeft className="size-4" /> Move left</DropdownMenuItem>
                        <DropdownMenuItem disabled={column.sortOrder === workspace.columns.at(-1)?.sortOrder} onSelect={() => updateColumnFast({ columnId: column.id, move: 1 })}><ArrowRight className="size-4" /> Move right</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => updateColumnFast({ columnId: column.id, frozen: !column.frozen })}><Pin className="size-4" /> {column.frozen ? "Unfreeze" : "Freeze"}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => updateColumnFast({ columnId: column.id, hidden: true })}><EyeOff className="size-4" /> Hide</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => {
                          setDeleteConfirmation({
                            kind: "column",
                            columnId: column.id,
                            title: `Delete “${column.name}”?`,
                            description: "This removes the column and every tracker value stored in it. Connected Flux project data will remain unchanged.",
                            confirmLabel: "Delete column",
                          });
                        }}><Trash2 className="size-4" /> Delete column</DropdownMenuItem>
                      </> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {workspace.canEdit ? <button type="button" onMouseDown={(event) => handleResize(event, column)} className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize" aria-label={`Resize ${column.name}`} /> : null}
                </div>
              );
            })}
            <div className="bg-[#f1f5f1]" />
          </div>

          {filteredRows.length ? <>
            {topRowSpacerHeight ? <div aria-hidden="true" style={{ height: topRowSpacerHeight }} /> : null}
            {renderedRows.map((row, rowIndex) => (
              <div key={row.id} role="row" className={`grid h-12 border-b border-[#e4e9e4] ${selectedRows.has(row.id) ? "bg-[#f0f8f2]" : "bg-white hover:bg-[#fbfcfb]"}`} style={{ gridTemplateColumns }}>
              <div className={`sticky left-0 z-30 flex items-center gap-2 border-r border-[#e1e7e1] px-3 ${selectedRows.has(row.id) ? "bg-[#f0f8f2]" : "bg-white"}`}>
                <input type="checkbox" checked={selectedRows.has(row.id)} onChange={(event) => setSelectedRows((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(row.id); else next.delete(row.id);
                  return next;
                })} aria-label={`Select row ${visibleRowStart + rowIndex + 1}`} className="size-4 accent-[#2e8355]" />
                <span className="w-5 text-right text-[10px] font-[700] text-[#929b95]">{visibleRowStart + rowIndex + 1}</span>
              </div>
              {visibleColumns.map((column) => {
                const cell = row.cells[column.id] ?? { id: null, value: null, sourceValue: null, syncState: "custom" as const, lastSyncedAt: null };
                const frozenOffset = frozenOffsets.get(column.id);
                const stickyStyle: CSSProperties | undefined = frozenOffset !== undefined ? { position: "sticky", left: frozenOffset, zIndex: 29 } : undefined;
                const projectColumn = column.sourceFieldKey === "project.name" || column.type === "PROJECT";
                return (
                  <div key={column.id} className={`min-w-0 border-r border-[#e4e9e4] p-1 ${column.frozen ? `shadow-[5px_0_12px_rgba(27,48,34,0.035)] ${selectedRows.has(row.id) ? "bg-[#f0f8f2]" : "bg-white"}` : ""}`} style={stickyStyle}>
                    {projectColumn ? (
                      <ProjectCell row={row} column={column} cell={cell} projects={workspace.projectOptions} disabled={!workspace.canEdit} pending={false} onLink={linkProjectFast} onSave={saveCellFast} />
                    ) : (
                      <EditableCell row={row} column={column} cell={cell} disabled={!workspace.canEdit} onSave={saveCellFast} />
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-center bg-inherit">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" className="grid size-8 place-items-center rounded-lg text-[#7c877f] hover:bg-[#edf2ed] hover:text-[#2b7950]" aria-label="Row actions"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDetailsRowId(row.id)}><PanelRightOpen className="size-4" /> Row details</DropdownMenuItem>
                    {row.project ? <DropdownMenuItem asChild><Link href={row.project.href}><Link2 className="size-4" /> Open Flux project</Link></DropdownMenuItem> : null}
                    {workspace.canEdit ? <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => moveRowFast(row.id, -1)}><ArrowUp className="size-4" /> Move up</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => moveRowFast(row.id, 1)}><ArrowDown className="size-4" /> Move down</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => duplicateRowFast(row)}><Copy className="size-4" /> Duplicate row</DropdownMenuItem>
                      {row.project ? <DropdownMenuItem onSelect={() => unlinkProjectFast(row.id)}><Link2Off className="size-4" /> Disconnect project</DropdownMenuItem> : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => {
                        setDeleteConfirmation({
                          kind: "rows",
                          rowIds: [row.id],
                          title: "Delete this tracker row?",
                          description: "This removes the row from Project Tracker. The linked Flux project and its data will remain unchanged.",
                          confirmLabel: "Delete row",
                        });
                      }}><Trash2 className="size-4" /> Delete row</DropdownMenuItem>
                    </> : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              </div>
            ))}
            {bottomRowSpacerHeight ? <div aria-hidden="true" style={{ height: bottomRowSpacerHeight }} /> : null}
          </> : (
            <div className="flex min-h-[320px] items-center justify-center bg-white px-6 text-center">
              <div><Rows3 className="mx-auto size-8 text-[#9aaa9f]" /><p className="mt-3 text-[15px] font-[800] text-[#344139]">{workspace.rows.length ? "No rows match these filters" : "Your tracker is ready"}</p><p className="mt-1 text-[12px] text-[#7c867f]">{workspace.rows.length ? "Clear the search or filter to see more." : "Add a row, then choose a Flux project or enter your own information."}</p>{!workspace.rows.length && workspace.canEdit ? <Button type="button" size="sm" className="mt-5" onClick={addRowFast}><Plus className="size-4" /> Add first row</Button> : null}</div>
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e9e3] bg-white px-4 py-2.5 text-[10px] font-[700] text-[#7e8981]">
        <span>
          {filteredRows.length ? `${visibleRowStart + 1}–${visibleRowEnd}` : "0"} of {filteredRows.length} rows
          {filteredRows.length !== workspace.rows.length ? ` (${workspace.rows.length} total)` : ""}
        </span>
        <span>Smooth view · scroll normally through all rows</span>
        <span className="hidden items-center gap-1.5 lg:flex"><Link2 className="size-3.5 text-[#3d8a62]" /> Linked cells update safely; local values are never silently replaced.</span>
      </footer>

      {columnEditor ? (
        <ColumnEditorModal
          workspace={workspace}
          column={columnEditor === "new" ? null : columnEditor}
          pending={pending}
          onClose={() => setColumnEditor(null)}
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
        <Modal title="Project updates" description="Flux never replaces a different tracker value without your choice." onClose={() => setUpdatesOpen(false)} widthClass="max-w-[720px]">
          <div className="space-y-4">
            {!conflictUpdates.length && !localOverrides.length ? <div className="rounded-[20px] border border-[#dce9df] bg-[#f4faf5] p-6 text-center"><Check className="mx-auto size-7 text-[#33865a]" /><p className="mt-2 text-[14px] font-[800] text-[#284334]">Everything is current</p><p className="mt-1 text-[12px] text-[#718078]">Linked tracker fields match the Flux projects you can view.</p></div> : null}
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
        <Modal title="Tracker history" description="Important changes to rows, columns, links, imports, and sync choices." onClose={() => setHistoryOpen(false)}>
          <div className="space-y-2">{workspace.activities.map((activity) => <div key={activity.id} className="flex gap-3 rounded-[16px] border border-[#e4e9e4] px-4 py-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#eef5ef] text-[#488064]"><Clock3 className="size-4" /></span><div className="min-w-0"><p className="text-[12px] font-[750] text-[#303b33]">{activity.summary}</p><p className="mt-1 text-[10px] text-[#7d8780]">{activity.actorName} · {formatDate(activity.createdAt, true)}</p></div></div>)}{!workspace.activities.length ? <p className="py-8 text-center text-[12px] text-[#7c867f]">No tracker activity yet.</p> : null}</div>
        </Modal>
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
        description="This permanently removes every tracker row, column, and local value, then creates one empty Project column. Linked Flux projects are not deleted."
        confirmLabel="Reset to blank"
        pendingLabel="Resetting..."
        tone="destructive"
        pending={pending}
        onConfirm={() => runAction(
          () => resetProjectTrackerToBlankAction(),
          () => {
            setResetBlankOpen(false);
            setSelectedRows(new Set());
            setSearch("");
            setSort(null);
            setFilter({ columnId: "", value: "" });
            resetRowWindow();
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
  onSave,
}: {
  workspace: ProjectTrackerWorkspaceRecord;
  column: ProjectTrackerColumnRecord | null;
  pending: boolean;
  onClose: () => void;
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
      <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" disabled={pending || !name.trim()} onClick={() => onSave({ name: name.trim(), type, sourceFieldKey })}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {column ? "Save changes" : "Add column"}</Button></div>
    </Modal>
  );
}
