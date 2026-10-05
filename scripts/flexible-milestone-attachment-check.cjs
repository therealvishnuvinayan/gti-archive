/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");

function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (["react", "react/jsx-runtime", "lucide-react", "node:crypto", "@prisma/client"].includes(name)) return require(name);
    if (name.startsWith("@/components/")) return new Proxy({}, { get: (_, key) => key });
    throw new Error(`Unmocked dependency: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

function hooks() {
  const states = [];
  let index = 0;
  return {
    states,
    render(Component, props) { index = 0; return Component(props); },
    react: {
      ...React,
      useState(initial) {
        const slot = index++;
        if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
        return [states[slot], (next) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
      },
      useRef: () => ({ current: null }),
      useTransition: () => [false, (callback) => callback()],
    },
  };
}

const validation = load("src/lib/upload-validation.ts");
const { uploadFlexibleMilestoneAttachments: upload } = load("src/lib/flexible-milestone-upload-client.ts", {
  "@/lib/upload-validation": validation,
});
const files = ["first.pdf", "second.docx", "third.xlsx"].map((name) => new File(["document"], name, { type: "application/pdf" }));
let calls = [], scenario = "success";
global.fetch = async (url, options) => {
  calls.push({ url, ...options });
  if (url.endsWith("/upload-url")) {
    const file = JSON.parse(options.body);
    if (file.originalFileName === files[1].name) {
      if (scenario === "prepare") return Response.json({ error: "No upload permission." }, { status: 400 });
      if (scenario === "invalid-json") return new Response("Service unavailable", { status: 503 });
      if (scenario === "network-prepare") throw new Error("Network unavailable");
    }
    return Response.json({ attachmentId: file.originalFileName, uploadUrl: `https://storage.test/${file.originalFileName}`, uploadExpectedHeaders: { "Content-Type": file.mimeType } });
  }
  if (options.method === "PUT") {
    if (url.endsWith(files[1].name)) {
      if (["put", "cleanup"].includes(scenario)) return new Response(null, { status: 403 });
      if (scenario === "network-put") throw new Error("Storage connection failed");
    }
    return new Response(null, { status: 200 });
  }
  const completion = JSON.parse(options.body);
  if (completion.attachmentId === files[1].name) {
    if (scenario === "cleanup") throw new Error("Cleanup failed");
    if (scenario === "complete") return Response.json({ error: "Uploaded file size does not match." }, { status: 400 });
    if (scenario === "network-complete") throw new Error("Completion connection failed");
  }
  return Response.json({ success: true });
};

async function checkClient() {
  let result = await upload("project/id", "milestone/id", files);
  assert.deepEqual(result.failedFiles, []);
  assert.equal(result.error, undefined);
  assert.equal(calls.length, 9);
  assert(calls[0].url.includes("project%2Fid/milestones/milestone%2Fid"));
  for (const call of calls.filter(({ method }) => method === "PUT")) {
    assert.equal(call.body, files.find(({ name }) => call.url.endsWith(name)));
    assert.equal(call.headers["Content-Type"], "application/pdf");
  }
  for (scenario of ["prepare", "invalid-json", "network-prepare", "put", "network-put", "cleanup", "complete", "network-complete"]) {
    calls = [];
    result = await upload("project", "milestone", files);
    assert.deepEqual(result.failedFiles, [files[1]], `${scenario}: only the failed file remains for retry`);
    assert(result.error.includes(files[1].name), `${scenario}: identify the failed file`);
    assert(calls.some(({ url, method }) => method === "PUT" && url.endsWith(files[2].name)), `${scenario}: later files are still uploaded`);
    if (scenario === "cleanup") {
      assert(result.error.includes("Unable to upload"));
      assert(!result.error.includes("Cleanup failed"), "Cleanup must not overwrite the upload failure");
    }
  }
  scenario = "success";
  calls = [];
  await upload("project", "milestone", result.failedFiles);
  assert.equal(calls.length, 3, "Retry uploads only the failed file");
  assert.deepEqual(await upload("project", "milestone", []), { failedFiles: [], error: undefined });
}

async function checkWorkspaces() {
  const milestone = { id: "milestone", name: "Brief", category: "Planning", order: 1, status: "PENDING", description: "", notes: [], attachments: [], deadline: null };
  const project = { id: "project", slug: "private-project", name: "Project", owner: { name: "Owner" }, collaborators: [], participantOptions: [], milestones: [milestone], canManageMilestones: true, canUploadAttachments: true, priority: "MEDIUM", progress: 0 };
  const form = { name: "Edited brief", category: "Planning", responsibleUserId: "", deadline: "", description: "", files };
  for (const [path, exportName] of [
    ["src/components/projects/flexible-milestone-workspace.tsx", "FlexibleMilestoneWorkspace"],
    ["src/components/projects/flexible-project-detail-workspace.tsx", "FlexibleProjectDetailWorkspace"],
  ]) {
    const hook = hooks();
    let uploads = 0, saves = 0, creates = 0, success = 0, refresh = 0, mutationError = false;
    const Component = load(path, {
      react: hook.react,
      "next/link": { default: "a" },
      "next/navigation": { useRouter: () => ({ refresh() { refresh++; } }) },
      "@/lib/project-priority": { formatProjectPriority: () => "Medium" },
      "@/app/(dashboard)/projects/flexible/actions": {
        async updateFlexibleMilestoneAction(projectId, milestoneId, input) {
          assert.equal(projectId, "project"); assert.equal(milestoneId, "milestone"); assert.equal(input.name, form.name);
          saves++; return mutationError ? { error: "Update denied" } : { milestoneId };
        },
        async createFlexibleMilestoneAction() { creates++; return { milestoneId: "milestone" }; },
      },
      "@/lib/flexible-milestone-upload-client": { async uploadFlexibleMilestoneAttachments(projectId, milestoneId, selected) {
        assert.equal(projectId, "project"); assert.equal(milestoneId, "milestone"); uploads++;
        return selected.length === 3 ? { failedFiles: [files[1]], error: "second.docx: Storage upload failed." } : { failedFiles: [], error: undefined };
      } },
      "@/lib/toast": { showSuccessToast() { success++; }, showErrorToast() {}, showWarningToast() {} },
    })[exportName];
    const props = { project, milestone, userOptions: [], currentUserId: "owner" };
    const dialog = () => elements(hook.render(Component, props)).find(({ type }) => type === "FlexibleMilestoneDialog");
    hook.states[0] = exportName === "FlexibleMilestoneWorkspace" ? true : { mode: "edit", milestoneId: "milestone" };
    let result = await dialog().props.onSave(form);
    assert(result.error.includes("Milestone changes saved"));
    assert.deepEqual(result.retryFiles, [files[1]]);
    assert(dialog(), "Upload failure keeps the dialog open");
    assert.equal(success, 0, "Do not display a success toast on upload failure");
    result = await dialog().props.onSave({ ...form, files: result.retryFiles });
    assert.deepEqual(result, {});
    assert.equal(dialog(), undefined, "Successful retry closes the dialog");
    assert.equal(success, 1); assert.equal(refresh, 2); assert.equal(saves, 2); assert.equal(uploads, 2);
    hook.states[0] = exportName === "FlexibleMilestoneWorkspace" ? true : { mode: "edit", milestoneId: "milestone" };
    mutationError = true;
    assert.equal((await dialog().props.onSave(form)).error, "Update denied");
    assert.equal(uploads, 2, "Do not upload when milestone update fails");
    if (exportName === "FlexibleProjectDetailWorkspace") {
      mutationError = false;
      hook.states[0] = { mode: "add" };
      result = await dialog().props.onSave(form);
      assert.equal(dialog().props.mode, "edit", "Creation switches to edit after partial upload failure");
      await dialog().props.onSave({ ...form, files: result.retryFiles });
      assert.equal(creates, 1, "Retry must not create a duplicate milestone");
    }
  }
}

async function checkDialog() {
  const hook = hooks();
  const Dialog = load("src/components/projects/flexible-milestone-dialog.tsx", { react: hook.react }).FlexibleMilestoneDialog;
  const props = { mode: "edit", users: [], canUploadAttachments: true, initialMilestone: { name: "Brief", attachments: [] }, onClose() {}, async onSave() { return { error: "Upload failed", retryFiles: [files[1]] }; } };
  hook.render(Dialog, props);
  hook.states[5] = files;
  const form = elements(hook.render(Dialog, props)).find(({ type }) => type === "form");
  await form.props.onSubmit({ preventDefault() {} });
  const nodes = elements(hook.render(Dialog, props));
  assert.deepEqual(hook.states[5], [files[1]], "Remove successful files from the selection on failure");
  assert.equal(hook.states[7], "Upload failed", "Failure is shown inline");
  const pendingHook = { ...hook.react, useTransition: () => [true, () => {}] };
  const PendingDialog = load("src/components/projects/flexible-milestone-dialog.tsx", { react: pendingHook }).FlexibleMilestoneDialog;
  const pendingNodes = elements(hook.render(PendingDialog, props));
  assert.equal(pendingNodes.find(({ type, props }) => type === "input" && props.type === "file").props.disabled, true);
  assert(pendingNodes.filter(({ type, props }) => type === "button" && (props.onClick || props["aria-label"]?.startsWith("Remove"))).every(({ props }) => props.disabled), "File selection cannot change during upload");
  assert(nodes.some(({ props }) => props["aria-label"] === `Remove ${files[1].name}`));
}

async function checkServer() {
  const rows = new Map();
  let permitted = true, metadata = { ContentLength: 8, ContentType: "application/pdf" }, deletes = 0;
  const context = { id: "project", slug: "private-project", ownerId: "owner", collaborators: [] };
  const service = load("src/lib/flexible-project-attachments.ts", {
    "@/lib/flexible-projects": {
      canUploadFlexibleMilestoneAttachments: () => permitted,
      canManageFlexibleProject: () => permitted,
      hasFlexibleProjectAccess: () => permitted,
    },
    "@/lib/permissions/resolver": { hasPermission: () => permitted },
    "@/lib/prisma": {
      withPrismaRetry: (callback) => callback(),
      prisma: {
        flexibleMilestone: { async findFirst({ where }) { return where.id === "milestone" && where.projectId === "project" ? { id: "milestone", projectId: "project", project: context } : null; } },
        flexibleProjectAttachment: {
          async create({ data }) { const id = `attachment-${rows.size}`; rows.set(id, { id, ...data, project: context }); return { id }; },
          async findFirst({ where }) { const row = rows.get(where.id); return row && row.projectId === where.projectId && row.milestoneId === where.milestoneId ? row : null; },
          async update({ where, data }) { Object.assign(rows.get(where.id), data); return rows.get(where.id); },
        },
      },
    },
    "@/lib/storage/s3": {
      getMaxAssetUploadBytes: () => 100,
      getS3BucketName: () => "mock-bucket",
      sanitizeFileName: (name) => name,
      async createPresignedUploadTarget(input) { assert(input.storageKey.startsWith("flexible-projects/project/milestones/milestone/attachments/")); return { uploadUrl: "https://storage.test/upload", expectedHeaders: { "Content-Type": input.mimeType } }; },
      async getObjectMetadata() { return metadata; },
      async deleteObjectIfNeeded() { deletes++; },
    },
    "@/lib/upload-validation": validation,
  });
  const actor = { id: "owner" };
  const input = { projectId: "project", milestoneId: "milestone", originalFileName: "brief.pdf", mimeType: "application/pdf", fileSize: 8 };
  const prepare = (overrides = {}) => service.requestFlexibleMilestoneAttachmentUpload(actor, { ...input, ...overrides });
  const complete = (id, failed = false) => service.completeFlexibleMilestoneAttachmentUpload(actor, "project", "milestone", id, failed);
  assert.equal((await prepare({ originalFileName: "brief.exe" })).code, "FILE_TYPE_NOT_ALLOWED");
  assert((await prepare({ fileSize: 0 })).error);
  assert((await prepare({ fileSize: 101 })).error);
  assert((await prepare({ milestoneId: "wrong-milestone" })).error);
  permitted = false;
  assert((await prepare()).error);
  assert.equal(rows.size, 0, "Rejected upload requests create no attachment rows");
  permitted = true;
  const ready = await prepare();
  assert.equal(rows.get(ready.attachmentId).status, "UPLOADING");
  assert.equal(ready.uploadExpectedHeaders["Content-Type"], "application/pdf");
  assert.equal(await complete(ready.attachmentId), "private-project");
  assert.equal(rows.get(ready.attachmentId).status, "READY");
  assert.equal(await complete(ready.attachmentId), "private-project", "Completion is idempotent");
  const failed = await prepare();
  await complete(failed.attachmentId, true);
  assert.equal(rows.get(failed.attachmentId).status, "FAILED"); assert.equal(deletes, 1);
  const invalid = await prepare();
  metadata = { ContentLength: 3, ContentType: "application/pdf" };
  await assert.rejects(complete(invalid.attachmentId), /size does not match/);
  metadata = { ContentLength: 8, ContentType: "text/plain" };
  await assert.rejects(complete(invalid.attachmentId), /type does not match/);
  assert.equal(rows.get(invalid.attachmentId).status, "UPLOADING", "Mismatched files are never exposed as ready");
  await assert.rejects(service.completeFlexibleMilestoneAttachmentUpload({ id: "another-user" }, "project", "milestone", invalid.attachmentId), /not found/);
  await assert.rejects(service.completeFlexibleMilestoneAttachmentUpload(actor, "project", "another-milestone", invalid.attachmentId), /not found/);
  permitted = false;
  await assert.rejects(complete(invalid.attachmentId), /not allowed/);
}

async function main() {
  await checkClient();
  await checkWorkspaces();
  await checkDialog();
  await checkServer();
  console.log("Milestone attachment checks passed: successful uploads, eight failure scenarios, remaining-file retry, both edit entry points, no duplicate milestones, dialog feedback, and server validation/completion (mocked database and storage).");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
