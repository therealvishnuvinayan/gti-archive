"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Smile,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import TextAlign from "@tiptap/extension-text-align";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { sanitizeRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

export { isRichTextEmpty, richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";

const EMOJIS = [
  "😀", "😊", "😂", "😍", "🥳", "😎", "🤔", "👍",
  "👏", "🙌", "🙏", "💪", "✅", "⭐", "🔥", "💡",
  "❤️", "🎉", "🚀", "📌", "📝", "📎", "👀", "🤝",
] as const;

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[8px] text-[#566159] transition hover:bg-[#e9f1eb] hover:text-[#246b48] disabled:cursor-not-allowed disabled:opacity-35",
        active && "bg-[#dfeee4] text-[#226b47]",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-[#dce3dc]" />;
}

export type RichTextEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  error?: boolean | string;
  required?: boolean;
  maxLength?: number;
  minHeightClassName?: string;
  className?: string;
  onBlur?: () => void;
};

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = "Write a description…",
  ariaLabel = "Rich text editor",
  disabled = false,
  error = false,
  required = false,
  maxLength,
  minHeightClassName = "min-h-[120px]",
  className,
  onBlur,
}: RichTextEditorProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const lastEmittedValue = useRef(value);
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
          defaultProtocol: "https",
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
          },
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure(maxLength ? { limit: maxLength } : {}),
    ],
    [maxLength, placeholder],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: sanitizeRichText(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        "aria-label": ariaLabel,
        "aria-required": String(required),
        "aria-invalid": String(Boolean(error)),
        class: cn(
          "rich-text-prose dashboard-scroll-thin w-full min-w-0 break-words px-4 py-3 text-[13px] leading-6 text-[#29322c] [overflow-wrap:anywhere] outline-none",
          minHeightClassName,
        ),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = currentEditor.isEmpty
        ? ""
        : sanitizeRichText(currentEditor.getHTML());
      lastEmittedValue.current = nextValue;
      onChange(nextValue);
    },
    onBlur,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const normalizedValue = sanitizeRichText(value);
    if (normalizedValue === lastEmittedValue.current) return;
    if (normalizedValue === sanitizeRichText(editor.getHTML())) return;

    editor.commands.setContent(normalizedValue, { emitUpdate: false });
    lastEmittedValue.current = normalizedValue;
  }, [editor, value]);

  function editLink() {
    if (!editor) return;
    const href = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(href ?? "");
    setEmojiOpen(false);
    setLinkOpen((current) => !current);
  }

  function applyLink() {
    if (!editor) return;
    const href = linkUrl.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  }

  const remainingCharacters = maxLength
    ? maxLength - (editor?.storage.characterCount.characters() ?? 0)
    : null;

  return (
    <div
      data-slot="rich-text-editor"
      className={cn(
        "relative w-full min-w-0 max-w-full overflow-visible rounded-[16px] border bg-white transition focus-within:ring-3 focus-within:ring-brand/15",
        error ? "border-[#c85c54]" : "border-[#d9e0d9] focus-within:border-[#7eac8e]",
        disabled && "bg-[#f6f8f6] opacity-70",
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label={`${ariaLabel} formatting`}
        className="dashboard-scroll-thin flex min-h-11 w-full min-w-0 max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain border-b border-[#e5eae5] bg-[#f9fbf9] px-2 py-1.5 first:rounded-t-[15px]"
      >
        <ToolbarButton label="Paragraph" active={editor?.isActive("paragraph")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().setParagraph().run()}><Pilcrow className="size-4" /></ToolbarButton>
        <ToolbarButton label="Heading" active={editor?.isActive("heading", { level: 2 })} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton label="Bold" active={editor?.isActive("bold")} disabled={disabled || !editor || !editor.can().chain().focus().toggleBold().run()} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
        <ToolbarButton label="Italic" active={editor?.isActive("italic")} disabled={disabled || !editor || !editor.can().chain().focus().toggleItalic().run()} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
        <ToolbarButton label="Underline" active={editor?.isActive("underline")} disabled={disabled || !editor || !editor.can().chain().focus().toggleUnderline().run()} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline className="size-4" /></ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor?.isActive("strike")} disabled={disabled || !editor || !editor.can().chain().focus().toggleStrike().run()} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></ToolbarButton>
        <ToolbarButton label="Inline code" active={editor?.isActive("code")} disabled={disabled || !editor || !editor.can().chain().focus().toggleCode().run()} onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 className="size-4" /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton label="Bulleted list" active={editor?.isActive("bulletList")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor?.isActive("orderedList")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolbarButton>
        <ToolbarButton label="Block quote" active={editor?.isActive("blockquote")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote className="size-4" /></ToolbarButton>
        <ToolbarButton label="Horizontal rule" disabled={disabled || !editor} onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus className="size-4" /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton label="Align left" active={editor?.isActive({ textAlign: "left" })} disabled={disabled || !editor} onClick={() => editor?.chain().focus().setTextAlign("left").run()}><AlignLeft className="size-4" /></ToolbarButton>
        <ToolbarButton label="Align center" active={editor?.isActive({ textAlign: "center" })} disabled={disabled || !editor} onClick={() => editor?.chain().focus().setTextAlign("center").run()}><AlignCenter className="size-4" /></ToolbarButton>
        <ToolbarButton label="Align right" active={editor?.isActive({ textAlign: "right" })} disabled={disabled || !editor} onClick={() => editor?.chain().focus().setTextAlign("right").run()}><AlignRight className="size-4" /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton label="Add or edit link" active={editor?.isActive("link")} disabled={disabled || !editor} onClick={editLink}><Link2 className="size-4" /></ToolbarButton>
        <ToolbarButton label="Add emoji" active={emojiOpen} disabled={disabled || !editor} onClick={() => { setLinkOpen(false); setEmojiOpen((current) => !current); }}><Smile className="size-4" /></ToolbarButton>
        <span className="flex-1" />
        <ToolbarButton label="Undo" disabled={disabled || !editor || !editor.can().chain().focus().undo().run()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 className="size-4" /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={disabled || !editor || !editor.can().chain().focus().redo().run()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 className="size-4" /></ToolbarButton>
      </div>

      {linkOpen ? (
        <div className="absolute left-2 top-[48px] z-50 flex w-[min(360px,calc(100%-16px))] items-center gap-2 rounded-[12px] border border-[#d8e2d9] bg-white p-2 shadow-[0_14px_36px_rgba(18,43,27,0.16)]">
          <input
            autoFocus
            type="url"
            value={linkUrl}
            placeholder="https://example.com"
            aria-label="Link URL"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); applyLink(); }
              if (event.key === "Escape") setLinkOpen(false);
            }}
            className="h-9 min-w-0 flex-1 rounded-[9px] border border-[#d8e1d8] px-3 text-[12px] outline-none focus:border-[#67a17b]"
          />
          <button type="button" onClick={applyLink} className="h-9 rounded-[9px] bg-[#2b8055] px-3 text-[11px] font-[700] text-white">Apply</button>
        </div>
      ) : null}

      {emojiOpen ? (
        <div className="absolute right-2 top-[48px] z-50 grid w-[232px] grid-cols-8 gap-1 rounded-[14px] border border-[#d8e2d9] bg-white p-2 shadow-[0_14px_36px_rgba(18,43,27,0.16)]" role="listbox" aria-label="Choose an emoji">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="option"
              aria-selected="false"
              aria-label={`Insert ${emoji}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor?.chain().focus().insertContent(emoji).run();
                setEmojiOpen(false);
              }}
              className="grid size-6 place-items-center rounded-[7px] text-[17px] hover:bg-[#edf4ef]"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      <EditorContent editor={editor} />
      {maxLength ? (
        <div className={cn("border-t border-[#edf0ed] px-3 py-1.5 text-right text-[10px] text-[#849087]", remainingCharacters !== null && remainingCharacters < 100 && "font-[650] text-[#b65a50]")}>{remainingCharacters ?? maxLength} characters remaining</div>
      ) : null}
    </div>
  );
}

export function RichTextContent({
  value,
  fallback,
  className,
}: {
  value: string | null | undefined;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const html = sanitizeRichText(value);

  if (!html) return fallback ?? null;

  return (
    <div
      data-slot="rich-text-content"
      className={cn("rich-text-prose", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
