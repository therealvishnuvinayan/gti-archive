import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { WorkflowDefinition } from "../src/lib/stage-builder/contracts";

type Harness = { db: PrismaClient; user: (id: string) => Promise<{ id: string }>; require: NodeRequire; compiledRoot: string; seedObject: (key: string) => unknown; storageWrites: () => number };

// All boundary records use the real workflow, upload, stage and final completion
// services. No trigger bypass, fabricated completion or live storage is used.
export async function runRuntimeArchiveBounds(h: Harness) {
  const { db, user } = h, load = (name: string) => h.require(join(h.compiledRoot, `src/lib/${name}.js`));
  const drafts = load("stage-builder/service") as typeof import("../src/lib/stage-builder/service");
  const publication = load("stage-builder/publication") as typeof import("../src/lib/stage-builder/publication");
  const runtime = load("stage-runtime/service") as typeof import("../src/lib/stage-runtime/service");
  const completion = load("runtime-completion/service") as typeof import("../src/lib/runtime-completion/service");
  const archive = load("archive-runtime/service") as typeof import("../src/lib/archive-runtime/service");
  const director = await user("director");
  const definition: WorkflowDefinition = { schemaVersion: 1, name: "Archive boundary fixture", description: "Synthetic revision history", intendedProjectType: "CUSTOM", stages: [{ id: "outputs", title: "Outputs", description: "Exact versions", position: 0, gates: [], capabilities: [{ id: "files", type: "FILE_REQUIREMENT", title: "Outputs", instructions: "Synthetic non-sensitive outputs", acceptedTypes: ["application/pdf"], minFiles: 1, maxFiles: 100, required: true, acceptance: "NONE", acceptedVersionsGate: false }] }] };
  const draft = await drafts.createDraft({ commandId: randomUUID(), definition });
  const proposal = await publication.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: "Boundary fixture" });
  const approved = await publication.decideWorkflowPublication(proposal.id, { expected: { ...proposal.expected, commandId: randomUUID() }, configurationHash: proposal.configurationHash, confirmed: true, outcome: "APPROVE", reason: "Review boundary workflow" });
  const version = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: approved.publishedVersion!.id } });
  for (const count of [500, 501]) {
    await user("director");
    const { projectId } = await runtime.createRuntimeProject({ commandId: randomUUID(), publishedVersionId: version.id, definitionHash: version.configurationHash, title: `Archive ${count} submission boundary`, description: "Disposable fixture", ownerId: "spm", coOwnerIds: [], executorIds: [] });
    const stage = await db.runtimeStage.findFirstOrThrow({ where: { projectId } });
    const command = async (action: string, extra = {}) => runtime.runtimeStageCommand(projectId, stage.id, { commandId: randomUUID(), expectedRevision: (await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).revision, action, ...extra });
    let supersedesId: string | null = null;
    await user("spm");
    for (let i = 0; i < count; i++) {
      const result = await command("UPLOAD_PREPARED", { capabilityId: "files", fileName: `boundary-${i}.pdf`, mimeType: "application/pdf", fileSize: 100, supersedesId: i < 51 ? null : supersedesId }) as { submissionId: string };
      const row = await db.runtimeFileSubmission.findUniqueOrThrow({ where: { id: result.submissionId } });
      h.seedObject(row.stagingKey);
      await command("FILE_SUBMITTED", { submissionId: row.id });
      supersedesId = row.id;
    }
    await command("COMPLETED", { reason: "Complete current versions" });
    const finish = async (action: string, extra = {}) => {
      const view = await completion.getRuntimeCompletion(projectId);
      return completion.runtimeCompletionCommand(projectId, { commandId: randomUUID(), expectedRevision: view.revision, expectedProjectRevision: view.projectRevision, expectedPolicyRevision: view.policyRevision, action, ...extra });
    };
    await user("director");
    await finish("POLICY_APPROVED", { settings: { AUTHORITY_APPROVAL_PROOF: "NOT_APPLICABLE", COPYRIGHT_TRANSFER: "NOT_APPLICABLE", INVOICE: "NOT_APPLICABLE" }, reason: "Synthetic outputs", confirmed: true });
    await user("spm");
    await finish("COMPLETION_REQUESTED", { reason: "Owner requests completion", confirmed: true });
    await user("director");
    const request = (await completion.getRuntimeCompletion(projectId)).requests.find(r => r.state === "PENDING")!;
    await finish("COMPLETION_DECIDED", { requestId: request.id, requestHash: request.hash, outcome: "APPROVE", reason: "Final Director approval", confirmed: true });
    assert.equal(await db.runtimeFileSubmission.count({ where: { stageId: stage.id } }), count);
    if (count === 501) {
      await assert.rejects(() => archive.readRuntimeArchivePublication(director, projectId), e => e instanceof Error && /500-item/.test(e.message));
      assert.equal(await db.runtimeArchivePublication.count({ where: { projectId } }), 0);
      continue;
    }
    const view = await archive.readRuntimeArchivePublication(director, projectId);
    assert.equal(view.files.length, 500);
    const eligible = view.files.filter(f => f.eligible);
    assert.equal(eligible.length, 51);
    assert.equal(view.files.filter(f => !f.eligible).length, 449);
    const manifest = { projectId, finalDecisionId: view.finalDecision.id, publishedVersionId: version.id, categoryId: "open", folderId: null, nonSensitiveConfirmed: true, files: eligible.map(f => ({ submissionId: f.submissionId, referenceId: f.referenceId!, versionId: f.versionId })) };
    const input = { commandId: randomUUID(), reason: "Review exact non-sensitive outputs", confirmed: true, manifest };
    await assert.rejects(() => archive.publishRuntimeArchive(director, input), /Invalid runtime Archive publication/);
    assert.equal(await db.runtimeArchivePublication.count({ where: { projectId } }), 0);
    const rejected = view.files.find(f => !f.eligible)!;
    await assert.rejects(() => archive.publishRuntimeArchive(director, { ...input, manifest: { ...manifest, files: [{ submissionId: rejected.submissionId, referenceId: rejected.referenceId!, versionId: rejected.versionId }] } }), /source, destination or publication changed/);
    const sourceSnapshot = async () => JSON.stringify([await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } }), await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } }), await db.runtimeFileSubmission.findMany({ where: { stageId: stage.id }, orderBy: { id: "asc" }, include: { version: true, sharedReference: true } }), await db.runtimeCompletionRequest.findMany({ where: { projectId } }), await db.runtimeCompletionDecision.findMany({ where: { projectId } })]);
    const before = await sourceSnapshot(), writes = h.storageWrites();
    const result = await archive.publishRuntimeArchive(director, { ...input, manifest: { ...manifest, files: manifest.files.slice(0, 50) } });
    assert.equal(await db.runtimeArchiveFile.count({ where: { publicationId: result.publicationId } }), 50);
    assert.equal(await sourceSnapshot(), before);
    assert.equal(h.storageWrites(), writes);
  }
  console.log("PASS Phase 6.5 persisted boundaries: 500 submissions reviewable; 501 denied; 50 exact files published; 51 rejected with zero publication; 449 superseded versions excluded; original sources unchanged; zero Archive storage writes.");
}
