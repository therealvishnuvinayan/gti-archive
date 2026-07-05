type StageLockStatus = string | null | undefined;

type StageLockRecord = {
  id: string;
  name?: string | null;
  label?: string | null;
  order?: number | null;
  status?: StageLockStatus;
};

export type LockedStageInfo<TStage extends StageLockRecord = StageLockRecord> = {
  stage: TStage;
  requiredStage: TStage;
  message: string;
};

function isCompletedStatus(status: StageLockStatus) {
  return status?.toLowerCase() === "completed";
}

function getStageDisplayName(stage: StageLockRecord) {
  return stage.name?.trim() || stage.label?.split(":")[0]?.trim() || "This stage";
}

export function getLockedStageInfo<TStage extends StageLockRecord>(
  stages: TStage[],
  stageId?: string | null,
): LockedStageInfo<TStage> | null {
  if (!stageId || stages.length === 0) {
    return null;
  }

  const orderedStages = [...stages].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return stages.indexOf(left) - stages.indexOf(right);
  });
  const selectedStageIndex = orderedStages.findIndex((stage) => stage.id === stageId);

  if (selectedStageIndex === -1) {
    return null;
  }

  const firstIncompleteStageIndex = orderedStages.findIndex(
    (stage) => !isCompletedStatus(stage.status),
  );

  if (firstIncompleteStageIndex === -1 || selectedStageIndex <= firstIncompleteStageIndex) {
    return null;
  }

  const stage = orderedStages[selectedStageIndex];
  const requiredStage = orderedStages[firstIncompleteStageIndex];

  return {
    stage,
    requiredStage,
    message: `${getStageDisplayName(stage)} is locked. Complete ${getStageDisplayName(
      requiredStage,
    )} before proceeding.`,
  };
}
