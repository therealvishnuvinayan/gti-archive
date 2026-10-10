import assert from "node:assert/strict";

import { ProjectWorkflowStageKey, ProjectWorkflowStageStatus, StageStatus, UserRole } from "@prisma/client";

import { createProjectV2, updateProjectV2 } from "../src/lib/project-creation";
import { createProjectConceptFolder, editProjectConceptFolder } from "../src/lib/project-concepts";
import { revokeConceptTaskCompletion } from "../src/lib/project-stage-skip-revocation";
import { canUseTasks, getSidebarVisibility, type PermissionUser } from "../src/lib/permissions/resolver";
import { prisma } from "../src/lib/prisma";
import { createTask, listTasks } from "../src/lib/tasker/service";
import { getTaskSidebarCount } from "../src/lib/tasker/sidebar";

async function main() {
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
      assert.equal(await getTaskSidebarCount(actor), 0);
    }
    assert.equal((await listTasks(emptyUser)).length, 0);
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
    const taskIds = async (actor: typeof adminOne) => new Set((await listTasks(actor)).map((task) => task.id));
    assert.deepEqual(await taskIds(adminOne), new Set([a.id, b.id, c.id, d.id]), "The project owner sees all project tasks");
    assert.deepEqual(await taskIds(adminTwo), new Set([b.id]));
    assert.deepEqual(await taskIds(superAdmin), new Set([c.id]), "Super admin also sees their own given tasks");
    assert.deepEqual(await taskIds(userOne), new Set([a.id, b.id]), "User sees only received tasks");
    assert.deepEqual(await taskIds(userTwo), new Set([c.id, d.id]));
    assert.equal(await getTaskSidebarCount(userOne), 2);
    assert.equal(await getTaskSidebarCount(adminOne), 4, "Universal Tasker includes all concept tasks in the owner's project");
    const finalTask = (await listTasks(superAdmin))[0];
    assert.equal(finalTask.stageLabel, undefined, "Only the project owner/co-owners receive stage labels");
    assert.equal(finalTask.assignee.label, "User Two");
    assert(finalTask.href.includes("/stages/4/concepts/") && finalTask.href.endsWith("returnTo=%2Ftasks"));
    assert.equal((await listTasks(userOne)).find((task) => task.id === a.id)?.owner.label, "Admin One");
    assert("error" in await editProjectConceptFolder(userOne, {
      projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION, folderId: a.id,
      name: "Forged user reassignment", assignedExecutorId: userTwo.id,
    }), "Receiving a task does not grant permission to reassign it");

    // Updating another admin's title/deadline must not make that task yours.
    assert("folder" in await editProjectConceptFolder(adminTwo, {
      projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION, folderId: a.id,
      name: "Renamed by Admin Two", assignedExecutorId: userOne.id,
    }));
    assert.deepEqual(await taskIds(adminOne), new Set([a.id, b.id, c.id, d.id]));
    assert("folder" in await editProjectConceptFolder(adminTwo, {
      projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION, folderId: a.id,
      name: "Reassigned by Admin Two", assignedExecutorId: userTwo.id,
    }));
    assert.deepEqual(await taskIds(adminOne), new Set([a.id, b.id, c.id, d.id]));
    assert.deepEqual(await taskIds(adminTwo), new Set([a.id, b.id]));
    assert.deepEqual(await taskIds(userOne), new Set([b.id]));
    assert.deepEqual(await taskIds(userTwo), new Set([a.id, c.id, d.id]));
    assert.equal(await getTaskSidebarCount(userOne), 1);
    assert.equal(await getTaskSidebarCount(adminTwo), 2);
    await prisma.projectStage.update({ where: { id: a.taskerStageId }, data: { status: StageStatus.COMPLETED, completedAt: new Date() } });
    assert.equal((await listTasks(adminTwo)).filter((task) => task.status === "COMPLETED").length, 1, "Given tasks retain completed work and its status");

    const denied: PermissionUser = {
      ...adminOne,
      permissionProfileSnapshot: { rolePermissions: new Set(), effectivePermissions: new Set(), archiveAccessGranted: false, archiveAccessLevel: "NONE" as const },
    };
    assert(!canUseTasks(denied));
    assert(!getSidebarVisibility(denied).tasks);
    await assert.rejects(listTasks(denied), /not enabled/);
    assert.equal(await getTaskSidebarCount(denied), 0, "Service and count respect disabled project access");

    assert("projectId" in await updateProjectV2(adminOne, projectId, { ...input, executorIds: [userOne.id] }));
    assert.deepEqual(await taskIds(userTwo), new Set(), "Removing an executor removes their received tasks");
    assert.deepEqual(await taskIds(adminOne), new Set([b.id]), "Owner retains assigned work; unassigned concepts are not tasks");
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
    const generalTaskId = await createTask(userOne, {
      projectType: "STRUCTURED", projectId, kind: "GENERAL", title: "Input from the project owner",
      brief: "Please supply the required input", assigneeId: adminOne.id,
    });
    assert((await listTasks(adminOne)).some(task => task.id === generalTaskId && task.assignee.id === adminOne.id), "Administrators can receive tasks in the same list as concepts");
    assert((await listTasks(userOne)).some(task => task.id === generalTaskId && task.owner.id === userOne.id), "Executors can send tasks in the same list as received concepts");
    for (const actor of actors) {
      assert.equal(await getTaskSidebarCount(actor), (await listTasks(actor)).length, "Sidebar and API count the same accessible tasks across both task workflows");
    }
    console.log("Tasks integration passed: unified list, owner visibility, sender/recipient isolation, both stages, counts, assignment attribution, reassignment, completion/reopening, permissions, and removed executors.");
  } finally {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: actors.map((actor) => actor.id) } } });
    await prisma.$disconnect();
  }
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
