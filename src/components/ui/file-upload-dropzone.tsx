"use client";

import { useRef, useState, type DragEvent, type RefObject } from "react";
import { Paperclip, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileSelectionOptions = {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  accept?: string;
  onRejected?: (message: string) => void;
};

export function matchesFileAccept(file: File, accept?: string) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return accept.split(",").some((value) => {
    const format = value.trim().toLowerCase();
    if (!format) return false;
    if (format.startsWith(".")) return name.endsWith(format);
    if (format.endsWith("/*")) return mime.startsWith(format.slice(0, -1));
    return mime === format;
  });
}

// Also used by larger upload surfaces, so nested folder tiles and chat composers
// use the same file-only drop handling without interfering with internal drags.
export function useFileDrop({ onFilesSelected, multiple = false, disabled = false, accept, onRejected }: FileSelectionOptions) {
  const depth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  function selectFiles(files: File[] | FileList | null) {
    if (disabled) return;
    setError("");
    const selected = Array.from(files ?? []);
    const rejected = selected.filter((file) => !matchesFileAccept(file, accept));
    if (rejected.length) {
      const message = `Unsupported file format: ${rejected.map((file) => file.name).join(", ")}. Supported: ${accept}.`;
      setError(message);
      onRejected?.(message);
    }
    const accepted = selected.filter((file) => matchesFileAccept(file, accept));
    if (accepted.length) onFilesSelected(multiple ? accepted : accepted.slice(0, 1));
  }

  function isFileDrag(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  const dragProps = {
    onDragEnter(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      depth.current += 1;
      setIsDragging(true);
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setIsDragging(false);
    },
    onDrop(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setIsDragging(false);
      selectFiles(event.dataTransfer.files);
    },
  };
  return { dragProps, isDragging: isDragging && !disabled, error, selectFiles };
}

export function FileDropOverlay({ label = "Drop files here" }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[#2b8056] bg-[#eef7ef]/95 p-4 text-center text-[#216643]" aria-hidden="true">
      <UploadCloud className="size-7" />
      <p className="mt-2 text-[13px] font-[700]">{label}</p>
    </div>
  );
}

export function FileUploadDropzone({
  label = "Attachments",
  description,
  buttonLabel,
  compact = false,
  className,
  inputRef: externalInputRef,
  ...options
}: FileSelectionOptions & {
  label?: string;
  description?: string;
  buttonLabel?: string;
  compact?: boolean;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? ownInputRef;
  const { dragProps, isDragging, error, selectFiles } = useFileDrop(options);
  const plural = options.multiple ? "files" : "file";

  return (
    <div className={cn("min-w-0", className)}>
      <div
        {...dragProps}
        data-file-upload-dropzone
        aria-label={`${label} upload area`}
        aria-disabled={options.disabled || undefined}
        className={cn(
          "flex min-w-0 gap-3 rounded-[16px] border border-dashed px-4 py-3 transition-colors",
          compact ? "min-h-20 flex-wrap items-center" : "min-h-[140px] flex-col items-center justify-center text-center",
          isDragging ? "border-[#2b8056] bg-[#eef7ef] ring-2 ring-[#2b8056]/15" : "border-[#bfcfc3] bg-[#fbfdfb]",
          options.disabled && "opacity-60",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#e7f2ea] text-[#2f8057]">
          <UploadCloud className="size-4" />
        </span>
        <div className={cn("min-w-0", compact && "flex-1")}>
          <p className="break-words text-[12px] font-[700] text-[#2b3730]">{label}</p>
          <p className="mt-0.5 text-[11px] text-[#748078]">{isDragging ? `Drop ${plural} here` : `Drag & drop ${plural} here or use Attach`}</p>
          {description ? <p className="mt-1 break-words text-[11px] text-[#748078]">{description}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={options.disabled}
          aria-label={`${buttonLabel ?? `Attach ${plural}`} — ${label}`}
          onClick={() => inputRef.current?.click()}
          className="max-w-full shrink-0 whitespace-normal rounded-[10px] border-[#cfdad1] bg-white text-[11px] text-[#356d4e]"
        >
          <Paperclip className="size-3.5" />{buttonLabel ?? `Attach ${plural}`}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={options.accept}
          multiple={options.multiple}
          disabled={options.disabled}
          aria-label={`Choose ${plural} for ${label}`}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            selectFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {error ? <p role="alert" className="mt-2 break-words text-[11px] text-[#b5483f]">{error}</p> : null}
    </div>
  );
}
