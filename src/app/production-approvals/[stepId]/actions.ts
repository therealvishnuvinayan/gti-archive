"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { decideProductionApproval } from "@/lib/stage-six";

export async function decideAuthenticatedProductionApprovalAction(input: {
  stepId: string;
  decision: "APPROVE" | "REJECT";
  comment?: string;
}) {
  const user = await requireUser(`/production-approvals/${input.stepId}`);
  const result = await decideProductionApproval(
    { kind: "authenticated", user, stepId: input.stepId },
    { decision: input.decision, comment: input.comment },
  );
  revalidatePath(`/production-approvals/${input.stepId}`);
  return result;
}
