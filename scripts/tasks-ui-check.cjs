/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const permissions = require("../.tmp/tasks-integration/src/lib/permissions/resolver.js");

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const evaluated = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "./tasker-form-controls") return load("src/components/tasks/tasker-form-controls.tsx", mocks);
    if (name === "@/lib/utils") return { cn: (...values) => require("tailwind-merge").twMerge(require("clsx").clsx(values)) };
    if (["react", "react/jsx-runtime", "lucide-react"].includes(name)) return require(name);
    if (name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    throw new Error(`Unmocked dependency: ${name}`);
  }, evaluated, evaluated.exports);
  return evaluated.exports;
}
const container = ({ children }) => React.createElement("div", null, children);
const mocks = {
  "next/navigation": { useRouter: () => ({ refresh() {} }), redirect: (path) => { throw new Error(`redirect:${path}`); } },
  "next/link": { default: ({ children, href }) => React.createElement("a", { href }, children) },
  "@/components/ui/card": { Card: container, CardContent: container },
  "@/components/ui/button": { Button: ({ children }) => React.createElement("button", null, children) },
  "@/components/ui/input": { Input: ({ placeholder, value }) => React.createElement("input", { placeholder, defaultValue: value }) },
  "@/components/notifications/notification-center": { useNotificationCenter: () => ({ refreshVersion: 0 }) },
  "@/lib/project-priority": load("src/lib/project-priority.ts"),
};
async function main() {
  for (const role of ["USER", "ADMIN", "SUPER_ADMIN"]) {
    const user = { id: role, role, name: role, email: `${role}@example.test` };
    let loadedUser;
    const auth = { requireUser: async () => user, getUserDisplayName: () => role, getUserInitials: () => role[0] };
    const service = { listTasks: async (actor) => { loadedUser = actor; return []; } };
    const sidebar = { getTaskSidebarCount: async () => 0 };
    const TasksPage = load("src/app/(dashboard)/tasks/page.tsx", {
      ...mocks, "@/lib/auth": auth, "@/lib/tasker/sidebar": sidebar, "@/lib/permissions/resolver": permissions,
      "@/lib/tasker/service": service,
    }).default;
    await TasksPage();
    assert.equal(loadedUser.id, role, "Both admin and user roles can open Tasks");
    const Layout = load("src/app/(dashboard)/layout.tsx", {
      ...mocks, "@/lib/auth": auth, "@/lib/tasker/sidebar": sidebar, "@/lib/permissions/resolver": permissions,
    }).default;
    const frame = await Layout({ children: null });
    assert.equal(frame.props.taskBadgeCount, 0);
    assert.equal(frame.props.sidebarVisibility.tasks, true, "Zero task count must not hide the sidebar menu");
  }
  const tasker = load("src/components/tasks/tasker-workspace.tsx", {
    ...mocks,
    "@/components/ui/rich-text-editor": { RichTextContent: ({ value }) => React.createElement("div", null, value) },
    "@/lib/tasker/types": load("src/lib/tasker/types.ts"),
  });
  const universalTask = { id: "universal", title: "Legal notes", kind: "FIELD_INPUT", status: "ASSIGNED", project: { projectId: "p", projectType: "STRUCTURED", name: "Project" }, owner: { id: "owner", label: "Owner" }, assignee: { id: "admin", label: "Admin recipient" }, coOwner: null, dueAt: null, updatedAt: "2026-10-08T10:00:00Z", href: "/tasks/universal", viewOnly: false };
  const unified = renderToStaticMarkup(React.createElement(tasker.TaskerWorkspace, { currentUserId: "admin", initialTasks: [universalTask] }));
  assert(unified.includes("Received") && unified.includes("Sent") && unified.includes("Co-owned") && unified.includes("View only"));
  assert(unified.includes("/tasks/universal") && unified.includes("Legal notes") && unified.includes("Admin recipient"));
  const rows = [
    { ...universalTask, id: "received", title: "Received artwork", href: "/tasks/received" },
    { ...universalTask, id: "sent", title: "Sent artwork", owner: { id: "admin", label: "Admin" }, assignee: { id: "executor", label: "Executor" }, href: "/tasks/sent" },
    { ...universalTask, id: "co-owned", title: "Co-owned artwork", assignee: { id: "executor", label: "Executor" }, coOwner: { id: "admin", label: "Admin" }, href: "/tasks/co-owned", status: "IN_REVIEW" },
    { ...universalTask, id: "observed", title: "Observed artwork", assignee: { id: "executor", label: "Executor" }, viewOnly: true, href: "/tasks/observed", status: "COMPLETED" },
    { ...universalTask, id: "concept", title: "Stage concept", kind: "CONCEPT", href: "/projects/p/stages/3/concepts/concept?returnTo=%2Ftasks" },
  ];
  for (const [view, search, status, ids] of [
    ["RECEIVED", "", "ALL", ["received", "concept"]],
    ["SENT", "", "ALL", ["sent"]],
    ["CO_OWNED", "", "ALL", ["co-owned"]],
    ["VIEW_ONLY", "", "ALL", ["observed"]],
    ["ALL", "", "IN_REVIEW", ["co-owned"]],
    ["ALL", "Stage concept", "ALL", ["concept"]],
    ["ALL", "does not exist", "ALL", []],
  ]) {
    let stateIndex = 0;
    const hookReact = { ...React, useState(initial) {
      const index = stateIndex++;
      return React.useState(index === 6 ? view : index === 7 ? search : index === 8 ? status : initial);
    } };
    const filtered = load("src/components/tasks/tasker-workspace.tsx", { ...mocks, react: hookReact, "@/lib/tasker/types": load("src/lib/tasker/types.ts") }).TaskerWorkspace;
    const html = renderToStaticMarkup(React.createElement(filtered, { currentUserId: "admin", initialTasks: rows }));
    for (const row of rows) assert.equal(html.includes(`href="${row.href}"`), ids.includes(row.id), `${view}/${status} visibility of ${row.id}`);
  }
  const detail = { ...universalTask, version: 1, brief: "Please supply this input", field: { id: "legal", label: "Legal notes", control: "textarea", stageRef: "" }, currentValue: null, hasConflict: false, conflictToken: null, destination: null, canManage: false, canReview: false, canSubmit: true, canDelete: false, canCancel: false, people: [], participantIds: [], submissions: [], pendingFiles: [], history: [] };
  const recipient = renderToStaticMarkup(React.createElement(tasker.TaskerDetailWorkspace, { initialTask: detail }));
  assert(recipient.includes("Submit for review") && recipient.includes("Accept task"));
  assert(!recipient.includes("Accept submission") && !recipient.includes("Manage task") && !recipient.includes("Delete task"), "Recipient UI must not offer owner actions");
  const review = renderToStaticMarkup(React.createElement(tasker.TaskerDetailWorkspace, { initialTask: { ...detail, canSubmit: false, canReview: true, hasConflict: true, currentValue: "Changed legal notes" } }));
  assert(review.includes("Changed legal notes") && review.includes("I reviewed the current value"), "Conflict review must show current data and require explicit confirmation");
  console.log("Tasker UI passed: all-role access, received/sent/co-owner/observer filters, search, concept links, recipient controls and conflict review.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
