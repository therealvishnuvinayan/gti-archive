"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProjectTagColors,
  MAX_PROJECT_TAGS,
  validateProjectTags,
} from "@/lib/project-tags";

export function ProjectTagInput({
  tags,
  draft,
  onChange,
  onDraftChange,
  error,
  onError,
  disabled,
}: {
  tags: string[];
  draft: string;
  onChange: (tags: string[]) => void;
  onDraftChange: (value: string) => void;
  error?: string;
  onError: (error?: string) => void;
  disabled: boolean;
}) {
  const colors = getProjectTagColors(tags);
  function addTag() {
    const result = validateProjectTags([...tags, draft]);
    if (!result.tags) {
      onError(result.error);
      return;
    }
    onChange(result.tags);
    onDraftChange("");
    onError(undefined);
  }
  return (
    <div>
      <div className="flex gap-2">
        <Input
          id="project-tags"
          value={draft}
          onChange={(event) => {
            onDraftChange(event.target.value);
            onError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder={
            tags.length >= MAX_PROJECT_TAGS
              ? "Four tags added"
              : "Type a tag and press Enter"
          }
          disabled={disabled || tags.length >= MAX_PROJECT_TAGS}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={`project-tags-help${error ? " project-tags-error" : ""}`}
          className={`h-[54px] min-w-0 rounded-[16px] px-4 text-[14px] ${error ? "border-[#c85c54]" : "border-[#d9e0d9]"}`}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !draft.trim() || tags.length >= MAX_PROJECT_TAGS}
          onClick={addTag}
          className="h-[54px] rounded-[16px]"
        >
          Add tag
        </Button>
      </div>
      {tags.length ? (
        <div aria-label="Selected project tags" className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <span
              key={tag}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-[12px] font-semibold ${colors[index]}`}
            >
              <span className="min-w-0 break-words">{tag}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  onChange(tags.filter((_, position) => position !== index));
                  onError(undefined);
                }}
                className="shrink-0 rounded-full p-1 hover:bg-black/5 disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <p id="project-tags-help" className="mt-2 text-[12px] text-[#768078]">
        Add 1–4 tags. Use any tag name. {tags.length}/{MAX_PROJECT_TAGS} added.
      </p>
      {error ? (
        <p id="project-tags-error" role="alert" className="mt-1.5 text-[12px] text-[#b84e48]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
