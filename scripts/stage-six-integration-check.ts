import { randomUUID } from "node:crypto";
import {
  AttachmentAssetType,
  AttachmentStatus,
  ProductionApprovalRecipientType,
  ProductionApprovalStepStatus,
  ProductionHandoverDeliveryStatus,
  ProductionHandoverRoute,
  ProjectFileChecklistField,
  ProjectFileChecklistItemStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestStatus,
  ProjectFileChecklistRequestWorkflowStatus,
  ProjectProductionUnitStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import type { SendEmailInput } from "../src/lib/email/resend";
import { prisma } from "../src/lib/prisma";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";
import {
  addProductionApprover,
  addProductionUnitFile,
  completeStageFive,
  completeStageSix,
  configureMarketingDirector,
  decideProductionApproval,
  getAuthenticatedProductionApprovalData,
  getExternalProductionApprovalData,
  getExternalProductionHandoverData,
  getProductionApprovalFileUrl,
  getProductionHandoverFileUrl,
  getStageSixWorkspaceData,
  handoverProductionUnit,
  removeProductionApprover,
  reorderProductionApprover,
} from "../src/lib/stage-six";
import { STAGE_SIX_FIRST_APPROVER } from "../src/lib/stage-six-constants";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage 6 integration check failed: ${message}`);
}

function isError(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

async function expectRejected(task: Promise<unknown>, message: string) {
  let rejected = false;
  try {
    await task;
  } catch {
    rejected = true;
  }
  check(rejected, message);
}

function approvalToken(email: SendEmailInput) {
  const token = email.text.match(/\/external\/production-approval\/([A-Za-z0-9_-]{43})/)?.[1];
  check(token, "approval email must contain a raw secure token");
  return token;
}

function handoverToken(email: SendEmailInput) {
  const token = email.text.match(/\/external\/production-handover\/([A-Za-z0-9_-]{43})/)?.[1];
  check(token, "handover email must contain a raw secure token");
  return token;
}

async function createProjectFixture(input: {
  id: string;
  name: string;
  ownerId: string;
  coOwnerId: string;
  collaboratorIds: string[];
  sourceCount: number;
  runId: string;
}) {
  await prisma.project.create({
    data: {
      id: input.id,
      name: input.name,
      createdById: input.ownerId,
      ownerId: input.ownerId,
      coOwners: { create: [{ userId: input.coOwnerId, addedById: input.ownerId }] },
      collaborators: {
        create: input.collaboratorIds.map((userId) => ({
          userId,
          addedById: input.ownerId,
          canInteract: true,
          canDownloadFiles: true,
        })),
      },
      workflowStages: {
        create: getInitialProjectWorkflowStageData().map((stage, index) => {
          const now = new Date();
          return {
            ...stage,
            status:
              index < 4
                ? ProjectWorkflowStageStatus.COMPLETED
                : index === 4
                  ? ProjectWorkflowStageStatus.AVAILABLE
                  : ProjectWorkflowStageStatus.LOCKED,
            unlockedAt: index <= 4 ? now : null,
            completedAt: index < 4 ? now : null,
          };
        }),
      },
    },
  });

  const sourceIds: string[] = [];
  const checklistIds: string[] = [];
  for (let index = 0; index < input.sourceCount; index += 1) {
    const sourceAttachmentId = `${input.id}-source-${index}`;
    sourceIds.push(sourceAttachmentId);
    await prisma.projectAttachment.create({
      data: {
        id: sourceAttachmentId,
        projectId: input.id,
        uploadedById: input.ownerId,
        fileName: `final-${index}-${input.runId}.pdf`,
        originalFileName: `Final-${index + 1}.pdf`,
        mimeType: "application/pdf",
        fileSize: 1024 + index,
        bucket: "stage-six-integration",
        storageKey: `stage-six/${input.runId}/${input.id}/source-${index}`,
        assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET,
        status: AttachmentStatus.READY,
      },
    });
    const handoff = await prisma.projectStageFileHandoff.create({
      data: {
        projectId: input.id,
        sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
        sourceAttachmentId,
        targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
        handedOffById: input.ownerId,
      },
    });
    const checklist = await prisma.projectFileChecklist.create({
      data: {
        projectId: input.id,
        handoffId: handoff.id,
        sourceAttachmentId,
        items: {
          create: [
            {
              fieldKey: ProjectFileChecklistField.OUTPUT_NAME,
              value: { text: `Output ${index + 1}` },
              status: ProjectFileChecklistItemStatus.FILLED,
              updatedById: input.ownerId,
            },
            {
              fieldKey: ProjectFileChecklistField.HEALTH_WARNING,
              value: { text: `Private warning ${index + 1}`, included: true },
              status: ProjectFileChecklistItemStatus.FILLED,
              updatedById: input.ownerId,
            },
          ],
        },
      },
    });
    checklistIds.push(checklist.id);
  }
  return { sourceIds, checklistIds };
}

async function main() {
  const runId = randomUUID();
  const ids = {
    owner: `s6-owner-${runId}`,
    coOwner: `s6-coowner-${runId}`,
    approver: `s6-approver-${runId}`,
    secondApprover: `s6-second-${runId}`,
    outsider: `s6-outsider-${runId}`,
    admin: `s6-admin-${runId}`,
    superAdmin: `s6-super-${runId}`,
    project: `s6-main-${runId}`,
    rejectProject: `s6-reject-${runId}`,
    foreignProject: `s6-foreign-${runId}`,
  };
  const userIds = [ids.owner, ids.coOwner, ids.approver, ids.secondApprover, ids.outsider, ids.admin, ids.superAdmin];
  const emailLog: SendEmailInput[] = [];
  const sendSuccess = async (email: SendEmailInput) => {
    emailLog.push(email);
    return { ok: true as const, id: `mock-${emailLog.length}` };
  };
  const sendFailure = async () => ({ ok: false as const, error: "Mock delivery failure" });

  try {
    await prisma.user.createMany({
      data: [
        [ids.owner, UserRole.ADMIN],
        [ids.coOwner, UserRole.ADMIN],
        [ids.approver, UserRole.USER],
        [ids.secondApprover, UserRole.USER],
        [ids.outsider, UserRole.USER],
        [ids.admin, UserRole.ADMIN],
        [ids.superAdmin, UserRole.SUPER_ADMIN],
      ].map(([id, role]) => ({
        id,
        email: `${id}@example.test`,
        name: id,
        passwordHash: "integration-only",
        role: role as UserRole,
      })),
    });
    const mainFixture = await createProjectFixture({
      id: ids.project,
      name: `Stage 6 Main ${runId}`,
      ownerId: ids.owner,
      coOwnerId: ids.coOwner,
      collaboratorIds: [ids.approver, ids.secondApprover],
      sourceCount: 2,
      runId,
    });
    const rejectFixture = await createProjectFixture({
      id: ids.rejectProject,
      name: `Stage 6 Reject ${runId}`,
      ownerId: ids.owner,
      coOwnerId: ids.coOwner,
      collaboratorIds: [ids.approver, ids.secondApprover],
      sourceCount: 1,
      runId,
    });
    const foreignFixture = await createProjectFixture({
      id: ids.foreignProject,
      name: `Stage 6 Foreign ${runId}`,
      ownerId: ids.outsider,
      coOwnerId: ids.superAdmin,
      collaboratorIds: [],
      sourceCount: 1,
      runId,
    });
    const firstItem = await prisma.projectFileChecklistItem.findUniqueOrThrow({
      where: {
        checklistId_fieldKey: {
          checklistId: mainFixture.checklistIds[0],
          fieldKey: ProjectFileChecklistField.OUTPUT_NAME,
        },
      },
    });
    await prisma.projectFileChecklistRequest.create({
      data: {
        clientRequestId: `pending-${runId}`,
        projectId: ids.project,
        checklistId: mainFixture.checklistIds[0],
        checklistItemId: firstItem.id,
        fieldKey: ProjectFileChecklistField.OUTPUT_NAME,
        requestedById: ids.owner,
        recipientUserId: ids.secondApprover,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        status: ProjectFileChecklistRequestStatus.SENT,
        workflowStatus: ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
      },
    });

    const owner = { id: ids.owner, role: UserRole.ADMIN };
    const coOwner = { id: ids.coOwner, role: UserRole.ADMIN };
    const approver = { id: ids.approver, role: UserRole.USER };
    const outsider = { id: ids.outsider, role: UserRole.USER };
    const admin = { id: ids.admin, role: UserRole.ADMIN };
    const superAdmin = { id: ids.superAdmin, role: UserRole.SUPER_ADMIN };
    const completedFive = await completeStageFive(owner, { projectId: ids.project });
    check(!isError(completedFive), "owner must complete Stage 5");
    check(completedFive.productionUnitCount === 2, "two Stage 5 files must create two units");
    check(completedFive.pendingRequestCount === 1 && completedFive.warning === "Some checklist information requests are still pending.", "pending requests must warn but allow completion");
    const retriedFive = await completeStageFive(coOwner, { projectId: ids.project });
    check(!isError(retriedFive) && !retriedFive.transitioned, "Stage 5 retry must be idempotent");
    check(await prisma.projectProductionUnit.count({ where: { projectId: ids.project } }) === 2, "Stage 5 retry must not duplicate units");
    const requiredSteps = await prisma.productionApprovalStep.findMany({ where: { productionUnit: { projectId: ids.project } } });
    check(requiredSteps.length === 2 && requiredSteps.every((step) => step.sequence === 1 && step.isMarketingDirectorRequired), "each unit must have protected Marketing Director Step 1");
    const workflowAfterFive = await prisma.projectWorkflowStage.findMany({ where: { projectId: ids.project } });
    check(workflowAfterFive.find((stage) => stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT)?.status === ProjectWorkflowStageStatus.COMPLETED, "Stage 5 must complete");
    check(workflowAfterFive.find((stage) => stage.stageKey === ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER)?.status === ProjectWorkflowStageStatus.AVAILABLE, "Stage 6 must unlock");
    check(workflowAfterFive.find((stage) => stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION)?.status === ProjectWorkflowStageStatus.LOCKED, "Stage 7 must stay locked");

    const units = await prisma.projectProductionUnit.findMany({ where: { projectId: ids.project }, orderBy: { createdAt: "asc" } });
    const [unitA, unitB] = units;
    check(
      (await getStageSixWorkspaceData(approver, ids.project)) === null,
      "project membership must not expose the Stage 6 manager workspace to a USER",
    );
    check(await getStageSixWorkspaceData(admin, ids.project), "ADMIN must have Stage 6 manager authority");
    check(await getStageSixWorkspaceData(superAdmin, ids.project), "SUPER_ADMIN must have Stage 6 manager authority");
    check(unitA.sourceHandoffId && unitA.sourceChecklistId && unitA.sourceAttachmentId, "Production Unit must preserve full Stage 5 lineage");
    const initialStep = requiredSteps.find((step) => step.productionUnitId === unitA.id);
    check(initialStep, "the first Production Unit must have its initial Marketing Director step");
    const productionAttachmentId = `s6-production-${runId}`;
    await prisma.projectAttachment.create({ data: { id: productionAttachmentId, projectId: ids.project, uploadedById: ids.owner, fileName: `production-${runId}.pdf`, originalFileName: "Production-A.pdf", mimeType: "application/pdf", fileSize: 2048, bucket: "stage-six-integration", storageKey: `stage-six/${runId}/production-a`, assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET, status: AttachmentStatus.READY } });
    const associated = await addProductionUnitFile(owner, { projectId: ids.project, productionUnitId: unitA.id, attachmentId: productionAttachmentId });
    check(!isError(associated) && !associated.duplicate, "manager must associate a same-project production file once");
    const forgedAssociation = await addProductionUnitFile(approver, {
      projectId: ids.project,
      productionUnitId: unitA.id,
      attachmentId: productionAttachmentId,
    });
    check(isError(forgedAssociation), "a project USER must not mutate Stage 6 manager files");
    const crossProjectAssociation = await addProductionUnitFile(owner, { projectId: ids.project, productionUnitId: unitA.id, attachmentId: foreignFixture.sourceIds[0] });
    check(isError(crossProjectAssociation), "cross-project production file injection must be denied");

    const invalidEmail = await addProductionApprover(owner, { clientRequestId: `invalid-email-${runId}`, projectId: ids.project, productionUnitId: unitA.id, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientEmail: "invalid", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId] });
    check(isError(invalidEmail), "invalid external approver email must be rejected");
    const additionalInput: Parameters<typeof addProductionApprover>[1] = { clientRequestId: `additional-${runId}`, projectId: ids.project, productionUnitId: unitA.id, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Printer", recipientEmail: "printer@example.test", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId], message: "Second review" };
    const concurrentAdds = await Promise.all([
      addProductionApprover(owner, additionalInput),
      addProductionApprover(owner, additionalInput),
    ]);
    check(concurrentAdds.every((result) => !isError(result)), "concurrent Add Approver submits must both resolve safely");
    const additional = concurrentAdds.find((result) => !isError(result) && !result.duplicate);
    check(additional && !isError(additional) && "step" in additional && additional.step && additional.step.sequence === 2, "additional approver must append after required Step 1");
    check(concurrentAdds.filter((result) => !isError(result) && result.duplicate).length === 1, "concurrent Add Approver submit must create exactly one step");
    const configuredA = await configureMarketingDirector(owner, { clientRequestId: `md-a-${runId}`, projectId: ids.project, productionUnitId: unitA.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.approver, sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId, productionAttachmentId], message: "Required review" }, { sendEmail: sendSuccess });
    check(!isError(configuredA) && "step" in configuredA && configuredA.step, "the fixed first approver must be assignable");
    const firstApproverMessage = emailLog.at(-1)!;
    check(firstApproverMessage.to === STAGE_SIX_FIRST_APPROVER.email, "the first approval email must use the fixed Slavomir address");
    const stepOneToken = approvalToken(firstApproverMessage);
    check(await prisma.notification.count({ where: { entityId: configuredA.step.id, type: "PRODUCTION_APPROVAL_REQUESTED" } }) === 0, "the fixed external first approver must not receive an in-app notification");
    check(await prisma.notification.count({ where: { entityId: additional.step.id, type: "PRODUCTION_APPROVAL_REQUESTED" } }) === 0, "waiting approvers must not be notified early");

    const approverWorkspace = await getStageSixWorkspaceData(approver, ids.project);
    check(
      approverWorkspace === null,
      "the fixed external first approval must not expose a USER manager workspace or authenticated review link",
    );
    const ownerWorkspace = await getStageSixWorkspaceData(owner, ids.project);
    const ownerStep = ownerWorkspace?.units
      .find((unit) => unit.id === unitA.id)
      ?.approvalSteps.find((step) => step.id === configuredA.step.id);
    check(ownerStep?.reviewHref === null, "a project manager who is not assigned must not receive the approver-only review link");
    const outsiderWorkspace = await getStageSixWorkspaceData(outsider, ids.project);
    check(outsiderWorkspace === null, "an outsider must not receive Stage 6 workspace data");

    const exactApproval = await getExternalProductionApprovalData(stepOneToken);
    check(exactApproval.state === "active", "Slavomir's exact email token must open the active first approval");
    if (exactApproval.state === "active") {
      check(exactApproval.snapshot.fields.length === 1 && exactApproval.snapshot.fields[0].key === ProjectFileChecklistField.OUTPUT_NAME, "approval snapshot must expose only selected details");
      check(!JSON.stringify(exactApproval.snapshot).includes("Private warning"), "unselected checklist data must not leak");
    }
    const outsiderApproval = await getAuthenticatedProductionApprovalData(outsider, configuredA.step.id);
    check(outsiderApproval.state === "invalid", "collaborator must not open someone else's approval");
    const earlyDecision = await decideProductionApproval({ kind: "external", token: "a".repeat(43) }, { decision: "APPROVE", confirmed: true });
    check(isError(earlyDecision), "invalid or non-active external step must not decide");
    await prisma.projectFileChecklistItem.update({ where: { checklistId_fieldKey: { checklistId: unitA.sourceChecklistId, fieldKey: ProjectFileChecklistField.OUTPUT_NAME } }, data: { value: { text: "Updated before Step 2" } } });
    const stableApproval = await getExternalProductionApprovalData(stepOneToken);
    check(stableApproval.state === "active" && JSON.stringify(stableApproval.snapshot).includes("Output 1"), "active approval snapshot must remain stable after Stage 5 edits");

    const unconfirmedStepOne = await decideProductionApproval({ kind: "external", token: stepOneToken }, { decision: "APPROVE" });
    check(isError(unconfirmedStepOne) && unconfirmedStepOne.error.includes("Confirm"), "an approval request without explicit confirmation must be rejected");
    const pendingStepOne = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: configuredA.step.id } });
    check(pendingStepOne.status === ProductionApprovalStepStatus.ACTIVE && pendingStepOne.decidedAt === null, "opening an approval and submitting no confirmation must leave it pending without a decision timestamp");

    const emailBeforeStepTwo = emailLog.length;
    const approvedStepOne = await decideProductionApproval({ kind: "external", token: stepOneToken }, { decision: "APPROVE", comment: "Approved by Slavomir", confirmed: true }, { sendEmail: sendSuccess });
    check(!isError(approvedStepOne), "the active fixed first approver must approve");
    const decidedApproverWorkspace = await getStageSixWorkspaceData(approver, ids.project);
    check(
      decidedApproverWorkspace === null,
      "the USER manager workspace and direct review action must remain unavailable after the external approver decides",
    );
    check(emailLog.length === emailBeforeStepTwo + 1, "only the next external approver must be emailed");
    const stepTwoToken = approvalToken(emailLog.at(-1)!);
    const storedStepTwo = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: additional.step.id } });
    check(storedStepTwo.status === ProductionApprovalStepStatus.ACTIVE && storedStepTwo.externalTokenHash && storedStepTwo.externalTokenHash !== stepTwoToken, "Step 1 approval must activate Step 2 and store only its token hash");
    await prisma.projectFileChecklistItem.update({ where: { checklistId_fieldKey: { checklistId: unitA.sourceChecklistId, fieldKey: ProjectFileChecklistField.OUTPUT_NAME } }, data: { value: { text: "Edited after dispatch" } } });
    const externalStepTwo = await getExternalProductionApprovalData(stepTwoToken);
    check(externalStepTwo.state === "active" && JSON.stringify(externalStepTwo.snapshot).includes("Updated before Step 2") && !JSON.stringify(externalStepTwo.snapshot).includes("Edited after dispatch"), "external approval must see its exact stable dispatch snapshot");
    const pendingStepTwo = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: additional.step.id } });
    check(pendingStepTwo.status === ProductionApprovalStepStatus.ACTIVE && pendingStepTwo.decidedAt === null, "activating and emailing the next approver must not record a decision");
    const approvedStepTwo = await decideProductionApproval({ kind: "external", token: stepTwoToken }, { decision: "APPROVE", comment: "Printer approves", confirmed: true }, { sendEmail: sendSuccess });
    check(!isError(approvedStepTwo), "active external approver must approve");
    const doubleDecision = await decideProductionApproval({ kind: "external", token: stepTwoToken }, { decision: "REJECT", confirmed: true });
    check(isError(doubleDecision), "completed token must not submit a second decision");
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: unitA.id } })).status === ProjectProductionUnitStatus.HANDOVER_READY, "final approval must make only its unit handover-ready");
    check((await prisma.notification.count({ where: { entityType: "PRODUCTION_UNIT", entityId: unitA.id, title: "Production approval chain completed" } })) > 0, "final approval must notify managers that the unit approval chain completed");
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: unitB.id } })).status === ProjectProductionUnitStatus.PREPARATION, "Production Units must progress independently");

    const configuredB = await configureMarketingDirector(owner, { clientRequestId: `md-b-${runId}`, projectId: ids.project, productionUnitId: unitB.id, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Marketing Director B", recipientEmail: "marketing-b@example.test", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitB.sourceAttachmentId] }, { sendEmail: sendSuccess });
    check(!isError(configuredB) && "step" in configuredB && configuredB.step, "external Marketing Director recipient must be supported");
    const unitBToken = approvalToken(emailLog.at(-1)!);
    const emailCountAfterUnitB = emailLog.length;
    const duplicateConfiguredB = await configureMarketingDirector(owner, { clientRequestId: `md-b-${runId}`, projectId: ids.project, productionUnitId: unitB.id, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Marketing Director B", recipientEmail: "marketing-b@example.test", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitB.sourceAttachmentId] }, { sendEmail: sendSuccess });
    check(!isError(duplicateConfiguredB) && duplicateConfiguredB.duplicate && emailLog.length === emailCountAfterUnitB, "retrying an external approval request must not resend its email");
    const waitingBOne = await addProductionApprover(owner, { clientRequestId: `unit-b-extra-one-${runId}`, projectId: ids.project, productionUnitId: unitB.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.approver, sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitB.sourceAttachmentId] });
    const waitingBTwo = await addProductionApprover(owner, { clientRequestId: `unit-b-extra-two-${runId}`, projectId: ids.project, productionUnitId: unitB.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.secondApprover, sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitB.sourceAttachmentId] });
    check(!isError(waitingBOne) && waitingBOne.step && !isError(waitingBTwo) && waitingBTwo.step, "managers must retain Add Approver while the first request is active");
    const movedB = await reorderProductionApprover(owner, { projectId: ids.project, productionUnitId: unitB.id, stepId: waitingBTwo.step.id, direction: "UP" });
    check(!isError(movedB) && movedB.moved, "waiting approval steps must be reorderable while the chain is active");
    const reorderedB = await prisma.productionApprovalStep.findMany({ where: { productionUnitId: unitB.id, sequence: { gt: 1 } }, orderBy: { sequence: "asc" } });
    check(reorderedB[0]?.id === waitingBTwo.step.id && reorderedB[1]?.id === waitingBOne.step.id, "the persisted approval order must match the manager's reorder action");
    check(!isError(await removeProductionApprover(owner, { projectId: ids.project, productionUnitId: unitB.id, stepId: waitingBTwo.step.id })), "a waiting approval can be deleted after the chain starts");
    check(!isError(await removeProductionApprover(owner, { projectId: ids.project, productionUnitId: unitB.id, stepId: waitingBOne.step.id })), "deleting a waiting approval must compact the remaining chain safely");
    await expectRejected(getProductionApprovalFileUrl({ kind: "external", token: unitBToken }, productionAttachmentId, "download"), "an external approval token must not download another unit's file");
    await prisma.productionApprovalStep.update({ where: { id: configuredB.step.id }, data: { externalTokenExpiresAt: new Date(Date.now() - 1_000) } });
    check((await getExternalProductionApprovalData(unitBToken)).state === "expired", "an expired external approval token must be denied");
    check(isError(await decideProductionApproval({ kind: "external", token: unitBToken }, { decision: "APPROVE", confirmed: true })), "an expired external token must not decide");
    await prisma.productionApprovalStep.update({ where: { id: configuredB.step.id }, data: { externalTokenExpiresAt: new Date(Date.now() + 60_000), externalTokenRevokedAt: new Date() } });
    check((await getExternalProductionApprovalData(unitBToken)).state === "unavailable", "a revoked external approval token must be denied");
    check(isError(await decideProductionApproval({ kind: "external", token: unitBToken }, { decision: "APPROVE", confirmed: true })), "a revoked external token must not decide");
    await prisma.productionApprovalStep.update({ where: { id: configuredB.step.id }, data: { externalTokenExpiresAt: new Date(Date.now() + 60_000), externalTokenRevokedAt: null } });
    const approvedB = await decideProductionApproval({ kind: "external", token: unitBToken }, { decision: "APPROVE", confirmed: true }, { sendEmail: sendSuccess });
    check(!isError(approvedB), "external Marketing Director must approve with exact token");

    const invalidExternalHandover = await handoverProductionUnit(owner, { clientRequestId: `handover-a-invalid-${runId}`, projectId: ids.project, productionUnitId: unitA.id, route: ProductionHandoverRoute.DIRECT_VENDOR, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Vendor A", recipientEmail: "vendor-a@example.test", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId] }, { sendEmail: sendSuccess });
    check(isError(invalidExternalHandover), "external handover must require company and international phone details");
    const invalidInternalHandover = await handoverProductionUnit(owner, { clientRequestId: `handover-a-invalid-internal-${runId}`, projectId: ids.project, productionUnitId: unitA.id, route: ProductionHandoverRoute.PURCHASE_DEPARTMENT, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Purchasing", recipientEmail: "purchasing@example.test", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId] }, { sendEmail: sendSuccess });
    check(isError(invalidInternalHandover), "internal handover must use an existing project participant");
    const failedHandover = await handoverProductionUnit(owner, { clientRequestId: `handover-a-fail-${runId}`, projectId: ids.project, productionUnitId: unitA.id, route: ProductionHandoverRoute.DIRECT_VENDOR, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Vendor A", recipientEmail: "vendor-a@example.test", recipientCompany: "Vendor A LLC", recipientPhone: "+971 50 123 4567", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId, productionAttachmentId], note: "External vendor package" }, { sendEmail: sendFailure });
    check(isError(failedHandover), "failed handover delivery must return a useful error");
    const afterFailure = await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: unitA.id }, include: { handover: true } });
    check(afterFailure.status === ProjectProductionUnitStatus.HANDOVER_READY && afterFailure.handover?.deliveryStatus === ProductionHandoverDeliveryStatus.FAILED, "failed email must not mark the unit handed over");
    const successfulHandoverA = await handoverProductionUnit(owner, { clientRequestId: `handover-a-retry-${runId}`, projectId: ids.project, productionUnitId: unitA.id, route: ProductionHandoverRoute.DIRECT_VENDOR, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Vendor A", recipientEmail: "vendor-a@example.test", recipientCompany: "Vendor A LLC", recipientPhone: "+971 50 123 4567", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId, productionAttachmentId], note: "External vendor package" }, { sendEmail: sendSuccess });
    check(!isError(successfulHandoverA) && "handedOver" in successfulHandoverA && successfulHandoverA.handedOver, "successful retry must hand over the unit");
    const deliveredToken = handoverToken(emailLog.at(-1)!);
    const deliveredData = await getExternalProductionHandoverData(deliveredToken);
    check(deliveredData.state === "active" && deliveredData.unit.id === unitA.id && deliveredData.snapshot.files.length === 2, "handover token must expose only the selected unit package");
    await expectRejected(getProductionHandoverFileUrl(deliveredToken, unitB.sourceAttachmentId, "download"), "a handover token must not download another unit's file");
    const duplicateHandoverA = await handoverProductionUnit(owner, { clientRequestId: `handover-a-retry-${runId}`, projectId: ids.project, productionUnitId: unitA.id, route: ProductionHandoverRoute.DIRECT_VENDOR, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Vendor A", recipientEmail: "vendor-a@example.test", recipientCompany: "Vendor A LLC", recipientPhone: "+971 50 123 4567", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitA.sourceAttachmentId, productionAttachmentId] }, { sendEmail: sendSuccess });
    check(!isError(duplicateHandoverA) && "duplicate" in duplicateHandoverA && duplicateHandoverA.duplicate, "double handover submit must be idempotent");

    const completedSix = await completeStageSix(coOwner, { projectId: ids.project });
    check(!isError(completedSix) && completedSix.stageSevenAvailable, "all approved units must allow Stage 6 completion without requiring handover");
    const successfulHandoverB = await handoverProductionUnit(owner, { clientRequestId: `handover-b-${runId}`, projectId: ids.project, productionUnitId: unitB.id, route: ProductionHandoverRoute.PURCHASE_DEPARTMENT, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.secondApprover, sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [unitB.sourceAttachmentId], note: "Purchase route" }, { sendEmail: sendSuccess });
    check(!isError(successfulHandoverB), "internal route must deliver to an existing project participant after optional Stage 6 completion");
    const retriedSix = await completeStageSix(owner, { projectId: ids.project });
    check(!isError(retriedSix) && !retriedSix.transitioned, "Stage 6 completion retry must be idempotent");
    const finalWorkflow = await prisma.projectWorkflowStage.findMany({ where: { projectId: ids.project } });
    const stageSix = finalWorkflow.find((stage) => stage.stageKey === ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER);
    const stageSeven = finalWorkflow.find((stage) => stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION);
    check(stageSix?.status === ProjectWorkflowStageStatus.COMPLETED, "Stage 6 must become COMPLETED");
    check(stageSeven?.status === ProjectWorkflowStageStatus.AVAILABLE && stageSeven.unlockedAt, "Stage 7 must become AVAILABLE with unlockedAt");

    const completedRejectFive = await completeStageFive(owner, { projectId: ids.rejectProject });
    check(!isError(completedRejectFive), "rejection fixture Stage 5 must complete");
    const rejectUnit = await prisma.projectProductionUnit.findFirstOrThrow({ where: { projectId: ids.rejectProject } });
    const bootstrap = await prisma.productionApprovalStep.findFirstOrThrow({ where: { productionUnitId: rejectUnit.id, isMarketingDirectorRequired: true } });
    await prisma.projectAttachment.update({
      where: { id: rejectUnit.sourceAttachmentId },
      data: { status: AttachmentStatus.UPLOADING },
    });
    const removedBootstrap = await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: bootstrap.id });
    check(!isError(removedBootstrap), "the historical Marketing Director Step 1 must be removable by a manager");
    const emptyWorkspace = await getStageSixWorkspaceData(owner, ids.rejectProject);
    const emptyUnit = emptyWorkspace?.units.find((unit) => unit.id === rejectUnit.id);
    check(emptyUnit?.approvalSteps.length === 0 && emptyUnit.removedApprovalSteps.length === 1, "removed bootstrap must leave an empty live chain and visible audit history");
    check(emptyUnit?.approvalState === "NOT_REQUIRED", "zero live approvers must derive Approval Not Required");
    check(emptyUnit?.handoverReady === false && emptyUnit.handoverBlocker?.includes("production source"), "a missing non-approval production prerequisite must still block handover");
    const blockedZeroHandover = await handoverProductionUnit(owner, { clientRequestId: `zero-blocked-handover-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, route: ProductionHandoverRoute.PURCHASE_DEPARTMENT, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.secondApprover, sharedFieldKeys: [], selectedFileIds: [rejectUnit.sourceAttachmentId] }, { sendEmail: sendSuccess });
    check(isError(blockedZeroHandover), "zero approvers must not bypass a missing required production source");

    await prisma.projectAttachment.update({
      where: { id: rejectUnit.sourceAttachmentId },
      data: { status: AttachmentStatus.READY },
    });
    const recalculatedZeroWorkspace = await getStageSixWorkspaceData(owner, ids.rejectProject);
    const recalculatedZeroUnit = recalculatedZeroWorkspace?.units.find((unit) => unit.id === rejectUnit.id);
    check(recalculatedZeroUnit?.approvalState === "NOT_REQUIRED" && recalculatedZeroUnit.handoverReady, "finishing the missing non-approval prerequisite must make the zero chain handover-ready");
    const availableZeroHandover = await handoverProductionUnit(owner, { clientRequestId: `zero-ready-handover-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, route: ProductionHandoverRoute.PURCHASE_DEPARTMENT, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.secondApprover, sharedFieldKeys: [], selectedFileIds: [rejectUnit.sourceAttachmentId] }, { sendEmail: sendFailure });
    check(isError(availableZeroHandover) && availableZeroHandover.error.includes("email could not be sent"), "zero approvers with ready production prerequisites must reach the real handover delivery path");
    const emailCountBeforeTemporaryApprover = emailLog.length;
    const temporaryApprover = await addProductionApprover(owner, { clientRequestId: `zero-temporary-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Temporary Reviewer", recipientEmail: "temporary@example.test", sharedFieldKeys: [], selectedFileIds: [rejectUnit.sourceAttachmentId] }, { sendEmail: sendSuccess });
    check(!isError(temporaryApprover) && temporaryApprover.step && emailLog.length === emailCountBeforeTemporaryApprover + 1, "adding the first approver after a zero chain must activate and dispatch exactly once");
    const temporaryToken = approvalToken(emailLog.at(-1)!);
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: rejectUnit.id } })).status === ProjectProductionUnitStatus.APPROVAL_PENDING, "adding after Approval Not Required must block handover again");
    const removedTemporary = await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: temporaryApprover.step.id }, { sendEmail: sendSuccess });
    check(!isError(removedTemporary), "the last active approval step must be removable");
    check((await getExternalProductionApprovalData(temporaryToken)).state !== "active" && isError(await decideProductionApproval({ kind: "external", token: temporaryToken }, { decision: "APPROVE", confirmed: true })), "last-active-step removal must revoke its request token");
    check(await prisma.notification.count({ where: { entityType: "PRODUCTION_APPROVAL", entityId: temporaryApprover.step.id } }) === 0, "a zero-active chain must retain no outstanding active approval notification");
    const readyWithoutApproval = await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: rejectUnit.id } });
    check(readyWithoutApproval.status === ProjectProductionUnitStatus.HANDOVER_READY && readyWithoutApproval.approvedAt === null, "zero approvers plus ready production prerequisites must be handover-ready without a fake approval audit");
    const readyWithoutApprovalWorkspace = await getStageSixWorkspaceData(owner, ids.rejectProject);
    const readyWithoutApprovalUnit = readyWithoutApprovalWorkspace?.units.find((unit) => unit.id === rejectUnit.id);
    check(readyWithoutApprovalUnit?.approvalState === "NOT_REQUIRED" && readyWithoutApprovalUnit.handoverReady && readyWithoutApprovalWorkspace?.summary.approvalNotRequired === 1, "the workspace must display Approval Not Required and expose handover readiness");

    const firstFlexible = await addProductionApprover(owner, { clientRequestId: `reject-first-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Flexible First", recipientEmail: "first@example.test", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [rejectFixture.sourceIds[0]] }, { sendEmail: sendSuccess });
    check(!isError(firstFlexible) && firstFlexible.step, "an empty chain must allow Add Approver and activate its first live step");
    const rejectToken = approvalToken(emailLog.at(-1)!);
    const rejectExtra = await addProductionApprover(owner, { clientRequestId: `reject-extra-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.secondApprover, sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [rejectFixture.sourceIds[0]] });
    check(!isError(rejectExtra) && rejectExtra.step, "an active chain must allow a future waiting approver");
    check(await prisma.notification.count({ where: { entityId: rejectExtra.step.id, type: "PRODUCTION_APPROVAL_REQUESTED" } }) === 0, "a future approver must not receive an early request");
    check(isError(await addProductionApprover(approver, { clientRequestId: `forged-add-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.approver, sharedFieldKeys: [], selectedFileIds: [rejectFixture.sourceIds[0]] })), "a USER recipient cannot add approval steps");
    const concurrentRejections = await Promise.all([
      decideProductionApproval({ kind: "external", token: rejectToken }, { decision: "REJECT", comment: "Needs correction", confirmed: true }),
      decideProductionApproval({ kind: "external", token: rejectToken }, { decision: "REJECT", comment: "Duplicate click", confirmed: true }),
    ]);
    check(concurrentRejections.filter((result) => !isError(result)).length === 1, "concurrent rejection clicks must record exactly one decision");
    check(concurrentRejections.filter(isError).length === 1, "the losing concurrent rejection must return a controlled error");
    const rejectedAuditBeforeRemoval = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: firstFlexible.step.id } });
    const rejectedState = await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: rejectUnit.id }, include: { approvalSteps: { where: { removedAt: null }, orderBy: { sequence: "asc" } } } });
    check(rejectedState.status === ProjectProductionUnitStatus.REJECTED && rejectedState.approvalSteps[1].status === ProductionApprovalStepStatus.WAITING && !rejectedState.approvalSteps[1].sentAt, "rejection must stop the chain and preserve undispatched waiting steps");
    const addedAfterRejection = await addProductionApprover(owner, { clientRequestId: `after-rejection-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.approver, sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [rejectFixture.sourceIds[0]] });
    check(!isError(addedAfterRejection) && addedAfterRejection.step, "a rejected chain must remain open to Add Approver");
    check(isError(await removeProductionApprover(approver, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: firstFlexible.step.id })), "a USER cannot forge removal of a rejected step");
    check(isError(await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: unitA.id, stepId: firstFlexible.step.id })), "cross-unit removal must be rejected");

    const removeRejected = await removeProductionApprover(coOwner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: firstFlexible.step.id }, { sendEmail: sendSuccess });
    check(!isError(removeRejected), "a Co-Owner must be able to remove the rejected step and resume the chain");
    check(isError(await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: firstFlexible.step.id })), "double remove must be rejected");
    check((await getExternalProductionApprovalData(rejectToken)).state !== "active", "the removed recipient token must no longer be usable");
    check(isError(await decideProductionApproval({ kind: "external", token: rejectToken }, { decision: "APPROVE", confirmed: true })), "a stale removed recipient cannot decide");
    const rejectedAudit = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: firstFlexible.step.id } });
    check(rejectedAudit.removedAt && rejectedAudit.statusAtRemoval === ProductionApprovalStepStatus.REJECTED && rejectedAudit.decisionComment === rejectedAuditBeforeRemoval.decisionComment && rejectedAudit.decidedAt?.getTime() === rejectedAuditBeforeRemoval.decidedAt?.getTime(), "the persisted rejection decision and comment must remain intact after removal");
    const resumed = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: rejectExtra.step.id } });
    check(resumed.status === ProductionApprovalStepStatus.ACTIVE, "removing the rejected step must activate the next eligible step exactly once");
    check(await prisma.notification.count({ where: { entityId: rejectExtra.step.id, type: "PRODUCTION_APPROVAL_REQUESTED" } }) === 1, "resumed internal approver must receive exactly one request notification");

    check(!isError(await decideProductionApproval({ kind: "authenticated", user: { id: ids.secondApprover, role: UserRole.USER }, stepId: rejectExtra.step.id }, { decision: "APPROVE", comment: "Recovered", confirmed: true })), "resumed approver must be able to approve");
    check(!isError(await decideProductionApproval({ kind: "authenticated", user: approver, stepId: addedAfterRejection.step.id }, { decision: "APPROVE", confirmed: true })), "the next sequential approver must approve");
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: rejectUnit.id } })).status === ProjectProductionUnitStatus.HANDOVER_READY, "remaining live approvals must complete after rejected-step removal");

    const afterApproved = await addProductionApprover(coOwner, { clientRequestId: `after-approved-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Late Reviewer", recipientEmail: "late@example.test", sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [rejectFixture.sourceIds[0]] }, { sendEmail: sendSuccess });
    check(!isError(afterApproved) && afterApproved.step, "an approved chain must remain open to Add Approver before Stage 6 completion");
    const afterApprovedToken = approvalToken(emailLog.at(-1)!);
    const afterActiveFuture = await addProductionApprover(owner, { clientRequestId: `after-active-future-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.secondApprover, sharedFieldKeys: [ProjectFileChecklistField.OUTPUT_NAME], selectedFileIds: [rejectFixture.sourceIds[0]] });
    check(!isError(afterActiveFuture) && afterActiveFuture.step, "adding while another approver is active must append a waiting step");
    check(await prisma.notification.count({ where: { entityId: afterActiveFuture.step.id, type: "PRODUCTION_APPROVAL_REQUESTED" } }) === 0, "the newly appended future approver must not be notified early");
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: rejectUnit.id } })).status === ProjectProductionUnitStatus.APPROVAL_PENDING, "adding after approval must reopen sequential execution");
    const approvedAuditBeforeRemoval = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: rejectExtra.step.id } });
    check(!isError(await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: rejectExtra.step.id })), "an approved step must be removable without destroying its audit");
    const approvedAuditAfterRemoval = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: rejectExtra.step.id } });
    check(approvedAuditAfterRemoval.removedAt && approvedAuditAfterRemoval.statusAtRemoval === ProductionApprovalStepStatus.APPROVED && approvedAuditAfterRemoval.decidedAt?.getTime() === approvedAuditBeforeRemoval.decidedAt?.getTime(), "approved decision timestamps must remain unchanged after removal");
    check(!isError(await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: afterApproved.step.id })), "the current active approver must be removable");
    check((await getExternalProductionApprovalData(afterApprovedToken)).state !== "active" && isError(await decideProductionApproval({ kind: "external", token: afterApprovedToken }, { decision: "APPROVE", confirmed: true })), "removing an active approver must revoke its outstanding token");
    const activatedAfterRemoval = await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: afterActiveFuture.step.id } });
    check(activatedAfterRemoval.status === ProductionApprovalStepStatus.ACTIVE && await prisma.notification.count({ where: { entityId: afterActiveFuture.step.id, type: "PRODUCTION_APPROVAL_REQUESTED" } }) === 1, "removing an active step must activate and notify the next eligible approver exactly once");
    const liveAfterRemoval = await prisma.productionApprovalStep.findMany({ where: { productionUnitId: rejectUnit.id, removedAt: null }, select: { sequence: true, status: true } });
    check(liveAfterRemoval.filter((step) => step.status === ProductionApprovalStepStatus.ACTIVE).length === 1, "a chain mutation must leave at most one live active step");
    check(new Set(liveAfterRemoval.map((step) => step.sequence)).size === liveAfterRemoval.length, "live approval sequence numbers must remain unique");
    check(!isError(await decideProductionApproval({ kind: "authenticated", user: { id: ids.secondApprover, role: UserRole.USER }, stepId: afterActiveFuture.step.id }, { decision: "APPROVE", confirmed: true })), "the step activated by active-step removal must be decidable");
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: rejectUnit.id } })).status === ProjectProductionUnitStatus.HANDOVER_READY, "the resumed live chain must complete normally");

    const workspace = await getStageSixWorkspaceData(owner, ids.rejectProject);
    const flexibleUnit = workspace?.units.find((unit) => unit.id === rejectUnit.id);
    check(flexibleUnit?.approvalSteps.length === 2 && flexibleUnit.approvalSteps.every((step) => step.status === ProductionApprovalStepStatus.APPROVED), "active summary rows must exclude all removed approvals");
    check(flexibleUnit?.removedApprovalSteps.length === 5, "removed waiting, active, approved, and rejected audit rows must stay visible");
    check(workspace?.summary.approved === 1 && workspace.units.length === 1, "Stage 6 real status summary must reflect the live chain");

    for (const liveStep of flexibleUnit?.approvalSteps ?? []) {
      check(!isError(await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: liveStep.id })), "approved live steps must remain audit-removable before Stage 6 completion");
    }
    const zeroAfterApprovedHistory = await getStageSixWorkspaceData(owner, ids.rejectProject);
    const zeroAfterApprovedUnit = zeroAfterApprovedHistory?.units.find((unit) => unit.id === rejectUnit.id);
    check(zeroAfterApprovedUnit?.approvalState === "NOT_REQUIRED" && zeroAfterApprovedUnit.approvalSteps.length === 0 && zeroAfterApprovedUnit.handoverReady, "removing every approved live step must restore Approval Not Required and preserve handover readiness");
    check(zeroAfterApprovedUnit?.removedApprovalSteps.filter((step) => step.statusAtRemoval === ProductionApprovalStepStatus.APPROVED).length === 3, "removed approved decisions must remain in historical audit rows when the active chain reaches zero");
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: rejectUnit.id } })).approvedAt === null, "Approval Not Required must never retain an approvedAt audit value");

    const completedFlexible = await completeStageSix(owner, { projectId: ids.rejectProject });
    check(!isError(completedFlexible), "a ready zero-approver unit must allow Stage 6 completion");
    check(isError(await addProductionApprover(owner, { clientRequestId: `after-complete-${runId}`, projectId: ids.rejectProject, productionUnitId: rejectUnit.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.approver, sharedFieldKeys: [], selectedFileIds: [rejectFixture.sourceIds[0]] })), "Add Approver must be blocked after Stage 6 completion");
    check(isError(await removeProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: addedAfterRejection.step.id })), "removal must be blocked after Stage 6 completion");
    check(isError(await reorderProductionApprover(owner, { projectId: ids.rejectProject, productionUnitId: rejectUnit.id, stepId: addedAfterRejection.step.id, direction: "UP" })), "reorder must be blocked after Stage 6 completion");
    check(isError(await addProductionApprover(owner, { clientRequestId: `after-handover-${runId}`, projectId: ids.project, productionUnitId: unitA.id, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.approver, sharedFieldKeys: [], selectedFileIds: [unitA.sourceAttachmentId] })), "Add Approver must be blocked after permanent handover");
    console.log("Stage 5 -> Stage 6 production, approval, handover, security, and Stage 7 unlock integration checks passed.");
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: [ids.project, ids.rejectProject, ids.foreignProject] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
