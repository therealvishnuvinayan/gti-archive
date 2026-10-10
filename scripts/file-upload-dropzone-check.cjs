/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (["react", "react/jsx-runtime", "lucide-react"].includes(name)) return require(name);
    if (name.startsWith("@/components/")) return new Proxy({}, { get: (_, key) => key });
    throw new Error(`Unmocked dependency: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}

function harness() {
  let cursor = 0;
  const slots = [];
  return {
    render(component, props) { cursor = 0; return component(props); },
    react: {
      ...React,
      useTransition: () => [false, (callback) => callback()],
      useRef(value) { const id = cursor++; return slots[id] ??= { current: value }; },
      useState(value) {
        const id = cursor++;
        if (!(id in slots)) slots[id] = typeof value === "function" ? value() : value;
        return [slots[id], (next) => { slots[id] = typeof next === "function" ? next(slots[id]) : next; }];
      },
    },
  };
}

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  return React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
}
const cn = (...values) => values.filter(Boolean).join(" ");
const pdf = new File(["pdf"], "REPORT.PDF", { type: "application/pdf" });
const doc = new File(["doc"], "brief.docx", { type: "application/octet-stream" });
const image = new File(["image"], "photo.png", { type: "image/png" });
const invalid = new File(["no"], "script.exe", { type: "application/octet-stream" });

function drag(files = [pdf, doc], types = ["Files"]) {
  return {
    dataTransfer: { files, types, dropEffect: "" },
    prevented: 0, stopped: 0,
    preventDefault() { this.prevented++; },
    stopPropagation() { this.stopped++; },
  };
}

function checkSharedControl() {
  const hooks = harness();
  const shared = load("src/components/ui/file-upload-dropzone.tsx", {
    react: hooks.react,
    "@/components/ui/button": { Button: "button" },
    "@/lib/utils": { cn },
  });
  assert(shared.matchesFileAccept(pdf, ".pdf"), "Extensions are case insensitive");
  assert(shared.matchesFileAccept(image, "image/*"));
  assert(shared.matchesFileAccept(doc, ".docx,application/pdf"), "Files with generic MIME still match their extension");
  assert(!shared.matchesFileAccept(invalid, ".pdf,.docx"));

  const selected = [], rejected = [];
  let browses = 0;
  const props = { label: "Test attachments", multiple: true, accept: ".pdf,.docx", onFilesSelected: (files) => selected.push(files), onRejected: (message) => rejected.push(message), inputRef: { current: { click() { browses++; } } } };
  const render = (overrides = {}) => elements(hooks.render(shared.FileUploadDropzone, { ...props, ...overrides }));
  let nodes = render();
  const root = () => nodes.find(({ props }) => props["data-file-upload-dropzone"] !== undefined);
  const input = () => nodes.find(({ type }) => type === "input");
  const button = () => nodes.find(({ type }) => type === "button");
  button().props.onClick();
  assert.equal(browses, 1, "The attach button opens the file chooser");
  assert.equal(button().props.type, "button", "Attaching does not submit the surrounding form");
  const target = { files: [pdf, doc], value: "chosen-files" };
  input().props.onChange({ currentTarget: target });
  assert.equal(target.value, "", "The same file can be selected again after removal or failure");
  root().props.onDrop(drag());
  assert.deepEqual(selected, [[pdf, doc], [pdf, doc]], "Drop and browse return exactly the same selection");

  root().props.onDragEnter(drag());
  root().props.onDragEnter(drag());
  root().props.onDragLeave(drag());
  nodes = render();
  assert(root().props.className.includes("ring-2"), "Moving over children keeps the drag highlight active");
  root().props.onDragLeave(drag()); nodes = render();
  assert(!root().props.className.includes("ring-2"), "Leaving the area clears the highlight");
  const drop = drag(); root().props.onDrop(drop);
  assert.equal(drop.prevented, 1, "File drops do not navigate away");
  assert.equal(drop.stopped, 1, "Nested targets do not upload the same file twice");
  const internal = drag([], ["application/x-folder"]); root().props.onDrop(internal);
  assert.equal(internal.prevented, 0, "Internal folder or text drags are preserved");

  root().props.onDrop(drag([invalid, pdf])); nodes = render();
  assert.equal(rejected.length, 1);
  assert.deepEqual(selected.at(-1), [pdf], "Supported files still work in a mixed selection");
  assert(nodes.some(({ props }) => props.role === "alert"), "Rejected formats have a visible error");
  input().props.onChange({ currentTarget: { files: [invalid], value: "" } });
  assert.equal(rejected.length, 2, "Browse and drop share format validation");

  const before = selected.length;
  nodes = render({ disabled: true });
  assert.equal(input().props.disabled, true); assert.equal(button().props.disabled, true);
  root().props.onDrop(drag()); input().props.onChange({ currentTarget: { files: [pdf], value: "" } });
  assert.equal(selected.length, before, "Disabled and read-only upload areas cannot select files");
  const disabledDrag = drag(); root().props.onDragOver(disabledDrag);
  assert.equal(disabledDrag.dataTransfer.dropEffect, "none");

  nodes = render({ multiple: false, disabled: false });
  root().props.onDrop(drag());
  assert.deepEqual(selected.at(-1), [pdf], "Single-file upload areas retain their single-file behavior");
  const html = renderToStaticMarkup(hooks.render(shared.FileUploadDropzone, props));
  assert(html.includes("Drag &amp; drop files")); assert(html.includes("Attach files"));
}

function checkAdapters() {
  const hooks = harness();
  const { ChecklistFilePicker } = load("src/components/projects/checklist-file-picker.tsx", { react: hooks.react, "@/lib/utils": { cn } });
  const previous = { id: "existing", name: "existing.pdf" };
  let result;
  const props = { fieldLabel: "Checklist evidence", files: [previous], multiple: true, onChange: (files) => { result = files; } };
  let area = elements(hooks.render(ChecklistFilePicker, props)).find(({ type }) => type === "FileUploadDropzone");
  area.props.onFilesSelected([pdf, doc]);
  assert.equal(result[0], previous);
  assert.deepEqual(result.slice(1).map(({ file }) => file), [pdf, doc]);
  area = elements(hooks.render(ChecklistFilePicker, { ...props, multiple: false })).find(({ type }) => type === "FileUploadDropzone");
  area.props.onFilesSelected([pdf]);
  assert.equal(result.length, 1); assert.equal(result[0].file, pdf);

  const milestoneProps = { mode: "edit", users: [], canUploadAttachments: true, initialMilestone: { name: "Brief", attachments: [] }, onClose() {}, onSave: async () => ({}) };
  // Use an independent state store for this component.
  const milestoneHooks = harness();
  const Dialog = load("src/components/projects/flexible-milestone-dialog.tsx", { react: milestoneHooks.react }).FlexibleMilestoneDialog;
  const render = () => elements(milestoneHooks.render(Dialog, milestoneProps));
  area = render().find(({ type }) => type === "FileUploadDropzone");
  area.props.onFilesSelected([pdf, doc]);
  area = render().find(({ type }) => type === "FileUploadDropzone");
  area.props.onFilesSelected([pdf]);
  assert.equal(render().filter(({ type, props }) => type === "button" && props["aria-label"]?.startsWith("Remove ")).length, 2, "Milestone drop and browse deduplicate repeated files");
}

function checkCoverage() {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".tsx")) files.push(file);
    }
  }
  walk("src");
  const inputs = files.filter((file) => /type\s*=\s*["']file["']/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(inputs, ["src/components/ui/file-upload-dropzone.tsx"], "Every native file chooser must go through the shared upload component");
  const consumers = files.filter((file) => file !== inputs[0] && /<FileUploadDropzone|useFileDrop\(/.test(fs.readFileSync(file, "utf8")));
  assert.equal(consumers.length, 16, "All upload areas identified in the audit use shared upload behavior");
}

checkSharedControl();
checkAdapters();
checkCoverage();
console.log("Shared upload checks passed: drag/browse parity, formats, multiple/single files, disabled uploads, nested drops, keyboard-ready attach buttons, checklist/milestone adapters, and all 16 upload consumers.");
