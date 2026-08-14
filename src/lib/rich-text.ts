import sanitizeHtml from "sanitize-html";

const EMPTY_EDITOR_VALUES = new Set(["", "<p></p>", "<p><br></p>"]);
const HTML_PATTERN = /<([a-z][\w-]*)\b[^>]*>/i;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "hr",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    p: ["style"],
    h2: ["style"],
    h3: ["style"],
  },
  allowedStyles: {
    "*": {
      "text-align": [/^left$/, /^center$/, /^right$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
  },
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainTextToHtml(value: string) {
  return value
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export function sanitizeRichText(value: string | null | undefined) {
  const source = value?.trim() ?? "";
  if (!source) return "";

  const html = HTML_PATTERN.test(source) ? source : plainTextToHtml(source);
  const sanitized = sanitizeHtml(html, SANITIZE_OPTIONS).trim();

  return EMPTY_EDITOR_VALUES.has(sanitized) ? "" : sanitized;
}

export function richTextToPlainText(value: string | null | undefined) {
  const html = sanitizeRichText(value);
  if (!html) return "";

  return sanitizeHtml(
    html
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|h2|h3|li|blockquote|pre)>/gi, "\n"),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isRichTextEmpty(value: string | null | undefined) {
  return richTextToPlainText(value).length === 0;
}
