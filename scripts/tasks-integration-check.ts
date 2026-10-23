import { authenticatedFixtureService, authorizeFixtureActors, createGovernedFixtureProject } from "./native-workflow-fixtures";
import assert from "node:assert/strict";

import { ProjectWorkflowStageKey, ProjectWorkflowStageStatus, StageStatus, UserRole } from "@prisma/client";

import { createProjectV2 as session_createProjectV2, updateProjectV2 as session_updateProjectV2 } from "../src/lib/project-creation";
import { createProjectConceptFolder as session_createProjectConceptFolder, editProjectConceptFolder as session_editProjectConceptFolder } from "../src/lib/project-concepts";
import { revokeConceptTaskCompletion as session_revokeConceptTaskCompletion } from "../src/lib/project-stage-skip-revocation";
import { canUseTasks, getSidebarVisibility } from "../src/lib/permissions/resolver";
import { prisma } from "../src/lib/prisma";
import { getUserTaskSidebarCount as session_getUserTaskSidebarCount, getUserTasksPageData as session_getUserTasksPageData } from "../src/lib/user-tasks";

const createProjectV2 = authenticatedFixtureService(session_createProjectV2);
const updateProjectV2 = authenticatedFixtureService(session_updateProjectV2);
const createProjectConceptFolder = authenticatedFixtureService(session_createProjectConceptFolder);
const editProjectConceptFolder = authenticatedFixtureService(session_editProjectConceptFolder);
const revokeConceptTaskCompletion = authenticatedFixtureService(session_revokeConceptTaskCompletion);
const getUserTaskSidebarCount = authenticatedFixtureService(session_getUserTaskSidebarCount);
const getUserTasksPageData = authenticatedFixtureService(session_getUserTasksPageData);

async function main() {
  const records = await Promise.all([
    { name: "Admin One", role: UserRole.ADMIN },
    { name: "Admin Two", role: UserRole.ADMIN },
    { name: "Super Admin", role: UserRole.SUPER_ADMIN },
    { name: "User One", role: UserRole.USER },
    { name: "User Two", role: UserRole.USER },
    { name: "Empty User", role: UserRole.USER },
  ].map((actor, index) => prisma.user.create({ data: {
    ...actor, email: `task-list-${index}@example.test`, passwordHash: "x",
  } })));
  const actors = await authorizeFixtureActors(records, ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER", "DIRECTOR", "DESIGNER", "DIGITAL_LEAD", null]);
  const [adminOne, adminTwo, superAdmin, userOne, userTwo, emptyUser] = actors;
  const input = {
    name: "Task list integration", tags: ["Tasks QA"], ownerId: adminOne.id,
    coOwnerIds: [adminTwo.id], executorIds: [userOne.id, userTwo.id],
  };
  assert("error" in await createProjectV2(adminOne, input), "Legacy ungoverned creation remains denied");
  const created = await createGovernedFixtureProject(adminOne, input);
  assert("projectId" in created);
  const projectId = created.projectId;
  try {
    for (const actor of actors.slice(0, -1)) {
      assert(canUseTasks(actor));
      assert(getSidebarVisibility(actor).tasks, "Tasks is visible for admin and user accounts with zero assignments");
      assert.equal(await getUserTaskSidebarCount(actor), 0);
    }
    assert.equal((await getUserTasksPageData(emptyUser)).summary.total, 0);
    assert.equal((await getUserTasksPageData(adminOne)).view, "RECEIVED");
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
    assert.deepEqual(await taskIds(adminOne), new Set(), "SPM task lists are assigned execution scope, not a legacy given-task inbox");
    assert.deepEqual(await taskIds(adminTwo), new Set());
    assert.deepEqual(await taskIds(superAdmin), new Set([a.id, b.id, c.id, d.id]), "Director oversight includes all concept tasks");
    assert.deepEqual(await taskIds(userOne), new Set([a.id, b.id]), "User sees only received tasks");
    assert.deepEqual(await taskIds(userTwo), new Set([c.id, d.id]));
    assert.equal(await getUserTaskSidebarCount(userOne), 2);
    assert.equal(await getUserTaskSidebarCount(adminOne), 0);
    const finalTask = (await getUserTasksPageData(superAdmin)).projects[0].tasks.find(task => task.id === c.id)!;
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
    assert.deepEqual(await taskIds(adminOne), new Set());
    assert("folder" in await editProjectConceptFolder(adminTwo, {
      projectId, stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION, folderId: a.id,
      name: "Reassigned by Admin Two", assignedExecutorId: userTwo.id,
    }));
    assert.deepEqual(await taskIds(adminOne), new Set());
    assert.deepEqual(await taskIds(adminTwo), new Set());
    assert.deepEqual(await taskIds(userOne), new Set([b.id]));
    assert.deepEqual(await taskIds(userTwo), new Set([a.id, c.id, d.id]));
    assert.equal(await getUserTaskSidebarCount(userOne), 1);
    assert.equal(await getUserTaskSidebarCount(adminTwo), 0);
    await prisma.projectStage.update({ where: { id: a.taskerStageId }, data: { status: StageStatus.COMPLETED, completedAt: new Date() } });
    assert.equal((await getUserTasksPageData(superAdmin)).summary.completed, 1, "Given tasks retain completed work and its status");

    assert(!canUseTasks(emptyUser), "Technical-only identity has no Tasker access");
    assert(!getSidebarVisibility(emptyUser).tasks);
    assert.equal((await getUserTasksPageData(emptyUser)).summary.total, 0);
    assert.equal(await getUserTaskSidebarCount(emptyUser), 0, "Technical privilege never grants business access");

    assert("projectId" in await updateProjectV2(adminOne, projectId, { ...input, executorIds: [userOne.id] }));
    assert.deepEqual(await taskIds(userTwo), new Set(), "Removing an executor removes their received tasks");
    assert.deepEqual(await taskIds(adminOne), new Set(), "Unassigned work disappears from the given list");
    assert.deepEqual(await taskIds(adminTwo), new Set());
    assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: d.id } } )).assignedById, adminOne.id, "Removing execution access retains historical assigner attribution");
    assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: d.id } })).assignedExecutorId, null);

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
    assert("error" in await revokeConceptTaskCompletion(adminTwo, { projectId, stageKey: "PROJECT_DEVELOPMENT", folderId: c.id, executorId: userOne.id, reason: "Manager cannot reopen" }));
    const reopened = await revokeConceptTaskCompletion(superAdmin, {
      projectId, stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT, folderId: c.id, reason: "Director review of replacement executor", executorId: userOne.id,
    });
    assert("changed" in reopened, JSON.stringify(reopened));
    assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: c.id } } )).assignedById, superAdmin.id);
    assert.deepEqual(await taskIds(userOne), new Set([b.id, c.id]));
    await completeFinalTask();
    assert("changed" in await revokeConceptTaskCompletion(superAdmin, {
      projectId, stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT, folderId: c.id, reason: "Director review without reassignment",
    }));
    assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: c.id } } )).assignedById, superAdmin.id, "Reopening without reassignment preserves the assigner");
    console.log("Tasks integration passed: migration, visible empty menu, admin/user isolation, both stages, counts, assignment attribution, reassignment, completion/reopening, permissions, and removed executors.");
  } finally {
    // Dispose the database after preserving immutable governance/auth history.

    await prisma.$disconnect();
  }
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
