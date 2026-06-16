"use client";

import { Check, Tags, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSET_TAG_LIMIT_ERROR,
  MAX_ASSET_TAGS,
  type AssetTagRecord,
} from "@/lib/asset-tags";

type AssetTagSelectorProps = {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  initialOptions?: AssetTagRecord[];
};

type AssetTagsResponse = {
  tags?: AssetTagRecord[];
  error?: string;
};

export function AssetTagSelector({
  value,
  onChange,
  disabled,
  initialOptions,
}: AssetTagSelectorProps) {
  const [fetchedOptions, setFetchedOptions] = useState<AssetTagRecord[]>([]);
  const [loading, setLoading] = useState(!initialOptions);
  const [error, setError] = useState<string>();
  const options = initialOptions ?? fetchedOptions;
  const selectedOptions = useMemo(
    () =>
      value
        .map((tagId) => options.find((option) => option.id === tagId))
        .filter((option): option is AssetTagRecord => Boolean(option)),
    [options, value],
  );

  useEffect(() => {
    if (initialOptions) {
      return;
    }

    let cancelled = false;

    async function loadAssetTags() {
      try {
        const response = await fetch("/api/asset-tags", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as AssetTagsResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load asset tags.");
        }

        if (!cancelled) {
          setFetchedOptions(payload.tags ?? []);
          setError(undefined);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load asset tags.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAssetTags().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [initialOptions]);

  function addTag(tagId: string) {
    if (!tagId) {
      return;
    }

    if (value.includes(tagId)) {
      removeTag(tagId);
      return;
    }

    if (value.length >= MAX_ASSET_TAGS) {
      setError(ASSET_TAG_LIMIT_ERROR);
      return;
    }

    onChange([...value, tagId]);
    setError(undefined);
  }

  function removeTag(tagId: string) {
    onChange(value.filter((selectedTagId) => selectedTagId !== tagId));
    setError(undefined);
  }

  return (
    <div>
      <span className="mb-2 flex items-center gap-1.5 text-[13px] font-[700] text-[#2d372f]">
        <Tags className="h-3.5 w-3.5 text-brand" />
        Asset Tags
      </span>
      <p className="mb-2 text-[12px] font-medium text-[#6f786f]">
        Select up to 5 tags.
      </p>

      {selectedOptions.length > 0 ? (
        <div className="mb-3 flex min-w-0 flex-wrap gap-2">
          {selectedOptions.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#cde6d3] bg-[#edf7ef] px-3 py-1.5 text-[12px] font-[700] text-[#2d8055]"
              style={
                tag.color
                  ? {
                      borderColor: `${tag.color}44`,
                      backgroundColor: `${tag.color}18`,
                      color: tag.color,
                    }
                  : undefined
              }
            >
              <span className="truncate">{tag.name}</span>
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                disabled={disabled}
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Remove ${tag.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Select
        key={`asset-tags-${value.join("\u001f") || "empty"}-${options.length}`}
        value=""
        onValueChange={addTag}
        disabled={disabled || loading || options.length === 0}
      >
        <SelectTrigger className="h-11 rounded-2xl border border-line">
          <SelectValue
            placeholder={
              loading
                ? "Loading asset tags..."
                : value.length >= MAX_ASSET_TAGS
                  ? "Maximum tags selected"
                  : options.length === 0
                    ? "No active asset tags"
                    : "Select asset tags"
            }
          />
        </SelectTrigger>
        <SelectContent className="z-[120]">
          {options.map((tag) => {
            const selected = value.includes(tag.id);

            return (
              <SelectItem key={tag.id} value={tag.id}>
                <span className="flex items-center gap-2">
                  <Check className={`h-3.5 w-3.5 ${selected ? "opacity-100" : "opacity-0"}`} />
                  <span>{tag.name}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {error ? (
        <p className="mt-2 text-[12px] font-[600] text-[#bb4d49]">{error}</p>
      ) : null}
    </div>
  );
}
