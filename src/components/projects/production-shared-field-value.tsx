"use client";

import { RichTextContent } from "@/components/ui/rich-text-editor";
import { isRichTextEmpty } from "@/lib/rich-text";

export function ProductionSharedFieldValue({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return <p>Not provided</p>;
  }

  const record = value as {
    text?: unknown;
    values?: unknown;
    included?: unknown;
  };
  const text =
    typeof record.text === "string" && !isRichTextEmpty(record.text)
      ? record.text
      : null;
  const values = Array.isArray(record.values)
    ? record.values.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
  const included = record.included === true;

  if (!text && values.length === 0 && !included) {
    return <p>Not provided</p>;
  }

  return (
    <div className="space-y-1">
      {text ? <RichTextContent value={text} className="break-words" /> : null}
      {values.length > 0 ? <p className="break-words">{values.join(", ")}</p> : null}
      {included ? <p>Included</p> : null}
    </div>
  );
}
