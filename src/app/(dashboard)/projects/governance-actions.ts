"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import {
  activateApprovedProject, approveLegacyArtworkPreset, decideProjectCompletion,
  decideProjectCreation, finalizeProjectAsDirector, requestProjectCompletion,
  revokeLegacyArtworkPreset, submitProjectCreation,
  submitTemplateProposal, decideTemplateProposal,
} from "@/lib/project-governance/service";

export type GovernanceActionState = { error?: string; message?: string };
export async function projectGovernanceAction(
  _previous: GovernanceActionState,
  form: FormData,
): Promise<GovernanceActionState> {
  const user = await requireUser();
  const value = (key: string) => String(form.get(key) ?? "");
  const values = (key: string) => form.getAll(key).map(String).filter(Boolean);
  const command = value("command");
  let destination: string | undefined;
  try {
    if (command === "create") {
      const kind = value("kind"), executionType = value("executionType");
      if ((kind !== "ARTWORK" && kind !== "FLEXIBLE") || (executionType !== "INTERNAL" && executionType !== "EXTERNAL")) throw new Error("Choose a supported project type and scope.");
      const result = await submitProjectCreation(user, {
        kind, executionType, name: value("name"), description: value("description"),
        ownerId: value("ownerId"), coOwnerIds: values("coOwnerIds"), executorIds: values("executorIds"),
        tags: value("tags").split(",").map(tag => tag.trim()).filter(Boolean),
        presetApprovalId: value("presetApprovalId"), clientRequestId: value("clientRequestId"),
      });
      destination = "projectUrl" in result ? result.projectUrl : "/projects/approvals";
    } else if (command === "submitTemplateProposal") {
      const changeKind = value("changeKind");
      if (changeKind !== "CREATE" && changeKind !== "MODIFY") throw new Error("Choose the proposed change.");
      await submitTemplateProposal(user, { clientRequestId: value("clientRequestId"), title: value("title"), brief: value("reason"), reference: value("reference"), changeKind });
    } else if (command === "decideCreation" || command === "decideCompletion" || command === "decideTemplateProposal") {
      const decision = value("decision");
      if (decision !== "APPROVE" && decision !== "REJECT") throw new Error("Choose approve or reject.");
      const common = { requestId: value("requestId"), reason: value("reason"), decision };
      if (command === "decideCreation") await decideProjectCreation(user, { ...common, decision, configurationHash: value("hash") });
      else if (command === "decideCompletion") await decideProjectCompletion(user, { ...common, decision, snapshotHash: value("hash") });
      else await decideTemplateProposal(user, { proposalId: value("requestId"), proposalHash: value("hash"), reason: value("reason"), decision });
    } else if (command === "activate") {
      const result = await activateApprovedProject(user, { requestId: value("requestId"), configurationHash: value("hash") });
      destination = result.projectUrl;
    } else if (command === "approvePreset") {
      await approveLegacyArtworkPreset(user, { definitionHash: value("hash"), reason: value("reason") });
    } else if (command === "revokePreset") {
      await revokeLegacyArtworkPreset(user, { approvalId: value("approvalId"), reason: value("reason") });
    } else if (command === "requestCompletion" || command === "finalize") {
      const kind = value("kind");
      if (kind !== "ARTWORK" && kind !== "FLEXIBLE") throw new Error("Invalid project type.");
      const target = { kind, projectId: value("projectId") };
      if (command === "finalize") await finalizeProjectAsDirector(user, { ...target, kind }, value("reason"));
      else await requestProjectCompletion(user, { ...target, kind }, value("reason"));
    } else throw new Error("Unsupported governance action.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return { error: error.code === "P2034" ? "Another decision changed this request. Refresh before trying again." : "The request could not be saved. Refresh to check its latest status." };
    }
    return { error: error instanceof Error ? error.message : "The request could not be completed." };
  }
  revalidatePath("/projects", "layout");
  if (destination) redirect(destination);
  return { message: "Saved. The current decision and project status are shown below." };
}
