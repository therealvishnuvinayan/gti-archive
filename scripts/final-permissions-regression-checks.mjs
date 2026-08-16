import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (relativePath) => readFileSync(join(rootDir, relativePath), "utf8");
const check = (condition, message) => {
  if (!condition) throw new Error(`Final permissions check failed: ${message}`);
};
const includes = (source, fragment, message) =>
  check(source.includes(fragment), message);

const resolver = read("src/lib/permissions/resolver.ts");
includes(
  resolver,
  "if (!hasProjectPermissionGrant(user, permissionKey))",
  "effective profiles must gate project-scoped permissions before relationship scope",
);
includes(
  resolver,
  'isBusinessAdministratorRole(user.role) &&\n    hasPermission(user, "project.create")',
  "project creation must combine the hard ADMIN role boundary with project.create",
);

for (const stageNumber of [1, 2, 5, 6, 7]) {
  const page = read(
    `src/app/(dashboard)/projects/[slug]/stages/${stageNumber}/page.tsx`,
  );
  includes(
    page,
    "!isBusinessAdministratorRole(user.role)",
    `Stage ${stageNumber} USER route gate`,
  );
  includes(
    page,
    "redirect(`/projects/${slug}`)",
    `Stage ${stageNumber} USER workspace redirect`,
  );
}

const stageFive = read("src/lib/stage-five.ts");
includes(stageFive, "canManageStageFive(user, project)", "Stage 5 manager service gate");
includes(
  stageFive,
  "isGlobalProjectAdministrator(user)",
  "Stage 5 must not infer management from USER project membership",
);

for (const [stage, helper] of [
  ["six", "canManageStageSix(user, project)"],
  ["seven", "canManageStageSeven(user, project)"],
]) {
  const source = read(`src/lib/stage-${stage}.ts`);
  includes(source, helper, `Stage ${stage} manager service gate`);
  includes(
    source,
    'hasProjectPermission(user, project, "stage.view")',
    `Stage ${stage} effective stage permission gate`,
  );
}

const calendarPage = read("src/app/(dashboard)/calendar/page.tsx");
includes(
  calendarPage,
  "access.canManageCollaborators ? getCollaborators() : Promise.resolve([])",
  "Calendar must not serialize the global USER directory to view-only users",
);

const assetTagRoute = read("src/app/api/asset-tags/route.ts");
includes(assetTagRoute, "canUseAssetTags", "asset-tag API authorization");
includes(assetTagRoute, 'status: 403', "asset-tag API forbidden response");

const library = read("src/lib/library.ts");
includes(library, "input.assetTagId", "asset-tag filtering permission enforcement");
includes(
  library,
  '!hasPermission(user, "file.download")',
  "manual Library download permission enforcement",
);
const libraryWorkspace = read("src/components/library/library-workspace.tsx");
includes(libraryWorkspace, "item.canDownload ?", "Library download UI gate");
includes(libraryWorkspace, "item.canFavorite ?", "Library favorite UI gate");
includes(libraryWorkspace, "canFilterAssets ?", "Library filter UI gate");

const conceptCompareRoute = read("src/components/projects/concept-compare-route.tsx");
includes(
  conceptCompareRoute,
  'hasPermission(user, "compare.view")',
  "assigned concept comparison view permission gate",
);
const comparison = read("src/lib/comparison.ts");
includes(
  comparison,
  "canViewProjectConcept(user, concept)",
  "assigned executor read-only concept comparison access",
);
includes(
  comparison,
  'hasPermission(user, "compare.createComment")',
  "concept comparison marker mutation permission gate",
);

console.log("Final ADMIN/USER cross-layer permission regression checks passed.");
