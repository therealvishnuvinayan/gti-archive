/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cache = new Map();

// Load the real local module graph. Database imports must fail, as they would
// in a browser where Prisma.dmmf and PrismaClient are unavailable.
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const source = fs.readFileSync(absolute, "utf8");
  const mod = { exports: {} };
  cache.set(absolute, mod);
  // Next turns server-action imports into RPC references. Their server module
  // must never be evaluated as part of the browser's module graph.
  const parsed = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true);
  const directive = parsed.statements[0];
  if (directive && ts.isExpressionStatement(directive) &&
      ts.isStringLiteral(directive.expression) && directive.expression.text === "use server") {
    for (const statement of parsed.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name &&
          (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export)) {
        mod.exports[statement.name.text] = async () => {
          throw new Error("Client rendering must not execute a server action.");
        };
      }
    }
    return mod.exports;
  }
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "@/lib/prisma" || name === "@prisma/client") {
      throw new Error(`Database module reached the client from ${file}: ${name}`);
    }
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const root = name.startsWith("@/") ? path.resolve("src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const target = [root, `${root}.ts`, `${root}.tsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert(target, `Missing local import ${name}`);
      return load(target);
    }
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}

const shared = load("src/lib/asset-tags-shared.ts");
assert.equal(shared.MAX_ASSET_TAGS, 5);
assert.deepEqual(shared.normalizeAssetTagIds([" a ", "", null, "b"]).tagIds, ["a", "b"]);
assert(shared.normalizeAssetTagIds(["a", "a"]).error);
assert.equal(shared.normalizeAssetTagIds(["1", "2", "3", "4", "5", "6"]).error, shared.ASSET_TAG_LIMIT_ERROR);

const { AssetTagSelector } = load("src/components/assets/asset-tag-selector.tsx");
const tags = [{ id: "a", name: "Design", color: "#228855" }];
const picker = renderToStaticMarkup(React.createElement(AssetTagSelector, { value: ["a"], onChange() {}, initialOptions: tags }));
assert(picker.includes("Design") && picker.includes("Remove Design"), "The asset tag picker renders existing selections");

const { ArchiveUploadButton } = load("src/components/dashboard/upload-assets-button.tsx");
assert(renderToStaticMarkup(React.createElement(ArchiveUploadButton, { canUploadAssets: true })).includes("Upload"));
const { LibraryUploadButton } = load("src/components/library/library-upload-button.tsx");
assert(renderToStaticMarkup(React.createElement(LibraryUploadButton, { canUploadAssets: true, assetTagOptions: tags })).includes("Upload"));
console.log("Asset tag client checks passed: Archives and Library upload modules load and render without importing Prisma; tag limits and duplicate validation remain enforced.");

const { ProjectMasterDataWorkspace } = load("src/components/settings/project-master-data-workspace.tsx");
const category = { id: "category-a", name: "Packaging", description: "Packaging work", color: "#228855",
  isActive: true, createdAt: "06 Oct 2026", updatedAt: "06 Oct 2026" };
const archiveCategory = { ...category, id: "archive-category-a", name: "Finished Artwork", slug: "finished-artwork",
  iconUrl: "", iconKey: "", parentId: null, parentName: null, childCount: 0, sortOrder: 0, isSystem: false, allowedUsers: [] };
const masterDataProps = {
  categories: [category], projectStatusGroups: [], projectStatuses: [], tags: [], assetTags: tags,
  archiveCategories: [archiveCategory], archiveCategoryAccessUsers: [],
  summary: { totalCategories: 1, activeCategories: 1, totalProjectStatusGroups: 0, activeProjectStatusGroups: 0,
    totalProjectStatuses: 0, activeProjectStatuses: 0, totalTags: 0, activeTags: 0, totalAssetTags: 1, activeAssetTags: 1,
    totalArchiveCategories: 1, activeArchiveCategories: 1 },
  canManageItems: true, canDeleteItems: true,
};
const archives = renderToStaticMarkup(React.createElement(ProjectMasterDataWorkspace, { ...masterDataProps, archiveOnly: true }));
assert(archives.includes("Archive Categories") && archives.includes("Finished Artwork") && archives.includes("Add Archive Category"),
  "Archives Categories must render its data and add control without importing Prisma");
const masterData = renderToStaticMarkup(React.createElement(ProjectMasterDataWorkspace, masterDataProps));
assert(masterData.includes("Project Master Data") && masterData.includes("Packaging"),
  "Project Master Data settings must also render without importing Prisma");
console.log("Master data client checks passed: Archives Categories and Project Master Data settings render without database imports.");
