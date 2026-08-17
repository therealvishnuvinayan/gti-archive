import {
  ProductionSampleRoundStatus,
  ProductionSupervisionStatus,
} from "@prisma/client";

export function getPhysicalSampleRequestActionState(input: {
  selected: boolean;
  canManage: boolean;
  canReview: boolean;
  hasAssignedRecipient: boolean;
  stageCompleted: boolean;
  hasDecision: boolean;
  unitStatus: ProductionSupervisionStatus;
  roundStatus: ProductionSampleRoundStatus;
}) {
  const undecided = !input.hasDecision;
  const canDelete = input.canManage && !input.stageCompleted && undecided;
  const requestMutable =
    canDelete && input.unitStatus !== ProductionSupervisionStatus.SIGNED_OFF;
  const reviewable =
    input.canReview &&
    !input.stageCompleted &&
    undecided &&
    input.unitStatus !== ProductionSupervisionStatus.SIGNED_OFF;
  const received = input.roundStatus !== ProductionSampleRoundStatus.PENDING;

  return {
    received,
    reviewable,
    requestMutable,
    showRowDelete: canDelete && !input.selected,
    showDetailsDelete: canDelete && input.selected,
    showMarkReceived: reviewable && !received,
    reviewActionsEnabled:
      reviewable && (received || input.hasAssignedRecipient),
    decisionWillRecordReceipt:
      reviewable && input.hasAssignedRecipient && !received,
  };
}
