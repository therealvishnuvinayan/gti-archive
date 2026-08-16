import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  deriveDeletionOrder,
  DISPOSABLE_TABLES,
  EXPECTED_TABLES,
  PRESERVED_TABLES,
  validateSeedManifestStructure,
  type ForeignKeyRecord,
} from "./reset-development-data";

function expectThrow(callback: () => unknown, message: string) {
  assert.throws(callback, message);
}

function main() {
  assert.equal(PRESERVED_TABLES.length, 10, "preserved table count");
  assert.equal(DISPOSABLE_TABLES.length, 66, "disposable table count");
  assert.equal(EXPECTED_TABLES.length, 76, "audited table count");
  assert.equal(new Set(EXPECTED_TABLES).size, 76, "table classifications overlap");
  assert(PRESERVED_TABLES.includes("_prisma_migrations"));
  assert(PRESERVED_TABLES.includes("PermissionDefinition"));
  assert(!DISPOSABLE_TABLES.includes("PermissionDefinition"));
  assert(DISPOSABLE_TABLES.includes("Project"));
  assert(DISPOSABLE_TABLES.includes("User"));

  const graph: ForeignKeyRecord[] = [
    {
      constraintName: "archive_attachment",
      childTable: "ProjectArchive",
      parentTable: "ProjectAttachment",
      onDelete: "RESTRICT",
    },
    {
      constraintName: "attachment_project",
      childTable: "ProjectAttachment",
      parentTable: "Project",
      onDelete: "CASCADE",
    },
    {
      constraintName: "concept_self",
      childTable: "ProjectConceptFolder",
      parentTable: "ProjectConceptFolder",
      onDelete: "RESTRICT",
    },
  ];
  const order = deriveDeletionOrder(
    [
      "Project",
      "ProjectAttachment",
      "ProjectArchive",
      "ProjectConceptFolder",
    ],
    graph,
  );

  assert(order.indexOf("ProjectArchive") < order.indexOf("ProjectAttachment"));
  assert(order.indexOf("ProjectAttachment") < order.indexOf("Project"));
  assert(order.includes("ProjectConceptFolder"));

  expectThrow(
    () =>
      deriveDeletionOrder(
        ["A", "B"],
        [
          {
            constraintName: "a_b",
            childTable: "A",
            parentTable: "B",
            onDelete: "RESTRICT",
          },
          {
            constraintName: "b_a",
            childTable: "B",
            parentTable: "A",
            onDelete: "RESTRICT",
          },
        ],
      ),
    "undeclared cycles must abort",
  );

  const validManifest = validateSeedManifestStructure(
    {
      version: 1,
      environment: "development",
      approvedForExecution: true,
      superAdmin: {
        name: "Super Admin",
        email: "SUPERADMIN@GTI-ARCHIVE.COM",
        passwordEnv: "RESET_ROOT_PASSWORD",
      },
      admins: [
        {
          name: "Development Admin",
          email: "admin@example.test",
          passwordEnv: "RESET_ADMIN_PASSWORD",
        },
      ],
      users: [
        {
          name: "Development User",
          email: "user@example.test",
          passwordEnv: "RESET_USER_PASSWORD",
        },
      ],
    },
    { forExecution: true },
  );

  assert.equal(validManifest.superAdmin.email, "superadmin@gti-archive.com");
  assert.equal(validManifest.admins.length, 1);
  assert.equal(validManifest.users.length, 1);

  const examplePath = path.join(
    process.cwd(),
    "scripts/reset-development-users.example.json",
  );
  const exampleManifest = JSON.parse(fs.readFileSync(examplePath, "utf8")) as unknown;

  validateSeedManifestStructure(exampleManifest, { forExecution: false });
  expectThrow(
    () => validateSeedManifestStructure(exampleManifest, { forExecution: true }),
    "placeholder manifest must never execute",
  );
  expectThrow(
    () =>
      validateSeedManifestStructure(
        {
          ...validManifest,
          superAdmin: {
            ...validManifest.superAdmin,
            password: "NeverCommitThis1",
          },
        },
        { forExecution: true },
      ),
    "plaintext password fields must be refused",
  );

  console.log("Reset development data regression checks passed.");
}

main();
