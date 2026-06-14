import { prisma } from "../src/lib/prisma";
import { syncPermissionDefinitions } from "../src/lib/permissions/profiles";

async function main() {
  const result = await syncPermissionDefinitions();

  console.log("Permission definitions synced.");
  console.log(`Definitions: ${result.definitionsSynced}`);
  console.log(`Role rows seeded: ${result.rolePermissionsSeeded}`);
  console.log(
    `Collaborator type rows seeded: ${result.collaboratorTypePermissionsSeeded}`,
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Permission sync failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
