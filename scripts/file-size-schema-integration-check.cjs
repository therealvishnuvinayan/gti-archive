/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const { AttachmentAssetType, AttachmentStatus, UserRole, ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus } = require("@prisma/client");

if (process.env.FILE_SIZE_MIGRATION_ISOLATED !== "1" ||
    new URL(process.env.DATABASE_URL).hostname !== "127.0.0.1") {
  throw new Error("File-size migration checks require a disposable local database.");
}

const compiledRoot = resolve(process.env.COMPILED_ALIAS_ROOT);
const { prisma } = require(resolve(compiledRoot, "src/lib/prisma.js"));
const { getStageFiveWorkspaceData } = require(resolve(compiledRoot, "src/lib/stage-five.js"));
const { getInitialProjectWorkflowStageData } = require(resolve(compiledRoot, "src/lib/project-workflow.js"));
const tables = ["ArchivedProjectFile", "FlexibleProjectAttachment", "ManualArchiveFile",
  "ManualLibraryAsset", "ProjectAttachment", "ProjectCompletionDocument"];
const migrationPath = resolve("prisma/migrations/20261006140000_restore_integer_file_sizes/migration.sql");

function migrate() {
  return spawnSync("psql", ["--dbname", process.env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", migrationPath],
    { env: process.env, encoding: "utf8" });
}

async function columnTypes(expected) {
  const columns = await prisma.$queryRawUnsafe(`SELECT table_name, data_type
    FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'fileSize'`);
  for (const table of tables) {
    assert.equal(columns.find((column) => column.table_name === table)?.data_type, expected, table);
  }
}

async function makeFloatColumns() {
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "fileSize" TYPE DOUBLE PRECISION`);
  }
}

function corruptedSize(bytes) {
  const binary = Buffer.alloc(8);
  binary.writeBigInt64BE(BigInt(bytes));
  return binary.readDoubleBE().toString();
}

async function main() {
  // A full fresh migration deployment has already run, including the repair.
  await columnTypes("integer");
  const runId = randomUUID();
  const owner = await prisma.user.create({ data: {
    id: `file-size-owner-${runId}`, name: "File Size Test Owner",
    email: `file-size-${runId}@example.test`, passwordHash: "isolated-test-only", role: UserRole.ADMIN,
  } });
  const project = await prisma.project.create({ data: {
    id: `file-size-project-${runId}`, name: "File Size Migration Test", ownerId: owner.id, createdById: owner.id,
    workflowStages: { create: getInitialProjectWorkflowStageData().map((stage, index) => ({
      ...stage, status: index < 4 ? ProjectWorkflowStageStatus.COMPLETED
        : index === 4 ? ProjectWorkflowStageStatus.AVAILABLE : ProjectWorkflowStageStatus.LOCKED,
    })) },
  } });
  const recoveredSizes = [1, 5, 1331860, 1703146, 1626719, 233640, 1459703, 1467272];
  const expectedSizes = [...recoveredSizes, 0, 1024, 2147483647];
  const ids = expectedSizes.map((_, index) => `file-size-attachment-${runId}-${index}`);
  try {
    for (const [index, fileSize] of expectedSizes.entries()) {
      await prisma.projectAttachment.create({ data: {
        id: ids[index], projectId: project.id, uploadedById: owner.id,
        fileName: `${index}.txt`, originalFileName: `${index}.txt`, mimeType: "text/plain", fileSize,
        bucket: "file-size-tests.invalid", storageKey: `file-size-tests/${ids[index]}`,
        assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET, status: AttachmentStatus.READY,
      } });
      const handoff = await prisma.projectStageFileHandoff.create({ data: {
        projectId: project.id, sourceAttachmentId: ids[index], handedOffById: owner.id,
        sourceWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
        targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
      } });
      await prisma.projectFileChecklist.create({ data: {
        projectId: project.id, handoffId: handoff.id, sourceAttachmentId: ids[index],
      } });
    }
    await makeFloatColumns();
    for (const [index, bytes] of recoveredSizes.entries()) {
      await prisma.$executeRawUnsafe(`UPDATE "ProjectAttachment" SET "fileSize" = ${corruptedSize(bytes)}::double precision WHERE id = $1`, ids[index]);
    }
    await assert.rejects(getStageFiveWorkspaceData(owner, project.id), (error) => error.code === "P2023",
      "the mismatched schema must reproduce the reported Stage 5 crash");
    const repair = migrate();
    assert.equal(repair.status, 0, repair.stderr || repair.stdout);
    await columnTypes("integer");
    const workspace = await getStageFiveWorkspaceData(owner, project.id);
    assert.equal(workspace?.files.length, expectedSizes.length);
    for (const [index, bytes] of expectedSizes.entries()) {
      assert.equal(workspace.files.find((file) => file.sourceAttachment.id === ids[index])?.sourceAttachment.size,
        bytes, "every Stage 5 file must retain its original byte count");
    }
    const written = await prisma.projectAttachment.update({ where: { id: ids[0] }, data: { fileSize: 100 } });
    assert.equal(written.fileSize, 100, "new writes must work after the repair");

    // A failed validation must roll back both size recovery and column changes.
    await makeFloatColumns();
    const firstCorrupt = corruptedSize(1331860);
    await prisma.$executeRawUnsafe(`UPDATE "ProjectAttachment" SET "fileSize" = ${firstCorrupt}::double precision WHERE id = $1`, ids[0]);
    for (const invalidSize of [2147483648, 1.5, -1]) {
      await prisma.$executeRawUnsafe(`UPDATE "ProjectAttachment" SET "fileSize" = ${invalidSize}::double precision WHERE id = $1`, ids.at(-1));
      const failed = migrate();
      assert.notEqual(failed.status, 0, "unsafe file sizes must stop the migration");
      assert.match(failed.stderr, /non-integer or out-of-range/);
      await columnTypes("double precision");
      const [row] = await prisma.$queryRawUnsafe(`SELECT "fileSize"::text AS bytes FROM "ProjectAttachment" WHERE id = $1`, ids[0]);
      assert.equal(Number(row.bytes), Number(firstCorrupt), "recovered values must roll back on failure");
    }
    await prisma.$executeRawUnsafe('UPDATE "ProjectAttachment" SET "fileSize" = 2147483647::double precision WHERE id = $1', ids.at(-1));
    const finalRepair = migrate();
    assert.equal(finalRepair.status, 0, finalRepair.stderr || finalRepair.stdout);
    assert.equal(migrate().status, 0, "repair must also work with already-correct integer columns");
    await columnTypes("integer");
    console.log("File-size migration passed: fresh deploy, Stage 5 crash reproduction, exact byte recovery, new writes, safe rollback, and repeat application.");
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
