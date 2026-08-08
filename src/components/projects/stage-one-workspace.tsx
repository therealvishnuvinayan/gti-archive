"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type {
  ProjectInquiryAttachmentField,
  ProjectInquiryPriority,
} from "@prisma/client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  ListChecks,
  Loader2,
  Paperclip,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import {
  completeProjectInquiryAction,
  createContactDirectoryEntryAction,
  searchProjectInquiryHistorySuggestionsAction,
  searchProjectInquiryPartyOptionsAction,
} from "@/app/(dashboard)/projects/[slug]/stages/1/actions";
import { AppDatePicker } from "@/components/calendar/app-date-picker";
import {
  CollaboratorDialog,
  type CollaboratorForm,
} from "@/components/collaboration/collaborator-dialog";
import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectFlowSummaryStrip } from "@/components/projects/project-summary-strip";
import { StageOneReadOnlyView } from "@/components/projects/stage-one-read-only-view";
import {
  ProjectContactDialog,
  type ProjectContactForm,
} from "@/components/projects/project-contact-dialog";
import {
  ProjectUserSelector,
  type ProjectUserOption,
} from "@/components/projects/project-user-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { CollaboratorRecord } from "@/lib/collaboration";
import { validateProjectContactInput } from "@/lib/project-contact-validation";
import type {
  CompleteProjectInquiryInput,
  ProjectInquiryAttachmentRecord,
  ProjectInquiryFieldErrors,
  ProjectInquiryPageData,
  ProjectInquiryPartyOption,
  ProjectInquiryPartySelection,
} from "@/lib/project-inquiry";
import type { ProjectStageShellRecord } from "@/lib/projects";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type StageOneWorkspaceProps = {
  project: ProjectStageShellRecord;
  currentUserId: string;
  pageData: ProjectInquiryPageData;
  showChrome?: boolean;
};

type PartyField = "client" | "finalBeneficiary";

const attachmentFields = {
  initialBrief: "INITIAL_BRIEF",
  businessObjectives: "BUSINESS_OBJECTIVES",
  legalNotes: "LEGAL_NOTES",
} as const satisfies Record<string, ProjectInquiryAttachmentField>;

function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultContactForm(): ProjectContactForm {
  return { name: "", company: "", position: "", email: "", phone: "" };
}

function getDefaultCollaboratorForm(): CollaboratorForm {
  return { name: "", email: "", type: "GTI_INTERNAL_CLIENT" };
}

function toUserOption(collaborator: CollaboratorRecord): ProjectUserOption {
  return {
    id: collaborator.id,
    name: collaborator.name,
    email: collaborator.email,
    role: "COLLABORATOR",
  };
}

function upsertCollaborator(
  collaborators: CollaboratorRecord[],
  next: CollaboratorRecord,
) {
  return collaborators.some((collaborator) => collaborator.id === next.id)
    ? collaborators.map((collaborator) =>
        collaborator.id === next.id ? next : collaborator,
      )
    : [...collaborators, next];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StageOneFormField({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-2 block text-[13px] font-[720] text-[#202923]">
        {label}
        {required ? <span className="ml-1 text-[#bd4d48]">*</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-[12px] text-[#b84e48]">{error}</p> : null}
    </div>
  );
}

function PartySelector({
  ariaLabel,
  placeholder,
  options,
  value,
  disabled,
  error,
  onChange,
  onSearch,
}: {
  ariaLabel: string;
  placeholder: string;
  options: ProjectInquiryPartyOption[];
  value: ProjectInquiryPartySelection | null;
  disabled: boolean;
  error?: string;
  onChange: (value: ProjectInquiryPartySelection | null) => void;
  onSearch: (query: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return options.filter((option) => {
      if (!normalizedQuery) return true;
      return [option.name, option.company, option.position, option.email]
        .filter(Boolean)
        .some((part) => part!.toLocaleLowerCase("en").includes(normalizedQuery));
    });
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open || disabled) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setSearching(true);
      void onSearch(query).finally(() => {
        if (!cancelled) setSearching(false);
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [disabled, onSearch, open, query]);

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-[14px] border bg-white px-3 transition",
          open ? "border-brand ring-3 ring-brand/10" : "border-[#dce3dc]",
          error && "border-[#c85c54]",
          disabled && "bg-[#f6f8f6] opacity-70",
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-[#859087]" />
        {value && !open ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-[13px] font-[650] text-[#263029]">
              {value.name}
            </span>
            {value.company || value.email ? (
              <span className="block truncate text-[11px] text-[#7d8780]">
                {value.company || value.email}
              </span>
            ) : null}
          </button>
        ) : (
          <input
            aria-label={ariaLabel}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            disabled={disabled}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter" && filteredOptions[0]) {
                event.preventDefault();
                onChange(filteredOptions[0]);
                setQuery("");
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#9aa39b]"
          />
        )}
        {value && !disabled ? (
          <button
            type="button"
            aria-label={`Clear ${ariaLabel}`}
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(true);
            }}
            className="grid size-7 place-items-center rounded-full text-[#7d8780] hover:bg-[#edf2ed]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          aria-label={`Open ${ariaLabel}`}
          onClick={() => setOpen((current) => !current)}
          className="grid size-7 place-items-center rounded-full text-[#59645d]"
        >
          <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-[290px] overflow-y-auto rounded-[18px] border border-[#dce3dc] bg-white p-1.5 shadow-[0_20px_50px_rgba(17,33,23,0.14)]"
        >
          {searching && filteredOptions.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#7b847d]">
              Searching...
            </p>
          ) : filteredOptions.length ? (
            filteredOptions.map((option) => {
              const selected = value?.id === option.id && value.source === option.source;
              return (
                <button
                  key={`${option.source}:${option.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left hover:bg-[#f3f7f3]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf4ee] text-[11px] font-[750] text-[#2d704b]">
                    {option.name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-[650] text-[#202923]">
                      {option.name}
                    </span>
                    <span className="block truncate text-[11px] text-[#7d8780]">
                      {[option.company, option.position, option.email]
                        .filter(Boolean)
                        .join(" · ") ||
                        (option.source === "USER" ? "FluxSys user" : "Directory contact")}
                    </span>
                  </span>
                  {selected ? <Check className="h-4 w-4 text-brand" /> : null}
                </button>
              );
            })
          ) : (
            <p className="px-4 py-8 text-center text-[13px] text-[#7b847d]">
              No matching people or contacts.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MultiEntryInput({
  ariaLabel,
  values,
  suggestions,
  placeholder,
  disabled,
  error,
  onChange,
  onSearchSuggestions,
}: {
  ariaLabel: string;
  values: string[];
  suggestions: string[];
  placeholder: string;
  disabled: boolean;
  error?: string;
  onChange: (values: string[]) => void;
  onSearchSuggestions?: (query: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const normalizedValues = useMemo(
    () => new Set(values.map((value) => value.trim().toLocaleLowerCase("en"))),
    [values],
  );
  const filteredSuggestions = useMemo(() => {
    const query = draft.trim().toLocaleLowerCase("en");
    return suggestions
      .filter((suggestion) => !normalizedValues.has(suggestion.toLocaleLowerCase("en")))
      .filter((suggestion) => !query || suggestion.toLocaleLowerCase("en").includes(query));
  }, [draft, normalizedValues, suggestions]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open || disabled || !onSearchSuggestions) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) void onSearchSuggestions(draft);
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [disabled, draft, onSearchSuggestions, open]);

  function add(value: string) {
    const normalized = value.trim();
    if (!normalized || normalizedValues.has(normalized.toLocaleLowerCase("en"))) {
      setDraft("");
      return;
    }
    onChange([...values, normalized]);
    setDraft("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex min-h-12 flex-wrap items-center gap-2 rounded-[14px] border bg-white px-2.5 py-2 focus-within:ring-3 focus-within:ring-brand/15",
          error ? "border-[#c85c54]" : "border-[#dce3dc]",
          disabled && "bg-[#f6f8f6] opacity-70",
        )}
      >
        {values.map((value) => (
          <span
            key={value.toLocaleLowerCase("en")}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#f0f4f0] px-2.5 py-1.5 text-[11px] font-[650] text-[#38443c]"
          >
            {value}
            {!disabled ? (
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((item) => item !== value))}
                className="rounded-full text-[#7d8880] hover:text-[#2d6949]"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        <input
          aria-label={ariaLabel}
          disabled={disabled}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              if (draft.trim()) add(draft);
            }, 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
            if (event.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder={placeholder}
          className="h-7 min-w-[150px] flex-1 bg-transparent px-1 text-[13px] text-[#29322c] outline-none placeholder:text-[#9aa39b]"
        />
        <ChevronDown className="h-4 w-4 shrink-0 text-[#59645d]" />
      </div>
      {open && !disabled && filteredSuggestions.length ? (
        <div
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[250px] touch-pan-y overflow-y-auto overscroll-contain rounded-[16px] border border-[#dce3dc] bg-white p-1.5 [scrollbar-gutter:stable] shadow-[0_18px_44px_rgba(17,33,23,0.13)]"
        >
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion.toLocaleLowerCase("en")}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(suggestion)}
              className="block w-full rounded-[11px] px-3 py-2 text-left text-[13px] text-[#2d372f] hover:bg-[#f2f6f2]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function growTextareaToContent(textarea: HTMLTextAreaElement) {
  const borderHeight = textarea.offsetHeight - textarea.clientHeight;
  const contentHeight = textarea.scrollHeight + borderHeight;

  if (contentHeight > textarea.offsetHeight) {
    textarea.style.height = `${contentHeight}px`;
  }
}

function getBusinessObjectiveEntries(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function BusinessObjectiveTagsInput({
  value,
  disabled,
  error,
  onChange,
}: {
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const entries = getBusinessObjectiveEntries(value);

  function addDraft() {
    const nextEntry = draft.trim().replace(/\s+/g, " ");

    if (!nextEntry) return;

    const normalizedEntry = nextEntry.toLocaleLowerCase("en");
    if (!entries.some((entry) => entry.toLocaleLowerCase("en") === normalizedEntry)) {
      onChange([...entries, nextEntry].join("\n"));
    }
    setDraft("");
  }

  return (
    <div
      className={cn(
        "flex min-h-[104px] cursor-text flex-wrap content-start items-start gap-2 rounded-[14px] border bg-white px-3 py-3 pb-12 pr-14 focus-within:ring-3 focus-within:ring-brand/15",
        error ? "border-[#c85c54]" : "border-[#dce3dc]",
        disabled && "cursor-not-allowed bg-[#f6f8f6] opacity-70",
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {entries.map((entry, index) => (
        <span
          key={`${entry.toLocaleLowerCase("en")}-${index}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-[9px] bg-[#edf5ef] px-2.5 py-1.5 text-[12px] font-[650] text-[#315f47]"
        >
          <span className="max-w-[280px] truncate" title={entry}>
            {entry}
          </span>
          {!disabled ? (
            <button
              type="button"
              aria-label={`Remove objective: ${entry}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(entries.filter((_, entryIndex) => entryIndex !== index).join("\n"));
              }}
              className="rounded-full text-[#738079] transition hover:text-[#225f3f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8057]"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        aria-label="Add a key business objective"
        disabled={disabled}
        value={draft}
        placeholder={entries.length ? "Add another objective" : "Type an objective and press Enter"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={addDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addDraft();
          }
          if (event.key === "Backspace" && !draft && entries.length) {
            onChange(entries.slice(0, -1).join("\n"));
          }
        }}
        className="h-8 min-w-[210px] flex-1 bg-transparent px-1 text-[13px] text-[#29322c] outline-none placeholder:text-[#9aa39b]"
      />
    </div>
  );
}

function AttachmentTextarea({
  projectId,
  field,
  ariaLabel,
  placeholder,
  value,
  attachments,
  disabled,
  error,
  entryMode = "text",
  onValueChange,
  onAttachmentsChange,
}: {
  projectId: string;
  field: ProjectInquiryAttachmentField;
  ariaLabel: string;
  placeholder: string;
  value: string;
  attachments: ProjectInquiryAttachmentRecord[];
  disabled: boolean;
  error?: string;
  entryMode?: "text" | "business-objectives";
  onValueChange: (value: string) => void;
  onAttachmentsChange: (files: ProjectInquiryAttachmentRecord[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();

  useLayoutEffect(() => {
    if (textareaRef.current) {
      growTextareaToContent(textareaRef.current);
    }
  }, [value]);

  async function uploadFile(file: File) {
    const requestResponse = await fetch("/api/project-assets/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        assetType: "GENERAL_PROJECT_ASSET",
      }),
    });
    const requestResult = (await requestResponse.json()) as {
      attachmentId?: string;
      uploadUrl?: string;
      uploadExpectedHeaders?: Record<string, string>;
      error?: string;
    };
    if (!requestResponse.ok || !requestResult.attachmentId || !requestResult.uploadUrl) {
      throw new Error(requestResult.error || `Unable to prepare ${file.name}.`);
    }

    try {
      const uploadResponse = await fetch(requestResult.uploadUrl, {
        method: "PUT",
        headers: requestResult.uploadExpectedHeaders ?? {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`Unable to upload ${file.name}.`);
    } catch (uploadFailure) {
      await fetch("/api/project-assets/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: requestResult.attachmentId, failed: true }),
      }).catch(() => undefined);
      throw uploadFailure;
    }

    const completionResponse = await fetch("/api/project-assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId: requestResult.attachmentId }),
    });
    const completionResult = (await completionResponse.json()) as { error?: string };
    if (!completionResponse.ok) {
      throw new Error(completionResult.error || `Unable to finish ${file.name}.`);
    }

    return {
      id: requestResult.attachmentId,
      originalFileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    } satisfies ProjectInquiryAttachmentRecord;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length || disabled || uploading) return;
    setUploading(true);
    setUploadError(undefined);
    const uploaded: ProjectInquiryAttachmentRecord[] = [];
    try {
      for (const file of Array.from(files)) uploaded.push(await uploadFile(file));
      onAttachmentsChange([...attachments, ...uploaded]);
    } catch (uploadFailure) {
      if (uploaded.length) onAttachmentsChange([...attachments, ...uploaded]);
      const message =
        uploadFailure instanceof Error ? uploadFailure.message : "Unable to upload the file.";
      setUploadError(message);
      showErrorToast("Attachment upload failed.", message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="relative">
        {entryMode === "business-objectives" ? (
          <BusinessObjectiveTagsInput
            value={value}
            disabled={disabled}
            error={error}
            onChange={onValueChange}
          />
        ) : (
          <Textarea
            ref={textareaRef}
            aria-label={ariaLabel}
            value={value}
            disabled={disabled}
            onChange={(event) => {
              onValueChange(event.target.value);
              growTextareaToContent(event.currentTarget);
            }}
            placeholder={placeholder}
            className={cn(
              "min-h-[104px] resize-y overflow-y-auto rounded-[14px] bg-white pb-10 pr-16 shadow-none",
              error ? "border-[#c85c54]" : "border-[#dce3dc]",
            )}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <button
          type="button"
          disabled={disabled || uploading}
          aria-label={`Attach a file to ${ariaLabel}`}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "absolute bottom-3 grid size-8 place-items-center rounded-full text-[#6f7b73] hover:bg-[#eef5ef] hover:text-brand disabled:opacity-50",
            entryMode === "business-objectives" ? "right-3" : "right-8",
          )}
        >
          {uploading ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <Paperclip className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>
      {attachments.length ? (
        <div className="mt-2 flex flex-wrap gap-2" data-attachment-field={field}>
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex max-w-full items-center gap-2 rounded-[10px] border border-[#dfe6df] bg-[#f7f9f7] px-2.5 py-1.5 text-[11px] text-[#465149]"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-[#377253]" />
              <span className="max-w-[220px] truncate">{attachment.originalFileName}</span>
              <span className="text-[#8b948d]">{formatBytes(attachment.fileSize)}</span>
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Remove ${attachment.originalFileName}`}
                  onClick={() =>
                    onAttachmentsChange(
                      attachments.filter((item) => item.id !== attachment.id),
                    )
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {uploadError ? <p className="mt-1.5 text-[12px] text-[#b84e48]">{uploadError}</p> : null}
    </div>
  );
}

export function StageOneWorkspace({
  project,
  currentUserId,
  pageData,
  showChrome = true,
}: StageOneWorkspaceProps) {
  const router = useRouter();
  const saved = pageData.inquiry;
  const [mode, setMode] = useState<"edit" | "view">(
    pageData.canEdit ? "edit" : "view",
  );
  const [submitting, startSubmitting] = useTransition();
  const [partyOptions, setPartyOptions] = useState(() => {
    const options = [...pageData.partyOptions];
    for (const savedParty of [saved?.client, saved?.finalBeneficiary]) {
      if (
        savedParty &&
        !options.some(
          (option) => option.id === savedParty.id && option.source === savedParty.source,
        )
      ) {
        options.push(savedParty);
      }
    }
    return options;
  });
  const [client, setClient] = useState(saved?.client ?? null);
  const [finalBeneficiary, setFinalBeneficiary] = useState(
    saved?.finalBeneficiary ?? null,
  );
  const [clientOrigin, setClientOrigin] = useState<"EXTERNAL" | "INTERNAL">(
    saved?.clientOrigin ?? "EXTERNAL",
  );
  const [targetMarkets, setTargetMarkets] = useState(
    saved?.targetMarkets.map((market) => market.label) ?? [],
  );
  const [targetMarketHistory, setTargetMarketHistory] = useState(
    pageData.targetMarketSuggestions.map((market) => market.label),
  );
  const [initialBrief, setInitialBrief] = useState(saved?.initialBrief ?? "");
  const [businessObjectives, setBusinessObjectives] = useState(
    saved?.businessObjectives ?? "",
  );
  const [collaborators, setCollaborators] = useState(pageData.availableCollaborators);
  const [collaboratorIds, setCollaboratorIds] = useState(
    saved?.collaboratorIds ?? pageData.projectCollaboratorIds,
  );
  const [deliverables, setDeliverables] = useState(saved?.deliverables ?? []);
  const [deliverableHistory, setDeliverableHistory] = useState(
    pageData.deliverableSuggestions,
  );
  const [inquiryDate, setInquiryDate] = useState(saved?.inquiryDate || getTodayDateValue());
  const [deadline, setDeadline] = useState(saved?.deadline ?? "");
  const [legalNotes, setLegalNotes] = useState(saved?.legalNotes ?? "");
  const [priority, setPriority] = useState<ProjectInquiryPriority | "">(
    saved?.priority ?? "",
  );
  const [attachments, setAttachments] = useState(() =>
    saved?.attachments ?? {
      INITIAL_BRIEF: [],
      BUSINESS_OBJECTIVES: [],
      LEGAL_NOTES: [],
    },
  );
  const [fieldErrors, setFieldErrors] = useState<ProjectInquiryFieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [contactTarget, setContactTarget] = useState<PartyField | null>(null);
  const [contactForm, setContactForm] = useState<ProjectContactForm>(getDefaultContactForm);
  const [contactErrors, setContactErrors] = useState<Partial<Record<keyof ProjectContactForm, string>>>({});
  const [contactError, setContactError] = useState<string>();
  const [contactSaving, setContactSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<CollaboratorForm>(getDefaultCollaboratorForm);
  const [inviteError, setInviteError] = useState<string>();
  const [inviteSaving, setInviteSaving] = useState(false);
  const collaboratorOptions = useMemo(
    () => collaborators.map(toUserOption),
    [collaborators],
  );
  const targetMarketSuggestions = useMemo(
    () =>
      Array.from(
        new Set([
          ...pageData.countryOptions,
          ...targetMarketHistory,
        ]),
      ),
    [pageData.countryOptions, targetMarketHistory],
  );
  const loadPartyOptions = useCallback(
    async (query: string) => {
      try {
        const options = await searchProjectInquiryPartyOptionsAction(
          project.id,
          query,
        );
        setPartyOptions((current) => {
          const merged = new Map(
            current.map((option) => [`${option.source}:${option.id}`, option]),
          );
          for (const option of options) {
            merged.set(`${option.source}:${option.id}`, option);
          }
          return [...merged.values()];
        });
      } catch {
        showErrorToast("Unable to load directory results.");
      }
    },
    [project.id],
  );
  const loadTargetMarketHistory = useCallback(
    async (query: string) => {
      try {
        const suggestions = await searchProjectInquiryHistorySuggestionsAction(
          project.id,
          "target-market",
          query,
        );
        setTargetMarketHistory(suggestions);
      } catch {
        showErrorToast("Unable to load target-market history.");
      }
    },
    [project.id],
  );
  const loadDeliverableHistory = useCallback(
    async (query: string) => {
      try {
        const suggestions = await searchProjectInquiryHistorySuggestionsAction(
          project.id,
          "deliverable",
          query,
        );
        setDeliverableHistory(suggestions);
      } catch {
        showErrorToast("Unable to load deliverable history.");
      }
    },
    [project.id],
  );

  function clearFieldError(field: keyof ProjectInquiryFieldErrors) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(undefined);
  }

  function openContactDialog(target: PartyField) {
    if (!pageData.canEdit) return;
    setContactTarget(target);
    setContactForm(getDefaultContactForm());
    setContactErrors({});
    setContactError(undefined);
  }

  async function handleCreateContact() {
    if (!contactTarget) return;
    const validation = validateProjectContactInput(contactForm);

    if (Object.keys(validation.fieldErrors).length > 0) {
      setContactErrors(validation.fieldErrors);
      setContactError("Review the highlighted contact fields.");
      return;
    }

    setContactSaving(true);
    setContactError(undefined);
    setContactErrors({});
    try {
      const result = await createContactDirectoryEntryAction(project.id, validation.data);
      if ("error" in result) {
        setContactError(result.error);
        setContactErrors(result.fieldErrors ?? {});
        return;
      }
      setPartyOptions((current) => [...current, result.contact]);
      if (contactTarget === "client") {
        setClient(result.contact);
        clearFieldError("client");
      } else {
        setFinalBeneficiary(result.contact);
        clearFieldError("finalBeneficiary");
      }
      setContactTarget(null);
      showSuccessToast("Contact saved to the directory.");
    } catch {
      setContactError("Unable to save the contact right now. Please try again.");
    } finally {
      setContactSaving(false);
    }
  }

  function openInviteDialog() {
    if (!pageData.canInviteCollaborator) {
      showWarningToast(
        "Invitation unavailable.",
        "You do not have permission to invite collaborators.",
      );
      return;
    }
    setInviteForm(getDefaultCollaboratorForm());
    setInviteError(undefined);
    setInviteOpen(true);
  }

  async function handleInviteCollaborator() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      setInviteError("Enter both collaborator name and email.");
      return;
    }
    setInviteSaving(true);
    setInviteError(undefined);
    try {
      const result = await saveCollaboratorAction({
        ...inviteForm,
        allowExistingUser: true,
      });
      if ("error" in result) {
        setInviteError(result.error);
        return;
      }
      setCollaborators((current) => upsertCollaborator(current, result.collaborator));
      setCollaboratorIds((current) =>
        current.includes(result.collaborator.id)
          ? current
          : [...current, result.collaborator.id],
      );
      clearFieldError("collaboratorIds");
      setInviteOpen(false);
      showSuccessToast("Collaborator invited and selected.");
      if (result.warning) showWarningToast("Collaborator saved with a warning.", result.warning);
    } catch {
      setInviteError("Unable to invite the collaborator right now. Please try again.");
    } finally {
      setInviteSaving(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pageData.canEdit || submitting) return;
    const nextErrors: ProjectInquiryFieldErrors = {};
    if (!client) nextErrors.client = "Select a client.";
    if (!finalBeneficiary) nextErrors.finalBeneficiary = "Select a final beneficiary.";
    setFieldErrors(nextErrors);
    setFormError(undefined);
    if (Object.keys(nextErrors).length) {
      showErrorToast("Review the highlighted fields.");
      return;
    }

    const input: CompleteProjectInquiryInput = {
      projectId: project.id,
      client: client ? { source: client.source, id: client.id } : null,
      finalBeneficiary: finalBeneficiary
        ? { source: finalBeneficiary.source, id: finalBeneficiary.id }
        : null,
      clientOrigin,
      targetMarkets: targetMarkets.map((label) => ({ label })),
      initialBrief,
      businessObjectives,
      collaboratorIds,
      deliverables,
      inquiryDate,
      deadline,
      legalNotes,
      priority: priority || null,
      attachmentIds: {
        INITIAL_BRIEF: attachments.INITIAL_BRIEF.map((attachment) => attachment.id),
        BUSINESS_OBJECTIVES: attachments.BUSINESS_OBJECTIVES.map((attachment) => attachment.id),
        LEGAL_NOTES: attachments.LEGAL_NOTES.map((attachment) => attachment.id),
      },
    };

    startSubmitting(async () => {
      const result = await completeProjectInquiryAction(input);
      if ("error" in result) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        showErrorToast("Unable to complete Project Inquiry.", result.error);
        return;
      }
      showSuccessToast("Project Inquiry completed.", "Stage 2 is now available.");
      router.push(`/projects/${project.id}/stages/2`);
      router.refresh();
    });
  }

  const readOnly = !pageData.canEdit;

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      {showChrome ? (
        <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      ) : null}

      {showChrome ? (
        <div className="flex items-center gap-2 text-[12px] font-[750] uppercase tracking-[0.12em] text-[#4d765d]">
          <FileText className="h-4 w-4" />
          Project Inquiry
        </div>
      ) : null}
      <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center", showChrome ? "mt-3 sm:justify-between" : "mt-5 sm:justify-end")}>
        {showChrome ? (
          <h1 className="text-[30px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[36px]">
            Stage 1 - Project Inquiry
          </h1>
        ) : null}
        <div
          role="tablist"
          aria-label="Project Inquiry presentation mode"
          className="inline-grid w-fit grid-cols-2 rounded-[12px] border border-[#dce4dd] bg-white p-1 shadow-[0_8px_20px_rgba(23,39,28,0.04)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "edit"}
            aria-controls="stage-one-edit-panel"
            disabled={!pageData.canEdit}
            onClick={() => setMode("edit")}
            className={cn(
              "min-w-[72px] rounded-[9px] px-3 py-2 text-[12px] font-[700] transition",
              mode === "edit"
                ? "bg-[#eaf4ec] text-[#236945]"
                : "text-[#6f7a72] hover:bg-[#f4f7f4]",
              !pageData.canEdit && "cursor-not-allowed opacity-40",
            )}
          >
            Edit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "view"}
            aria-controls="stage-one-view-panel"
            onClick={() => setMode("view")}
            className={cn(
              "min-w-[72px] rounded-[9px] px-3 py-2 text-[12px] font-[700] transition",
              mode === "view"
                ? "bg-[#eaf4ec] text-[#236945]"
                : "text-[#6f7a72] hover:bg-[#f4f7f4]",
            )}
          >
            View
          </button>
        </div>
      </div>
      {showChrome ? (
        <ProjectFlowSummaryStrip project={project} className="mt-5" />
      ) : null}

      {mode === "view" ? (
        <StageOneReadOnlyView
          projectId={project.id}
          inquiry={saved}
          availableCollaborators={pageData.availableCollaborators}
          canEdit={pageData.canEdit}
        />
      ) : (
        <Card
          id="stage-one-edit-panel"
          role="tabpanel"
          aria-label="Edit Project Inquiry"
          className="mt-6 rounded-[22px] border-[#dde5de] shadow-[0_18px_44px_rgba(23,39,28,0.055)]"
        >
        <CardContent className="px-5 py-6 sm:px-7 sm:py-7 lg:px-8">
          {!pageData.canEdit ? (
            <div className="mb-6 rounded-[15px] border border-[#dce4dd] bg-[#f4f7f4] px-4 py-3 text-[13px] text-[#536057]">
              You can view this inquiry, but you do not have permission to change it.
            </div>
          ) : null}
          {formError ? (
            <div className="mb-6 rounded-[15px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#ae4742]">
              {formError}
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
              <StageOneFormField label="Client Name" required error={fieldErrors.client}>
                <PartySelector
                  ariaLabel="Client name"
                  placeholder="Search or select client"
                  options={partyOptions}
                  value={client}
                  disabled={readOnly || submitting}
                  error={fieldErrors.client}
                  onSearch={loadPartyOptions}
                  onChange={(value) => {
                    setClient(value);
                    clearFieldError("client");
                  }}
                />
                {!readOnly ? (
                  <button type="button" onClick={() => openContactDialog("client")} className="-ml-1 mt-1.5 cursor-pointer rounded-[6px] px-1 py-0.5 text-[12px] font-[650] text-[#2d7b51] transition-colors hover:bg-[#eaf4ed] hover:text-[#185d3a] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8057] focus-visible:ring-offset-2">
                    Add manually
                  </button>
                ) : null}
              </StageOneFormField>

              <StageOneFormField label="External / Internal - for execution" error={fieldErrors.clientOrigin}>
                <div role="group" aria-label="External or internal project" className="grid h-12 grid-cols-2 overflow-hidden rounded-[14px] border border-[#dce3dc] bg-white p-1">
                  {(["EXTERNAL", "INTERNAL"] as const).map((option) => {
                    const selected = clientOrigin === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={readOnly || submitting}
                        aria-pressed={selected}
                        onClick={() => {
                          setClientOrigin(option);
                          clearFieldError("clientOrigin");
                        }}
                        className={cn(
                          "rounded-[10px] text-[13px] font-[680] capitalize transition disabled:cursor-not-allowed",
                          selected
                            ? "bg-[linear-gradient(90deg,#2f8d5d,#1a6341)] text-white shadow-[0_8px_18px_rgba(35,113,73,0.16)]"
                            : "text-[#5e6961] hover:bg-[#f3f7f3]",
                        )}
                      >
                        {option.toLocaleLowerCase("en")}
                      </button>
                    );
                  })}
                </div>
              </StageOneFormField>

              <StageOneFormField label="Final Beneficiary" required error={fieldErrors.finalBeneficiary}>
                <PartySelector
                  ariaLabel="Final beneficiary"
                  placeholder="Search or select beneficiary"
                  options={partyOptions}
                  value={finalBeneficiary}
                  disabled={readOnly || submitting}
                  error={fieldErrors.finalBeneficiary}
                  onSearch={loadPartyOptions}
                  onChange={(value) => {
                    setFinalBeneficiary(value);
                    clearFieldError("finalBeneficiary");
                  }}
                />
                {!readOnly ? (
                  <button type="button" onClick={() => openContactDialog("finalBeneficiary")} className="-ml-1 mt-1.5 cursor-pointer rounded-[6px] px-1 py-0.5 text-[12px] font-[650] text-[#2d7b51] transition-colors hover:bg-[#eaf4ed] hover:text-[#185d3a] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8057] focus-visible:ring-offset-2">
                    Add manually
                  </button>
                ) : null}
              </StageOneFormField>

              <StageOneFormField label="Target Market" error={fieldErrors.targetMarkets}>
                <MultiEntryInput
                  ariaLabel="Add target market"
                  values={targetMarkets}
                  suggestions={targetMarketSuggestions}
                  placeholder="Countries or regions"
                  disabled={readOnly || submitting}
                  error={fieldErrors.targetMarkets}
                  onSearchSuggestions={loadTargetMarketHistory}
                  onChange={(values) => {
                    setTargetMarkets(values);
                    clearFieldError("targetMarkets");
                  }}
                />
                {!readOnly ? <p className="mt-2 text-[11px] text-[#718078]">Choose a country or type a custom region.</p> : null}
              </StageOneFormField>

              <StageOneFormField label="Initial Brief" error={fieldErrors.initialBrief || fieldErrors.attachments}>
                <AttachmentTextarea
                  projectId={project.id}
                  field={attachmentFields.initialBrief}
                  ariaLabel="Initial brief"
                  placeholder="Provide an overview or background of the project"
                  value={initialBrief}
                  attachments={attachments.INITIAL_BRIEF}
                  disabled={readOnly || submitting}
                  error={fieldErrors.initialBrief || fieldErrors.attachments}
                  onValueChange={(value) => {
                    setInitialBrief(value);
                    clearFieldError("initialBrief");
                  }}
                  onAttachmentsChange={(files) => setAttachments((current) => ({ ...current, INITIAL_BRIEF: files }))}
                />
              </StageOneFormField>

              <StageOneFormField label="Key Business Objectives" error={fieldErrors.businessObjectives || fieldErrors.attachments}>
                <AttachmentTextarea
                  projectId={project.id}
                  field={attachmentFields.businessObjectives}
                  ariaLabel="Key business objectives"
                  placeholder="Outline the key goals and objectives of this project"
                  value={businessObjectives}
                  attachments={attachments.BUSINESS_OBJECTIVES}
                  disabled={readOnly || submitting}
                  error={fieldErrors.businessObjectives || fieldErrors.attachments}
                  entryMode="business-objectives"
                  onValueChange={(value) => {
                    setBusinessObjectives(value);
                    clearFieldError("businessObjectives");
                  }}
                  onAttachmentsChange={(files) => setAttachments((current) => ({ ...current, BUSINESS_OBJECTIVES: files }))}
                />
                {!readOnly ? (
                  <p className="mt-2 text-[11px] text-[#718078]">
                    Add each objective separately. Type an objective and press Enter to add it.
                  </p>
                ) : null}
              </StageOneFormField>

              <StageOneFormField label="Collaborators" error={fieldErrors.collaboratorIds}>
                <div className={cn((readOnly || submitting) && "pointer-events-none opacity-70")}>
                  <ProjectUserSelector
                    users={collaboratorOptions}
                    selectedIds={collaboratorIds}
                    onChange={(ids) => {
                      setCollaboratorIds(ids);
                      clearFieldError("collaboratorIds");
                    }}
                    mode="multiple"
                    placeholder="Search or select collaborators"
                    ariaLabel="Collaborators"
                    error={fieldErrors.collaboratorIds}
                  />
                </div>
                {!readOnly ? (
                  <button type="button" disabled={submitting} onClick={openInviteDialog} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-[650] text-[#2d7b51] hover:text-[#185d3a] disabled:opacity-50">
                    <UserPlus className="h-3.5 w-3.5" />
                    Invite collaborator
                  </button>
                ) : null}
              </StageOneFormField>

              <StageOneFormField label="Deliverables" error={fieldErrors.deliverables}>
                <MultiEntryInput
                  ariaLabel="Add deliverable"
                  values={deliverables}
                  suggestions={deliverableHistory}
                  placeholder="Add deliverables"
                  disabled={readOnly || submitting}
                  error={fieldErrors.deliverables}
                  onSearchSuggestions={loadDeliverableHistory}
                  onChange={(values) => {
                    setDeliverables(values);
                    clearFieldError("deliverables");
                  }}
                />
                {!readOnly ? (
                  <p className="mt-2 text-[11px] text-[#718078]">
                    Select a previous value, or type a new deliverable and press Enter to add it.
                  </p>
                ) : null}
              </StageOneFormField>

              <StageOneFormField label="Date" error={fieldErrors.inquiryDate}>
                <AppDatePicker value={inquiryDate} onChange={(value) => { setInquiryDate(value); clearFieldError("inquiryDate"); }} disabled={readOnly || submitting} placeholder="Select date" triggerClassName="h-12 w-full justify-between rounded-[14px] border border-[#dce3dc] bg-white px-4 text-left text-[13px] font-normal text-[#263029] shadow-none hover:bg-white" />
              </StageOneFormField>

              <StageOneFormField label="Deadline" error={fieldErrors.deadline}>
                <AppDatePicker value={deadline} onChange={(value) => { setDeadline(value); clearFieldError("deadline"); }} disabled={readOnly || submitting} placeholder="Select deadline" triggerClassName="h-12 w-full justify-between rounded-[14px] border border-[#dce3dc] bg-white px-4 text-left text-[13px] font-normal text-[#263029] shadow-none hover:bg-white" />
              </StageOneFormField>

              <StageOneFormField label="Legal Notes" error={fieldErrors.legalNotes || fieldErrors.attachments}>
                <AttachmentTextarea
                  projectId={project.id}
                  field={attachmentFields.legalNotes}
                  ariaLabel="Legal notes"
                  placeholder="Add any legal requirements or special considerations"
                  value={legalNotes}
                  attachments={attachments.LEGAL_NOTES}
                  disabled={readOnly || submitting}
                  error={fieldErrors.legalNotes || fieldErrors.attachments}
                  onValueChange={(value) => { setLegalNotes(value); clearFieldError("legalNotes"); }}
                  onAttachmentsChange={(files) => setAttachments((current) => ({ ...current, LEGAL_NOTES: files }))}
                />
              </StageOneFormField>

              <StageOneFormField label="Priority" error={fieldErrors.priority}>
                <Select disabled={readOnly || submitting} value={priority} onValueChange={(value) => { setPriority(value as ProjectInquiryPriority); clearFieldError("priority"); }}>
                  <SelectTrigger className="h-12 rounded-[14px] border-[#dce3dc] bg-white px-4 shadow-none">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </StageOneFormField>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-[#edf1ed] pt-6 sm:flex-row sm:items-center">
              {pageData.canEdit ? (
                <Button type="submit" disabled={submitting} className="min-w-[170px] rounded-[13px]">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? "Completing..." : "Next Stage"}
                  {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              ) : null}
              <Button asChild type="button" variant="outline" className="min-w-[150px] rounded-[13px] shadow-none">
                <Link href={`/projects/${project.id}`}>
                  <ListChecks className="h-4 w-4" />
                  All Stages
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
        </Card>
      )}

      <ProjectContactDialog
        isOpen={contactTarget !== null}
        title={contactTarget === "client" ? "Add client manually" : "Add final beneficiary manually"}
        form={contactForm}
        fieldErrors={contactErrors}
        error={contactError}
        saving={contactSaving}
        onClose={() => { if (!contactSaving) setContactTarget(null); }}
        onSubmit={() => void handleCreateContact()}
        onChange={(field, value) => {
          setContactForm((current) => ({ ...current, [field]: value }));
          setContactErrors((current) => ({ ...current, [field]: undefined }));
          setContactError(undefined);
        }}
      />

      <CollaboratorDialog
        isOpen={inviteOpen}
        mode="invite"
        form={inviteForm}
        error={inviteError}
        saving={inviteSaving}
        onClose={() => { if (!inviteSaving) setInviteOpen(false); }}
        onSubmit={() => void handleInviteCollaborator()}
        onChange={(field, value) => {
          setInviteForm((current) => ({ ...current, [field]: value }));
          setInviteError(undefined);
        }}
      />
    </section>
  );
}

export function StageOneLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Skeleton className="h-4 w-32 rounded-full" />
      <Skeleton className="mt-4 h-10 w-full max-w-[460px] rounded-[12px]" />
      <Skeleton className="mt-6 h-[96px] w-full rounded-[20px]" />
      <Card className="mt-6 rounded-[22px] border-[#dde5de] shadow-none">
        <CardContent className="grid gap-x-10 gap-y-6 px-5 py-6 sm:px-7 lg:grid-cols-2 lg:px-8">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3.5 w-32 rounded-full" />
              <Skeleton className={cn("mt-2 w-full rounded-[14px]", index === 4 || index === 5 || index === 10 ? "h-[104px]" : "h-12")} />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
