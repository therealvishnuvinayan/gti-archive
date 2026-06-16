export function shouldLogStageChatTimings() {
  return process.env.NODE_ENV !== "production";
}

export function getStageChatTimingStart() {
  return performance.now();
}

export function logStageChatTiming(
  scope: "init" | "send",
  label: string,
  startedAt: number,
  metadata?: Record<string, unknown>,
) {
  if (!shouldLogStageChatTimings()) {
    return;
  }

  console.log(`[stage-chat:${scope}] ${label}`, {
    ms: Math.round(performance.now() - startedAt),
    ...metadata,
  });
}
