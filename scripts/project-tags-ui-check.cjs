/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, mocks = {}, expose = "") {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const evaluated = { exports: {} };
  new Function("require", "module", "exports", compiled + expose)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (["react", "react/jsx-runtime", "lucide-react"].includes(name)) return require(name);
    if (name.startsWith("@/app/")) return {};
    if (name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    throw new Error(`Unmocked dependency: ${name}`);
  }, evaluated, evaluated.exports);
  return evaluated.exports;
}
function find(element, predicate) {
  if (!element || typeof element !== "object") return undefined;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
const tagHelpers = load("src/lib/project-tags.ts");
const badges = load("src/components/projects/project-tag-badges.tsx", { "@/lib/project-tags": tagHelpers });
const container = ({ children }) => React.createElement("div", null, children);
const uiMocks = {
  "@/components/projects/project-tag-badges": badges,
  "@/components/ui/card": { Card: container, CardContent: container },
  "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
  "next/link": { default: container },
};

async function main() {
  const tags = ["Packaging", "Design", "Urgent", "RFQ LLC"];
  const { ProjectCard } = load("src/components/projects/project-card.tsx", uiMocks);
  const userCards = load("src/components/projects/user-projects-browser.tsx", uiMocks,
    "\nexports.GridCard = UserProjectGridCard; exports.ListRow = UserProjectListRow;");
  const project = {
    id: "tag-ui", title: "Tag placement test", tags, executors: [], stageStatuses: [],
    workflowHealth: "MISSING", tasks: [], status: "NO_ASSIGNED_TASKS", statusLabel: "No assigned tasks",
    updatedAt: "2026-10-05T10:00:00Z", canPin: false, canEdit: false, canDelete: false,
  };
  for (const Component of [ProjectCard, userCards.GridCard, userCards.ListRow]) {
    const html = renderToStaticMarkup(React.createElement(Component, { project, returnHref: "/projects" }));
    for (const tag of tags) {
      assert(html.indexOf(tag) < html.indexOf("Tag placement test"), `${tag} appears above project name`);
    }
    assert.equal((html.match(/rounded-full border px-2.5/g) ?? []).length, 4);
    const untagged = renderToStaticMarkup(React.createElement(Component, { project: { ...project, tags: [] }, returnHref: "/projects" }));
    assert(!untagged.includes('aria-label="Project tags"'), "Legacy projects do not show empty badges");
  }

  const input = load("src/components/projects/project-tag-input.tsx", { "@/lib/project-tags": tagHelpers });
  let added, draft, error;
  const inputProps = {
    tags: ["Packaging"], draft: " Design ", disabled: false,
    onChange: (value) => { added = value; }, onDraftChange: (value) => { draft = value; }, onError: (value) => { error = value; },
  };
  const inputTree = input.ProjectTagInput(inputProps);
  const inputElement = find(inputTree, (element) => element.props?.id === "project-tags");
  let prevented = false;
  inputElement.props.onKeyDown({ key: "Enter", nativeEvent: { isComposing: false }, preventDefault() { prevented = true; } });
  assert(prevented, "Enter adds a tag instead of submitting the project");
  assert.deepEqual(added, ["Packaging", "Design"]);
  assert.equal(draft, "");
  find(inputTree, (element) => element.props?.["aria-label"] === "Remove tag Packaging").props.onClick();
  assert.deepEqual(added, [], "Remove controls remove the chosen tag");
  const maxTree = input.ProjectTagInput({ ...inputProps, tags });
  assert.equal(find(maxTree, (element) => element.props?.id === "project-tags").props.disabled, true);
  const duplicateTree = input.ProjectTagInput({ ...inputProps, draft: "packaging" });
  find(duplicateTree, (element) => element.props?.children === "Add tag").props.onClick();
  assert.equal(error, "Each project tag must be different.");

  // Exercise the actual form submit handler with isolated hook state and actions.
  async function submitForm(selected, pending) {
    let stateIndex = 0, submitted, fieldErrors;
    const transitions = [];
    const hookReact = {
      ...React, useMemo: (fn) => fn(),
      useTransition: () => [false, (fn) => transitions.push(fn())],
      useState: (initial) => {
        const position = stateIndex++;
        const value = ({ 0: "Tagged project", 1: selected, 2: pending, 6: true })[position]
          ?? (typeof initial === "function" ? initial() : initial);
        return [value, (next) => { if (position === 8) fieldErrors = typeof next === "function" ? next(value) : next; }];
      },
    };
    const { CreateProjectForm } = load("src/components/projects/create-project-form.tsx", {
      ...uiMocks, react: hookReact, "@/lib/project-tags": tagHelpers,
      "@/lib/toast": { showErrorToast() {}, showSuccessToast() {} },
      "@/app/(dashboard)/projects/new/v2-actions": {
        createProjectV2Action: async (value) => { submitted = value; return { projectId: "created" }; },
      },
    });
    const form = CreateProjectForm({
      currentUser: { id: "admin", name: "Admin", email: "admin@example.test", role: "SUPER_ADMIN" },
      eligibleOwnerCandidates: [], availableCollaborators: [], canInviteCollaborator: false,
    });
    find(form, (element) => element.type === "form").props.onSubmit({ preventDefault() {} });
    await Promise.all(transitions);
    return { submitted, fieldErrors };
  }
  assert.deepEqual((await submitForm(["Packaging"], " Design ")).submitted.tags, ["Packaging", "Design"], "Save includes a pending typed tag");
  assert.deepEqual((await submitForm([], " First tag ")).submitted.tags, ["First tag"], "One pending tag satisfies the minimum");
  for (const [selected, pending] of [[[], ""], [tags, "Fifth"], [["Packaging"], "packaging"]]) {
    const result = await submitForm(selected, pending);
    assert.equal(result.submitted, undefined);
    assert(result.fieldErrors.tags, "Form blocks invalid tag submission");
  }
  console.log("Project tags UI passed: above-name placement in all three views, adding/removing controls, limits, duplicates, and pending typed tags on save.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
