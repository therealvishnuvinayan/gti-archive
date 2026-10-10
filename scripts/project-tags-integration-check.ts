import assert from "node:assert/strict";

import { UserRole } from "@prisma/client";

import { createProjectV2, updateProjectV2, type CreateProjectV2Input } from "../src/lib/project-creation";
import { prisma } from "../src/lib/prisma";
import { getProjectsList } from "../src/lib/projects";
import { getUserProjectsList } from "../src/lib/user-projects";
import { getProjectTagColors, validateProjectTags } from "../src/lib/project-tags";

async function main() {
  const admin = await prisma.user.create({ data: {
    email: "project-tags-admin@example.test", passwordHash: "x", role: UserRole.SUPER_ADMIN,
  } });
  const executor = await prisma.user.create({ data: {
    email: "project-tags-executor@example.test", passwordHash: "x", role: UserRole.USER,
  } });
  const base: CreateProjectV2Input = {
    name: "Project tags QA", ownerId: admin.id, coOwnerIds: [], executorIds: [executor.id], tags: ["Packaging"],
  };
  try {
    // Server checks include malformed direct action payloads, independent of the UI.
    const projectCount = await prisma.project.count();
    const tagCount = await prisma.projectTag.count();
    for (const tags of [undefined, null, "one", [], [""], ["  "], [7], ["Brand", "brand"], ["1", "2", "3", "4", "5"]]) {
      const result = await createProjectV2(admin, { ...base, tags } as CreateProjectV2Input);
      assert("error" in result && result.fieldErrors?.tags, `Reject invalid tags: ${JSON.stringify(tags)}`);
    }
    assert.equal(await prisma.project.count(), projectCount, "Invalid tags create no projects");
    assert.equal(await prisma.projectTag.count(), tagCount, "Invalid tags create no tag records");

    const one = await createProjectV2(admin, { ...base, tags: ["  Packaging  "] });
    assert("projectId" in one, "One tag succeeds");
    const four = await createProjectV2(admin, { ...base, name: "Four tags", tags: ["packaging", "Design", "Urgent", "RFQ LLC"] });
    assert("projectId" in four, "Four tags succeed");
    const readTags = (projectId: string) => prisma.projectTagAssignment.findMany({
      where: { projectId }, select: { tag: { select: { name: true, id: true } } },
    });
    assert.deepEqual((await readTags(one.projectId)).map(({ tag }) => tag.name), ["Packaging"]);
    const fourTags = await readTags(four.projectId);
    assert.equal(fourTags.length, 4);
    assert.equal(fourTags.find(({ tag }) => tag.name === "Packaging")?.tag.id, (await readTags(one.projectId))[0].tag.id, "Reuse existing names ignoring case");
    assert.equal(await prisma.projectTag.count({ where: { name: { equals: "Packaging", mode: "insensitive" } } }), 1);

    // Actual database queries and mapping for both audiences, including tag search.
    for (const sort of ["priority", "name-asc"] as const) {
      const listed = await getProjectsList({ query: "rfq llc", sort }, admin);
      assert.equal(listed.total, 1);
      assert.equal(listed.projects[0].id, four.projectId);
      assert.deepEqual(new Set(listed.projects[0].tags), new Set(["Packaging", "Design", "Urgent", "RFQ LLC"]));
    }
    const userList = await getUserProjectsList({ query: "rfq llc", filter: "ALL", sort: "updated", page: 1 }, executor);
    assert.equal(userList.total, 1);
    assert.equal(userList.projects[0].id, four.projectId);
    assert.equal(userList.projects[0].tags?.length, 4);

    const edited = await updateProjectV2(admin, four.projectId, { ...base, tags: ["New label", "Packaging"] });
    assert("projectId" in edited);
    assert.deepEqual(new Set((await readTags(four.projectId)).map(({ tag }) => tag.name)), new Set(["New label", "Packaging"]));
    assert.equal((await readTags(one.projectId)).length, 1, "Editing one project preserves others' tags");
    const rejectedEdit = await updateProjectV2(admin, four.projectId, { ...base, tags: [] });
    assert("error" in rejectedEdit && rejectedEdit.fieldErrors?.tags);
    assert.equal((await readTags(four.projectId)).length, 2, "Rejected edit preserves assignments");
    const { tags: omitted, ...participantsOnly } = base;
    void omitted;
    assert("projectId" in await updateProjectV2(admin, four.projectId, participantsOnly));
    assert.equal((await readTags(four.projectId)).length, 2, "Old callers omitting tags preserve assignments");

    // A later write failure must roll back new shared tags along with the project.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_tag_test_notification() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced tag transaction failure'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_tag_test_notification BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION fail_tag_test_notification()`);
    await assert.rejects(() => createProjectV2(admin, { ...base, tags: ["Rollback-only tag"] }));
    assert.equal(await prisma.projectTag.count({ where: { name: "Rollback-only tag" } }), 0, "Failed project creation leaves no orphan tag");
    await prisma.$executeRawUnsafe(`DROP TRIGGER fail_tag_test_notification ON "Notification"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION fail_tag_test_notification()`);

    assert.deepEqual(validateProjectTags(["  Anything / العربية  "]), { tags: ["Anything / العربية"] });
    const colors = getProjectTagColors(["A", "I", "Q", "Y"]); // Deliberate hash collisions.
    assert.equal(new Set(colors).size, 4, "Four tags always have different colors");
    assert.deepEqual(getProjectTagColors(["A", "I", "Q", "Y"]), colors, "Colors remain stable on refresh");
    console.log("Project tags integration passed: bounds, validation, persistence, reuse, both lists/search, editing, transaction rollback, and colors.");
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_tag_test_notification ON "Notification"`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_tag_test_notification()`).catch(() => undefined);
    await prisma.project.deleteMany({ where: { createdById: admin.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, executor.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
