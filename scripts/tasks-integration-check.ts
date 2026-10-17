import assert from "node:assert/strict";

import { ProjectWorkflowStageKey, ProjectWorkflowStageStatus, StageStatus, UserRole } from "@prisma/client";

import { createProjectV2, updateProjectV2 } from "../src/lib/project-creation";
import { createProjectConceptFolder, editProjectConceptFolder } from "../src/lib/project-concepts";
import { revokeConceptTaskCompletion } from "../src/lib/project-stage-skip-revocation";
import { canUseTasks, getSidebarVisibility, type PermissionUser } from "../src/lib/permissions/resolver";
import { prisma } from "../src/lib/prisma";
import { getUserTaskSidebarCount, getUserTasksPageData } from "../src/lib/user-tasks";

async function main() {
  const legacy = await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: "legacy-assigned-task" } });
  assert.equal(legacy.assignedById, "legacy-task-admin", "Migration attributes existing assigned tasks to their recorded creator");
  assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: "legacy-unassigned-task" } })).assignedById, null);
  assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: "legacy-unknown-creator-task" } })).assignedById, null, "Do not invent an assigner when history is unknown");
  assert.equal((await getUserTasksPageData({ id: "legacy-task-admin", role: UserRole.ADMIN })).summary.total, 1);
  assert.equal((await getUserTasksPageData({ id: "legacy-task-user", role: UserRole.USER })).summary.total, 2, "Unknown historical assigners do not hide received tasks");

  const actors = await Promise.all([
    { name: "Admin One", role: UserRole.ADMIN },
    { name: "Admin Two", role: UserRole.ADMIN },
    { name: "Super Admin", role: UserRole.SUPER_ADMIN },
    { name: "User One", role: UserRole.USER },
    { name: "User Two", role: UserRole.USER },
    { name: "Empty User", role: UserRole.USER },
  ].map((actor, index) => prisma.user.create({ data: {
    ...actor, email: `task-list-${index}@example.test`, passwordHash: "x",
  } })));
  const [adminOne, adminTwo, superAdmin, userOne, userTwo, emptyUser] = actors;
  const input = {
    name: "Task list integration", tags: ["Tasks QA"], ownerId: adminOne.id,
    coOwnerIds: [], executorIds: [userOne.id, userTwo.id],
  };
  const created = await createProjectV2(adminOne, input);
  assert("projectId" in created);
  const projectId = created.projectId;
  try {
    for (const actor of actors) {
      assert(canUseTasks(actor));
      assert(getSidebarVisibility(actor).tasks, "Tasks is visible for admin and user accounts with zero assignments");
      assert.equal(await getUserTaskSidebarCount(actor), 0);
    }
    assert.equal((await getUserTasksPageData(emptyUser)).summary.total, 0);
    assert.equal((await getUserTasksPageData(adminOne)).view, "GIVEN");
    assert.equal((await getUserTasksPageData(userOne)).view, "RECEIVED");
    await prisma.projectWorkflowStage.updateMany({
      where: { projectId, stageKey: { in: [ProjectWorkflowStageKey.PROJECT_INQUIRY, ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING] } },
      data: { status: ProjectWorkflowStageStatus.COMPLETED, unlockedAt: new Date(), completedAt: new Date() },
    });
    await prisma.projectWorkflowStage.updateMany({
      where: { projectId, stageKey: { in: [ProjectWorkflowStageKey.CONCEPT_CREATION, ProjectWorkflowStageKey.PROJECT_DEVELOPMENT] } },
      data: { status: ProjectWorkflowStageStatus.AVAILABLE, unlockedAt: new Date() },
    });
    async function giveTask(actor: typeof adminOne, executorId: string, name: string, stageKey = ProjectWorkflowStageKey.CONCEPT_CREATION as "CONCEPT_CREATION" | "PROJECT_DEVELOPMENT") {
      const result = await createProjectConceptFolder(actor, {
        projectId, stageKey, name, assignedExecutorId: executorId,
        deadline: new Date(Date.now() + 86_400_000).toISOString(), brief: `${name} brief`,
      });
      assert("folder" in result && result.folder, JSON.stringify(result));
      assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: result.folder.id } })).assignedById, actor.id);
      return result.folder;
    }
    const a = await giveTask(adminOne, userOne.id, "Admin One initial task");
    const b = await giveTask(adminTwo, userOne.id, "Admin Two initial task");
    const c = await giveTask(superAdmin, userTwo.id, "Super Admin final task", ProjectWorkflowStageKey.PROJECT_DEVELOPMENT);
    const d = await giveTask(adminOne, userTwo.id, "Admin One second task");
    const taskIds = async (actor: typeof adminOne) => new Set((await getUserTasksPageData(actor)).projects.flatMap((project) => project.tasks.map((task) => task.id)));
    assert.deepEqual(await taskIds(adminOne), new Set([a.id, d.id]), "Admin only sees tasks they gave, even when another admin assigns within their project");
    assert.deepEqual(await taskIds(adminTwo), new Set([b.id]));
    assert.deepEqual(await taskIds(superAdmin), new Set([c.id]), "Super admin also sees their own given tasks");
    assert.deepEqual(await taskIds(userOne), new Set([a.id, b.id]), "User sees only received tasks");
    assert.deepEqual(await taskIds(userTwo), new Set([c.id, d.id]));
    assert.equal(await getUserTaskSidebarCount(userOne), 2);
    assert.equal(await getUserTaskSidebarCount(adminOne), 2);
    const finalTask = (await getUserTasksPageData(superAdmin)).projects[0].tasks[0];
    assert.equal(finalTask.stageNumber, 4);
    assert.equal(finalTask.assignedToName, "User Two");
    assert(finalTask.href.includes("/stages/4/concepts/") && finalTask.href.endsWith("returnTo=%2Ftasks"));
    assert.equal((await getUserTasksPageData(userOne)).projects[0].tasks.find((task) => task.id === a.id)?.assignedByName, "Admin One");
    assert("error" in await editProjectConceptFolder(userOne, {
      projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION, folderId: a.id,
      name: "Forged user reassignment", assignedExecutorId: userTwo.id,
    }), "Receiving a task does not grant permission to reassign it");

    // Updating another admin's title/deadline must not make that task yours.
    assert("folder" in await editProjectConceptFolder(adminTwo, {
      projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION, folderId: a.id,
      name: "Renamed by Admin Two", assignedExecutorId: userOne.id,
    }));
    assert.deepEqual(await taskIds(adminOne), new Set([a.id, d.id]));
    assert("folder" in await editProjectConceptFolder(adminTwo, {
      projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION, folderId: a.id,
      name: "Reassigned by Admin Two", assignedExecutorId: userTwo.id,
    }));
    assert.deepEqual(await taskIds(adminOne), new Set([d.id]));
    assert.deepEqual(await taskIds(adminTwo), new Set([a.id, b.id]));
    assert.deepEqual(await taskIds(userOne), new Set([b.id]));
    assert.deepEqual(await taskIds(userTwo), new Set([a.id, c.id, d.id]));
    assert.equal(await getUserTaskSidebarCount(userOne), 1);
    assert.equal(await getUserTaskSidebarCount(adminTwo), 2);
    await prisma.projectStage.update({ where: { id: a.taskerStageId }, data: { status: StageStatus.COMPLETED, completedAt: new Date() } });
    assert.equal((await getUserTasksPageData(adminTwo)).summary.completed, 1, "Given tasks retain completed work and its status");

    const denied: PermissionUser = {
      ...adminOne,
      permissionProfileSnapshot: { rolePermissions: new Set(), effectivePermissions: new Set(), archiveAccessGranted: false, archiveAccessLevel: "NONE" as const },
    };
    assert(!canUseTasks(denied));
    assert(!getSidebarVisibility(denied).tasks);
    assert.equal((await getUserTasksPageData(denied)).summary.total, 0);
    assert.equal(await getUserTaskSidebarCount(denied), 0, "Service and count respect disabled project access");

    assert("projectId" in await updateProjectV2(adminOne, projectId, { ...input, executorIds: [userOne.id] }));
    assert.deepEqual(await taskIds(userTwo), new Set(), "Removing an executor removes their received tasks");
    assert.deepEqual(await taskIds(adminOne), new Set(), "Unassigned work disappears from the given list");
    assert.deepEqual(await taskIds(adminTwo), new Set([b.id]));
    assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: d.id } })).assignedById, null);

    // Reopening completed work can assign a replacement executor too.
    await prisma.projectWorkflowStage.update({
      where: { projectId_stageKey: { projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION } },
      data: { status: ProjectWorkflowStageStatus.COMPLETED, completedAt: new Date() },
    });
    async function completeFinalTask() {
      await prisma.projectStage.update({ where: { id: c.taskerStageId }, data: { status: StageStatus.COMPLETED, completedAt: new Date() } });
      await prisma.projectConceptFolder.update({ where: { id: c.id }, data: { completedWithoutFileAt: new Date() } });
    }
    await completeFinalTask();
    const reopened = await revokeConceptTaskCompletion(adminTwo, {
      projectId, stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT, folderId: c.id, executorId: userOne.id,
    });
    assert("changed" in reopened, JSON.stringify(reopened));
    assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: c.id } })).assignedById, adminTwo.id);
    assert.deepEqual(await taskIds(adminTwo), new Set([b.id, c.id]));
    await completeFinalTask();
    assert("changed" in await revokeConceptTaskCompletion(adminOne, {
      projectId, stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT, folderId: c.id,
    }));
    assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: c.id } })).assignedById, adminTwo.id, "Reopening without reassignment preserves the assigner");
    console.log("Tasks integration passed: migration, visible empty menu, admin/user isolation, both stages, counts, assignment attribution, reassignment, completion/reopening, permissions, and removed executors.");
  } finally {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: actors.map((actor) => actor.id) } } });
    await prisma.$disconnect();
  }
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
