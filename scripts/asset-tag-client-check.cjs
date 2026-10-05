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
