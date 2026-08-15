import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  packageJson,
  editor,
  sanitizer,
  stageOne,
  stageOneView,
  concept,
  stageFive,
  stageSix,
  stageSeven,
  chat,
] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("src/components/ui/rich-text-editor.tsx", "utf8"),
  readFile("src/lib/rich-text.ts", "utf8"),
  readFile("src/components/projects/stage-one-workspace.tsx", "utf8"),
  readFile("src/components/projects/stage-one-read-only-view.tsx", "utf8"),
  readFile("src/components/projects/concept-stage-workspace.tsx", "utf8"),
  readFile("src/components/projects/stage-five-workspace.tsx", "utf8"),
  readFile("src/components/projects/stage-six-workspace.tsx", "utf8"),
  readFile("src/components/projects/stage-seven-workspace.tsx", "utf8"),
  readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
]);

for (const dependency of [
  "@tiptap/react",
  "@tiptap/pm",
  "@tiptap/starter-kit",
  "@tiptap/extension-text-align",
  "sanitize-html",
]) {
  assert(packageJson.includes(`"${dependency}"`), `Missing rich-text dependency: ${dependency}`);
}

for (const capability of [
  "immediatelyRender: false",
  "toggleBold()",
  "toggleItalic()",
  "toggleUnderline()",
  "toggleStrike()",
  "toggleBulletList()",
  "toggleOrderedList()",
  "toggleBlockquote()",
  'setTextAlign("center")',
  "setLink({ href })",
  "insertContent(emoji)",
  "CharacterCount.configure",
]) {
  assert(editor.includes(capability), `Missing editor capability: ${capability}`);
}

assert(
  sanitizer.includes('allowedSchemes: ["http", "https", "mailto", "tel"]') &&
    sanitizer.includes('rel: "noopener noreferrer"') &&
    sanitizer.includes("allowedTags") &&
    sanitizer.includes("richTextToPlainText"),
  "Rich text must use a restricted server-safe HTML allow-list and safe external links.",
);

assert(
  editor.includes("w-full min-w-0 max-w-full overflow-visible") &&
    editor.includes("overflow-x-auto overscroll-x-contain") &&
    editor.includes("[overflow-wrap:anywhere]"),
  "The shared rich-text editor must contain its toolbar and long content inside narrow forms.",
);

assert(
  [stageOne, concept, stageFive, stageSix, stageSeven, chat].every((source) =>
    source.includes("RichTextEditor"),
  ),
  "All project brief, checklist, production, sample, and revision prose flows must use the shared editor.",
);

assert(
  stageOneView.includes("RichTextContent") &&
    stageFive.includes("RichTextContent") &&
    stageSeven.includes("RichTextContent") &&
    chat.includes("RichTextContent"),
  "Saved rich text must use the shared sanitized renderer in read-only workflows.",
);

assert(
  chat.includes("<Textarea") &&
    chat.includes("draftInputRef") &&
    !concept.includes("<Textarea") &&
    !stageOne.includes("<Textarea"),
  "Chat composition must remain a lightweight plain-text surface while descriptive project fields use rich text.",
);

console.log("Shared rich-text editor UI and safety checks passed.");
