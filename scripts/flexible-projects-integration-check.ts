import { randomUUID } from "node:crypto";

import {
  AttachmentStatus,
  FlexibleMilestoneStatus,
  ProjectExecutionType,
  ProjectPriority,
  UserRole,
} from "@prisma/client";

import { createProjectV2 } from "../src/lib/project-creation";
import {
  createFlexibleMilestone,
  createFlexibleMilestoneNote,
  createFlexibleProject,
  deleteFlexibleMilestone,
  deleteFlexibleMilestoneNote,
  duplicateFlexibleMilestone,
  getFlexibleMilestoneDetail,
  getFlexibleProjectDetail,
  getFlexibleProjectsList,
  moveFlexibleMilestone,
  setFlexibleMilestoneCompleted,
  updateFlexibleMilestone,
  updateFlexibleProject,
} from "../src/lib/flexible-projects";
import { prisma } from "../src/lib/prisma";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Flexible Projects integration failed: ${message}`);
}

function isError(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

async function main() {
  const runId = randomUUID();
  const ids = {
    owner: `flex-owner-${runId}`,
    collaborator: `flex-collaborator-${runId}`,
    unrelated: `flex-unrelated-${runId}`,
    admin: `flex-admin-${runId}`,
    superAdmin: `flex-super-admin-${runId}`,
  };
  const userIds = Object.values(ids);
  const flexibleProjectIds: string[] = [];
  let artworkProjectId: string | null = null;

  try {
    await prisma.user.createMany({
      data: [
        { id: ids.owner, email: `${ids.owner}@example.test`, name: "Flexible Owner", passwordHash: "x", role: UserRole.USER, projectCreationAccessGranted: true },
        { id: ids.collaborator, email: `${ids.collaborator}@example.test`, name: "Flexible Collaborator", passwordHash: "x", role: UserRole.USER },
        { id: ids.unrelated, email: `${ids.unrelated}@example.test`, name: "Unrelated User", passwordHash: "x", role: UserRole.USER },
        { id: ids.admin, email: `${ids.admin}@example.test`, name: "Flexible Admin", passwordHash: "x", role: UserRole.ADMIN },
        { id: ids.superAdmin, email: `${ids.superAdmin}@example.test`, name: "Flexible Super Admin", passwordHash: "x", role: UserRole.SUPER_ADMIN },
      ],
    });

    const owner = { id: ids.owner, role: UserRole.USER, projectCreationAccessGranted: true };
    const collaborator = { id: ids.collaborator, role: UserRole.USER };
    const unrelated = { id: ids.unrelated, role: UserRole.USER };
    const admin = { id: ids.admin, role: UserRole.ADMIN };
    const superAdmin = { id: ids.superAdmin, role: UserRole.SUPER_ADMIN };

    const denied = await createFlexibleProject(unrelated, {
      name: "Denied Flexible Project",
      ownerId: ids.unrelated,
      collaboratorIds: [],
      priority: ProjectPriority.LOW,
      scope: ProjectExecutionType.INTERNAL,
    });
    check(isError(denied), "a USER without project-create access could create a Flexible Project");

    const created = await createFlexibleProject(owner, {
      name: "Persisted Flexible Project",
      description: "<p>Persisted brief</p><script>alert(1)</script>",
      ownerId: ids.owner,
      collaboratorIds: [ids.collaborator],
      deadline: "2026-12-31",
      priority: ProjectPriority.HIGH,
      scope: ProjectExecutionType.EXTERNAL,
    });
    check(!isError(created), "authorized creation failed");
    flexibleProjectIds.push(created.projectId);

    const stored = await prisma.flexibleProject.findUnique({
      where: { id: created.projectId },
      include: { collaborators: true },
    });
    check(stored?.ownerId === ids.owner, "owner did not persist");
    check(stored?.collaborators.some(({ userId }) => userId === ids.collaborator), "collaborator did not persist");
    check(stored?.priority === ProjectPriority.HIGH, "priority did not persist");
    check(stored?.scope === ProjectExecutionType.EXTERNAL, "scope did not persist");
    check(stored?.deadline?.toISOString().startsWith("2026-12-31"), "deadline did not persist");
    check(stored?.description?.includes("Persisted brief") && !stored.description.includes("script"), "description was not sanitized and persisted");
    check(!(await prisma.project.findUnique({ where: { id: created.projectId } })), "Flexible Project leaked into the Artwork Project model");

    const ownerList = await getFlexibleProjectsList(owner);
    const collaboratorList = await getFlexibleProjectsList(collaborator);
    const unrelatedList = await getFlexibleProjectsList(unrelated);
    check(ownerList.some(({ id }) => id === created.projectId), "owner cannot list the project");
    check(collaboratorList.some(({ id }) => id === created.projectId), "collaborator cannot list the project");
    check(!unrelatedList.some(({ id }) => id === created.projectId), "unrelated USER can list the project");
    check((await getFlexibleProjectDetail(created.slug, admin))?.id === created.projectId, "ADMIN cannot access the project");
    check((await getFlexibleProjectDetail(created.slug, superAdmin))?.id === created.projectId, "SUPER_ADMIN cannot access the project");
    check((await getFlexibleProjectDetail(created.slug, unrelated)) === null, "unrelated USER can open the project");
    check((await getFlexibleProjectDetail("missing-project", owner)) === null, "missing slug did not return null");

    const milestoneOne = await createFlexibleMilestone(owner, created.projectId, {
      name: "Brief",
      category: "Planning",
      responsibleUserId: ids.owner,
      deadline: "2026-09-01",
      description: "<p>Agree the brief.</p>",
    });
    const milestoneTwo = await createFlexibleMilestone(collaborator, created.projectId, {
      name: "Design",
      category: "Creative",
      responsibleUserId: ids.collaborator,
      deadline: "2026-10-01",
    });
    const milestoneThree = await createFlexibleMilestone(owner, created.projectId, {
      name: "Handover",
      category: "Delivery",
      responsibleUserId: ids.owner,
    });
    check(!isError(milestoneOne) && !isError(milestoneTwo) && !isError(milestoneThree), "milestone creation failed");

    await prisma.flexibleProjectAttachment.create({
      data: {
        projectId: created.projectId,
        milestoneId: milestoneOne.milestoneId,
        uploadedById: ids.owner,
        fileName: "persisted.pdf",
        originalFileName: "persisted.pdf",
        mimeType: "application/pdf",
        fileSize: 512,
        bucket: "flexible-projects-integration",
        storageKey: `flexible-projects/${created.projectId}/milestones/${milestoneOne.milestoneId}/attachments/persisted.pdf`,
        status: AttachmentStatus.READY,
      },
    });
    const milestoneBrief = await getFlexibleMilestoneDetail(created.slug, milestoneOne.milestoneId, owner);
    check(milestoneBrief?.milestone.attachments.length === 1, "attachment did not appear in the milestone brief");
    check(
      milestoneBrief?.project.milestones.find(({ id }) => id === milestoneTwo.milestoneId)?.attachments.length === 0,
      "milestone attachment leaked into another timeline entry",
    );

    const ownerNote = await createFlexibleMilestoneNote(owner, created.projectId, milestoneOne.milestoneId, {
      content: "Confirm the final brief with the client.",
    });
    const collaboratorNote = await createFlexibleMilestoneNote(collaborator, created.projectId, milestoneOne.milestoneId, {
      content: "Schedule the internal review.",
    });
    check(!isError(ownerNote) && !isError(collaboratorNote), "milestone note creation failed");
    check(
      isError(await createFlexibleMilestoneNote(owner, created.projectId, milestoneOne.milestoneId, { content: "   " })),
      "blank milestone note was accepted",
    );
    check(
      isError(await createFlexibleMilestoneNote(unrelated, created.projectId, milestoneOne.milestoneId, { content: "Hidden note" })),
      "unrelated user added a milestone note",
    );

    const ownerNoteView = await getFlexibleMilestoneDetail(created.slug, milestoneOne.milestoneId, owner);
    check(ownerNoteView?.milestone.notes.length === 2, "milestone notes did not appear in the brief");
    check(ownerNoteView?.milestone.notes.every(({ canDelete }) => canDelete), "project owner cannot delete milestone notes");
    const collaboratorNoteView = await getFlexibleMilestoneDetail(created.slug, milestoneOne.milestoneId, collaborator);
    check(
      collaboratorNoteView?.milestone.notes.find(({ id }) => id === collaboratorNote.noteId)?.canDelete === true,
      "note author cannot delete their own note",
    );
    check(
      collaboratorNoteView?.milestone.notes.find(({ id }) => id === ownerNote.noteId)?.canDelete === false,
      "collaborator can delete another user's note",
    );
    check(
      isError(await deleteFlexibleMilestoneNote(collaborator, created.projectId, milestoneOne.milestoneId, ownerNote.noteId)),
      "collaborator deleted another user's note",
    );
    check(
      !isError(await deleteFlexibleMilestoneNote(collaborator, created.projectId, milestoneOne.milestoneId, collaboratorNote.noteId)),
      "note author could not delete their own note",
    );
    check(
      (await getFlexibleMilestoneDetail(created.slug, milestoneOne.milestoneId, owner))?.milestone.notes.length === 1,
      "deleted milestone note remained in the brief",
    );

    const invalidResponsible = await createFlexibleMilestone(owner, created.projectId, {
      name: "Invalid assignment",
      responsibleUserId: ids.unrelated,
    });
    check(isError(invalidResponsible), "unrelated responsible user was accepted");

    const updatedMilestone = await updateFlexibleMilestone(owner, created.projectId, milestoneOne.milestoneId, {
      name: "Approved Brief",
      category: "Planning",
      responsibleUserId: ids.collaborator,
      deadline: "2026-09-02",
      description: "Updated brief",
    });
    check(!isError(updatedMilestone), "milestone edit failed");

    const completed = await setFlexibleMilestoneCompleted(collaborator, created.projectId, milestoneOne.milestoneId, true);
    check(!isError(completed), "collaborator could not complete a milestone");
    let detail = await getFlexibleProjectDetail(created.slug, owner);
    check(detail?.progress === 33, "progress did not recalculate after completion");
    check(detail?.milestones.find(({ id }) => id === milestoneOne.milestoneId)?.status === FlexibleMilestoneStatus.COMPLETED, "completion did not persist");

    check(!isError(await moveFlexibleMilestone(owner, created.projectId, milestoneOne.milestoneId, "down")), "move down failed");
    check(!isError(await moveFlexibleMilestone(owner, created.projectId, milestoneThree.milestoneId, "up")), "move up failed");
    detail = await getFlexibleProjectDetail(created.slug, owner);
    check(detail?.milestones.map(({ name }) => name).join(",") === "Design,Handover,Approved Brief", "milestone ordering did not persist");
    check(detail?.milestones.map(({ order }) => order).join(",") === "1,2,3", "milestone ordering contains gaps or duplicates");

    const duplicate = await duplicateFlexibleMilestone(owner, created.projectId, milestoneThree.milestoneId);
    check(!isError(duplicate), "duplicate failed");
    const duplicatedRow = await prisma.flexibleMilestone.findUnique({ where: { id: duplicate.milestoneId } });
    check(duplicatedRow?.status === FlexibleMilestoneStatus.PENDING && !duplicatedRow.completedAt, "duplicate copied completion state");
    detail = await getFlexibleProjectDetail(created.slug, owner);
    check(detail?.milestones[2]?.id === duplicate.milestoneId, "duplicate was not inserted after the original");

    check(!isError(await deleteFlexibleMilestone(owner, created.projectId, milestoneTwo.milestoneId)), "delete failed");
    detail = await getFlexibleProjectDetail(created.slug, owner);
    check(detail?.milestones.map(({ order }) => order).join(",") === "1,2,3", "delete did not close the ordering gap");

    const second = await createFlexibleProject(admin, {
      name: "Second Flexible Project",
      ownerId: ids.admin,
      collaboratorIds: [],
      priority: ProjectPriority.MEDIUM,
      scope: ProjectExecutionType.INTERNAL,
    });
    check(!isError(second), "second project creation failed");
    flexibleProjectIds.push(second.projectId);
    const crossProjectMutation = await updateFlexibleMilestone(admin, second.projectId, milestoneOne.milestoneId, { name: "Cross-project edit" });
    check(isError(crossProjectMutation), "cross-project milestone mutation succeeded");

    await prisma.flexibleProject.update({
      where: { id: created.projectId },
      data: {
        priority: ProjectPriority.URGENT,
        status: "COMPLETED",
      },
    });
    const prioritySortedProjects = await getFlexibleProjectsList(superAdmin);
    check(
      prioritySortedProjects.slice(0, 2).map(({ id }) => id).join(",") ===
        [second.projectId, created.projectId].join(","),
      "Priority sorting must keep the active Medium project ahead of the completed Urgent project",
    );

    check(!isError(await setFlexibleMilestoneCompleted(owner, created.projectId, milestoneOne.milestoneId, false)), "reopen failed");
    detail = await getFlexibleProjectDetail(created.slug, owner);
    check(detail?.progress === 0, "progress did not recalculate after reopen");

    const editedProject = await updateFlexibleProject(owner, created.projectId, {
      name: "Updated Flexible Project",
      description: "Updated project brief",
      ownerId: ids.owner,
      collaboratorIds: [ids.collaborator],
      deadline: "2027-01-15",
      priority: ProjectPriority.LOW,
      scope: ProjectExecutionType.INTERNAL,
    });
    check(!isError(editedProject), "project edit failed");

    const artwork = await createProjectV2(admin, {
      name: "Artwork Regression Project",
      ownerId: ids.admin,
      coOwnerIds: [],
      executorIds: [ids.unrelated],
      collaboratorIds: [],
    });
    check(!isError(artwork), "Artwork Project creation regression failed");
    artworkProjectId = artwork.projectId;
    check(await prisma.projectWorkflowStage.count({ where: { projectId: artwork.projectId } }) === 7, "Artwork Project no longer creates the fixed seven-stage workflow");

    console.log("Flexible Projects integration check passed.");
  } finally {
    if (artworkProjectId) await prisma.project.deleteMany({ where: { id: artworkProjectId } });
    await prisma.flexibleProject.deleteMany({ where: { id: { in: flexibleProjectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
