import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FlexibleMilestoneStatus, FlexibleProjectStatus, ProjectPriority, UserRole } from "@prisma/client";
import { getFlexibleProjectsList, getFlexibleProjectsPage } from "../src/lib/flexible-projects";
import { getProjectsList } from "../src/lib/projects";
import { getUserProjectsList } from "../src/lib/user-projects";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";
import { prisma } from "../src/lib/prisma";

const prefix = `pagination-${randomUUID()}`;
const actor = (name: string, role: UserRole = UserRole.USER) => ({ id: `${prefix}-${name}`, role });
const owner = actor("owner"), collaborator = actor("collaborator"), outsider = actor("outsider"), admin = actor("admin", UserRole.ADMIN);
const users = [owner, collaborator, outsider, admin];
const privateIds = Array.from({ length: 101 }, (_, i) => `${prefix}-private-${i}`);
const publicIds = Array.from({ length: 101 }, (_, i) => `${prefix}-public-${i}`);
const priorities = [ProjectPriority.URGENT, ProjectPriority.HIGH, ProjectPriority.MEDIUM, ProjectPriority.LOW];

async function main() {
  await prisma.user.createMany({ data: users.map((user) => ({ ...user, name: user.id, email: `${user.id}@example.test`, passwordHash: "test" })) });
  await prisma.flexibleProject.createMany({ data: privateIds.map((id, i) => ({
    id, slug: id, name: `Private ${String(i).padStart(3, "0")}`, ownerId: i === 100 ? outsider.id : owner.id, createdById: owner.id,
    priority: priorities[i % priorities.length], status: i % 7 === 0 ? FlexibleProjectStatus.COMPLETED : FlexibleProjectStatus.ACTIVE,
    updatedAt: new Date(1_700_000_000_000 + i * 1_000),
  })) });
  await prisma.flexibleProjectCollaborator.createMany({ data: privateIds.slice(0, 100).filter((_, i) => i % 2 === 0).map((projectId) => ({ projectId, userId: collaborator.id })) });
  await prisma.flexibleMilestone.createMany({ data: [0, 1, 2].map((i) => ({ projectId: privateIds[0], name: `Milestone ${i}`, sortOrder: i, status: i === 0 ? FlexibleMilestoneStatus.COMPLETED : FlexibleMilestoneStatus.PENDING })) });
  await prisma.project.createMany({ data: publicIds.map((id, i) => ({ id, name: `Collaborative ${String(i).padStart(3, "0")}`, ownerId: i === 100 ? outsider.id : owner.id, createdById: owner.id, priority: priorities[i % priorities.length] })) });
  await prisma.projectWorkflowStage.createMany({ data: publicIds.flatMap((projectId) => getInitialProjectWorkflowStageData(new Date()).map((stage) => ({ ...stage, projectId }))) });

  const expected = await getFlexibleProjectsList(owner);
  const privateSeen: string[] = [], userSeen: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const privateResult = await getFlexibleProjectsPage(owner, page);
    assert.equal(privateResult.total, 100);
    assert.equal(privateResult.pageSize, 20);
    assert.equal(privateResult.page, page);
    assert.equal(privateResult.projects.length, 20);
    privateSeen.push(...privateResult.projects.map(({ id }) => id));
    const userResult = await getUserProjectsList({ filter: "ALL", sort: "priority", query: "", page }, owner);
    assert.equal(userResult.total, 100);
    assert.equal(userResult.pageSize, 20);
    assert.equal(userResult.projects.length, 20);
    userSeen.push(...userResult.projects.map(({ id }) => id));
  }
  assert.deepEqual(privateSeen, expected.map(({ id }) => id), "Paging preserves existing priority/completion/recency ordering");
  assert.equal(new Set(privateSeen).size, 100, "All private projects are reachable without duplicates");
  assert.equal(new Set(userSeen).size, 100, "All user Collaborative projects are reachable without duplicates");
  assert(!privateSeen.includes(privateIds[100]) && !userSeen.includes(publicIds[100]), "Owner pages exclude unrelated projects");
  const withMilestones = expected.findIndex(({ id }) => id === privateIds[0]);
  const milestonePage = await getFlexibleProjectsPage(owner, Math.floor(withMilestones / 20) + 1);
  const summary = milestonePage.projects.find(({ id }) => id === privateIds[0]);
  assert.equal(summary?.completedMilestones, 1);
  assert.equal(summary?.totalMilestones, 3);
  assert.equal(summary?.progress, 33);
  const collaboratorResult = await getFlexibleProjectsPage(collaborator, 3);
  assert.equal(collaboratorResult.total, 50);
  assert.equal(collaboratorResult.projects.length, 10);
  const adminPrivate = await getFlexibleProjectsPage(admin, 6);
  assert.equal(adminPrivate.total, 101);
  assert.equal(adminPrivate.projects.length, 1);
  const adminPublic = await getProjectsList({ page: 6, status: "ALL", sort: "updated", query: "" }, admin);
  assert.equal(adminPublic.total, 101);
  assert.equal(adminPublic.projects.length, 1, "Existing admin pagination remains 20 per page");
  const outsiderPage = await getFlexibleProjectsPage(outsider, 99);
  assert.equal(outsiderPage.total, 1);
  assert.equal(outsiderPage.page, 1);
  const empty = await getFlexibleProjectsPage({ id: `${prefix}-missing`, role: UserRole.USER }, 100);
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.projects.length, 0);
  for (const page of [0, -2, NaN, Infinity]) assert.equal((await getFlexibleProjectsPage(owner, page)).page, 1);
  assert.equal((await getFlexibleProjectsPage(owner, 2.8)).page, 2);
  assert.equal((await getFlexibleProjectsPage(owner, 100)).page, 5, "Out-of-range page links resolve to the last valid page");
  console.log("Project pagination database checks passed: 100 projects over five pages, ordering, summaries, permissions, 20-item boundaries, admin pagination, and invalid/stale pages.");
}

main().finally(async () => {
  await prisma.project.deleteMany({ where: { id: { in: publicIds } } });
  await prisma.flexibleProject.deleteMany({ where: { id: { in: privateIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
