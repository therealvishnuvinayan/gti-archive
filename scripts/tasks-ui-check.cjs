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
const task = {
  id: "visible-task", name: "Brand concept", assignedToName: "User Two", assignedByName: "Admin One",
  stageNumber: 3, stageLabel: "Initial Concept", href: "/projects/project/stages/3/concepts/visible-task?returnTo=%2Ftasks",
  dueAt: null, updatedAt: "2026-10-05T10:00:00Z", isOverdue: false,
  display: { status: "NEEDS_ATTENTION", label: "Changes Requested", dotTone: "orange" },
};
const data = {
  view: "GIVEN", attentionItems: [],
  projects: [{ id: "project", name: "Project One", priority: "MEDIUM", ownerName: "Owner", openTaskCount: 1, tasks: [task] }],
  summary: { total: 1, open: 1, needsAttention: 1, waitingForReview: 0, completed: 0 },
};

async function main() {
  const { UserTasksWorkspace } = load("src/components/tasks/user-tasks-workspace.tsx", mocks);
  const render = (input) => renderToStaticMarkup(React.createElement(UserTasksWorkspace, { data: input }));
  const given = render(data);
  assert(given.includes("Tasks I Assigned") && given.includes("Assigned to") && given.includes("User Two"));
  assert(given.includes(task.href.replaceAll("&", "&amp;")), "Tasks link directly to the workspace");
  const received = render({ ...data, view: "RECEIVED" });
  assert(received.includes("My Tasks") && received.includes("Assigned by") && received.includes("Admin One"));
  assert(!received.includes("Tasks I Assigned"));
  for (const view of ["GIVEN", "RECEIVED"]) {
    const empty = render({ ...data, view, projects: [], summary: { ...data.summary, total: 0, open: 0 } });
    assert(empty.includes(view === "GIVEN" ? "No tasks assigned by you yet" : "No tasks assigned to you yet"));
  }
  // Verify admin Needs Attention still renders given task rows, and search finds assignees.
  for (const [query, filter] of [["", "NEEDS_ATTENTION"], ["user two", "ALL"], ["unknown assignee", "ALL"]]) {
    let stateIndex = 0;
    const hookReact = {
      ...React,
      useState: (initial) => React.useState(stateIndex++ === 0 ? query : stateIndex === 2 ? filter : initial),
    };
    const filtered = load("src/components/tasks/user-tasks-workspace.tsx", { ...mocks, react: hookReact }).UserTasksWorkspace;
    const html = renderToStaticMarkup(React.createElement(filtered, { data }));
    assert.equal(html.includes("Brand concept"), query !== "unknown assignee");
  }

  for (const role of ["USER", "ADMIN", "SUPER_ADMIN"]) {
    const user = { id: role, role, name: role, email: `${role}@example.test` };
    let loadedUser;
    const auth = { requireUser: async () => user, getUserDisplayName: () => role, getUserInitials: () => role[0] };
    const service = { getUserTaskSidebarCount: async () => 0, getUserTasksPageData: async (actor) => { loadedUser = actor; return data; } };
    const TasksPage = load("src/app/(dashboard)/tasks/page.tsx", {
      ...mocks, "@/lib/auth": auth, "@/lib/user-tasks": service, "@/lib/permissions/resolver": permissions,
    }).default;
    await TasksPage();
    assert.equal(loadedUser.id, role, "Both admin and user roles can open Tasks");
    const Layout = load("src/app/(dashboard)/layout.tsx", {
      ...mocks, "@/lib/auth": auth, "@/lib/user-tasks": service, "@/lib/permissions/resolver": permissions,
    }).default;
    const frame = await Layout({ children: null });
    assert.equal(frame.props.taskBadgeCount, 0);
    assert.equal(frame.props.sidebarVisibility.tasks, true, "Zero task count must not hide the sidebar menu");
  }
  console.log("Tasks UI passed: admin/user page access, visible empty menu, role labels, assignee details/search, status filtering, and direct task links.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
