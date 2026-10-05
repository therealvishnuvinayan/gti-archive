/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (["react", "react/jsx-runtime", "lucide-react"].includes(name)) return require(name);
    if (name.startsWith("@/app/")) return {};
    if (name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    throw new Error(`Unmocked dependency: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}

const stored = new Map();
const listeners = new Map();
let blockedWrites = false, serverRender = false, lastSubscribe, navigationCount = 0;
const navigationTargets = [];
global.window = {
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem(key, value) { if (blockedWrites) throw new Error("Storage unavailable"); stored.set(key, value); },
  },
  addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
  removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
  dispatchEvent(event) { listeners.get(event.type)?.forEach((listener) => listener()); },
};
const hookReact = {
  ...React,
  useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
    lastSubscribe = subscribe;
    return serverRender ? serverSnapshot() : snapshot();
  },
};
const layout = load("src/components/projects/project-layout-toggle.tsx", { react: hookReact });
assert.equal(layout.useProjectsLayout()[0], "grid", "First visit defaults to grid");
let notices = 0;
const unsubscribe = lastSubscribe(() => notices++);
layout.useProjectsLayout()[1]("list");
assert.equal(layout.useProjectsLayout()[0], "list");
assert.equal(notices, 1, "Changing layout updates mounted project browsers");
window.dispatchEvent(new Event("storage"));
assert.equal(notices, 2, "Other tabs can update the preference");
unsubscribe();
assert([...listeners.values()].every((entries) => entries.size === 0));
serverRender = true;
assert.equal(layout.useProjectsLayout()[0], "grid", "Server rendering stays consistent before hydration");
serverRender = false;

const container = ({ children, className }) => React.createElement("div", { className }, children);
const asChild = ({ children, className, asChild: child, ...props }) => child
  ? React.cloneElement(React.Children.only(children), { className, ...props })
  : React.createElement("button", { className, ...props }, children);
const ui = {
  "@/components/projects/project-layout-toggle": layout,
  "@/components/projects/project-page-header": load("src/components/projects/project-page-header.tsx"),
  "@/components/projects/project-tag-badges": load("src/components/projects/project-tag-badges.tsx", { "@/lib/project-tags": load("src/lib/project-tags.ts") }),
  "@/components/ui/card": { Card: container, CardContent: container },
  "@/components/ui/button": { Button: (props) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.size;
    return asChild(buttonProps);
  } },
  "@/components/motion/motion-primitives": { MotionItem: container, MotionSection: container, MotionStaggerGroup: container },
  "@/components/ui/dropdown-menu": new Proxy({}, { get: () => container }),
  "@/lib/project-priority": load("src/lib/project-priority.ts"),
  "next/navigation": { useRouter: () => ({ push(href) { navigationCount++; navigationTargets.push(href); }, refresh() {} }), usePathname: () => "/projects", useSearchParams: () => new URLSearchParams("q=brand&status=ACTIVE&page=2") },
  "next/link": { default: ({ children, href, className, ...props }) => React.createElement("a", { href, className, ...props }, children) },
};
const { ProjectCard } = load("src/components/projects/project-card.tsx", ui);
ui["@/components/projects/project-card"] = { ProjectCard };
const { ProjectsBrowser } = load("src/components/projects/projects-browser.tsx", ui);
const { FlexibleProjectsBrowser } = load("src/components/projects/flexible-projects-browser.tsx", ui);
const { UserProjectsBrowser } = load("src/components/projects/user-projects-browser.tsx", ui);
const project = {
  id: "brand", title: "Brand refresh", tags: ["Design"], owner: { id: "owner", name: "Project Owner", email: "owner@example.test" },
  executors: [{ id: "executor", name: "Task Executor", email: "executor@example.test" }],
  stageStatuses: ["COMPLETED", "AVAILABLE", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"],
  currentStageNumber: 2, currentStageName: "Research", statusLabel: "Active", workflowHealth: "VALID",
  updatedAt: "2026-10-05T10:00:00Z", updatedLabel: "Updated today", canPin: true, canEdit: true, canDelete: true,
};
const managerProps = { projects: [project], projectCount: 41, currentPage: 2, hasAnyProjects: true, canCreateProject: true, showProjectTypeSwitcher: false, activeStatus: "ACTIVE", activeSort: "priority", activeStage: null, activeOwnerId: "", activeExecutorId: "", activeMyRole: "ALL", query: "brand", ownerOptions: [], executorOptions: [], stageOptions: [], filters: [{ label: "Active", value: "ACTIVE" }] };
const privateProps = { canCreateProject: false, users: [], currentUserId: "owner", projectCount: 1, currentPage: 1, pageSize: 20, projects: [{ ...project, slug: "private-brand", name: "Private brand", description: "", scope: "INTERNAL", status: "ACTIVE", priority: "MEDIUM", progress: 50, completedMilestones: 2, totalMilestones: 4, deadline: null }] };
const userProps = { projects: [{ ...project, status: "IN_PROGRESS", statusLabel: "In Progress", tasks: [], description: "", dueAt: null }], projectCount: 1, currentPage: 1, pageSize: 20, hasAnyProjects: true, activeFilter: "ALL", activeSort: "priority", query: "", showProjectTypeSwitcher: false };
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

for (const selected of ["grid", "list"]) {
  const controls = layout.ProjectLayoutToggle({ layout: layout.useProjectsLayout()[0], onChange: layout.useProjectsLayout()[1] });
  const button = React.Children.toArray(controls.props.children).find((node) => node.props["aria-label"] === `${selected === "grid" ? "Grid" : "List"} view`);
  button.props.onClick();
  for (const [Component, props] of [[ProjectsBrowser, managerProps], [FlexibleProjectsBrowser, privateProps], [UserProjectsBrowser, userProps]]) {
    const html = render(Component, props);
    assert(html.includes(`aria-label="${selected === "grid" ? "Grid" : "List"} view" aria-pressed="true"`));
    assert(selected === "list" ? html.includes('class="space-y-3"') : html.includes("grid-cols-1"));
  }
  const manager = render(ProjectsBrowser, managerProps);
  assert(manager.indexOf("Design") < manager.indexOf(">Brand refresh</"), "Tags remain above project names");
  assert(manager.includes("Project Owner") && manager.includes("Task Executor"));
  assert(manager.includes("Project actions for Brand refresh"), "List preserves permitted project actions");
  assert(manager.includes("returnTo=%2Fprojects%3Fq%3Dbrand%26status%3DACTIVE%26page%3D2"), "Workspace links preserve search and pagination");
  const privateHtml = render(FlexibleProjectsBrowser, privateProps);
  assert(privateHtml.includes("/projects/flexible/private-brand") && privateHtml.includes("50%"));
  assert(!privateHtml.includes("New Private Project"), "Read-only private projects retain creation restrictions");
  const paginated = render(FlexibleProjectsBrowser, { ...privateProps, projectCount: 100 });
  assert(paginated.includes("Showing 1–20 of 100 projects") && paginated.includes("Page 1 of 5"), "Both layouts display the correct page and project totals");
  for (const Component of [ProjectsBrowser, FlexibleProjectsBrowser]) {
    const empty = render(Component, Component === ProjectsBrowser ? { ...managerProps, projects: [] } : { ...privateProps, projects: [] });
    assert(empty.includes('aria-label="List view"'), "Empty pages still offer layout controls");
  }
}
assert.equal(navigationCount, 0, "Layout changes do not reset filters or navigate");

function find(element, label) {
  if (!element || typeof element !== "object") return undefined;
  if (element.props?.["aria-label"] === label) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const match = find(child, label);
    if (match) return match;
  }
}
const directBrowser = load("src/components/projects/flexible-projects-browser.tsx", { ...ui, react: { ...React, useState: (initial) => [initial, () => {}] } }).FlexibleProjectsBrowser;
const middlePage = directBrowser({ ...privateProps, projectCount: 100, currentPage: 2 });
find(middlePage, "Next private projects page").props.onClick();
let target = new URL(navigationTargets.at(-1), "https://example.test");
assert.equal(target.searchParams.get("view"), "flexible");
assert.equal(target.searchParams.get("page"), "3");
assert.equal(target.searchParams.get("q"), "brand", "Paging preserves the current query parameters");
find(middlePage, "Previous private projects page").props.onClick();
target = new URL(navigationTargets.at(-1), "https://example.test");
assert.equal(target.searchParams.get("page"), null, "First-page links omit the page parameter");
assert.equal(layout.useProjectsLayout()[0], "list", "Paging preserves the selected layout");
assert.equal(find(directBrowser({ ...privateProps, projectCount: 100 }), "Previous private projects page").props.disabled, true);
assert.equal(find(directBrowser({ ...privateProps, projectCount: 100, currentPage: 5 }), "Next private projects page").props.disabled, true);
assert.equal(find(directBrowser({ ...privateProps, projectCount: 20 }), "Private projects pagination"), undefined, "Single-page results hide pagination controls");
const restricted = render(ProjectCard, { layout: "list", project: { ...project, canPin: false, canEdit: false, canDelete: false, owner: null, executors: [] } });
assert(!restricted.includes("Project actions for") && restricted.includes("Unassigned") && restricted.includes("Self-managed"));
blockedWrites = true;
layout.useProjectsLayout()[1]("grid");
assert.equal(layout.useProjectsLayout()[0], "grid");
layout.useProjectsLayout()[1]("list");
assert.equal(layout.useProjectsLayout()[0], "list", "Layout works when storage writes are blocked");
console.log("Project layout checks passed: default grid, switching/persistence across all project browsers, compact list rows, tags, workspace links, actions, pagination navigation/bounds, empty pages and unavailable storage.");
