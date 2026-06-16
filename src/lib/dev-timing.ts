export function isDevTimingEnabled() {
  return process.env.NODE_ENV !== "production";
}

export function getDevTimingNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function getDevTimingDurationMs(start: number) {
  return Math.round(getDevTimingNow() - start);
}

export function logDevTiming(
  scope: string,
  label: string,
  details?: Record<string, unknown>,
) {
  if (!isDevTimingEnabled()) {
    return;
  }

  if (details) {
    console.info(scope, label, details);
    return;
  }

  console.info(scope, label);
}

export async function timeDevAsync<T>(
  scope: string,
  label: string,
  action: () => Promise<T>,
  details?: Record<string, unknown>,
) {
  const startedAt = getDevTimingNow();

  try {
    return await action();
  } finally {
    logDevTiming(scope, label, {
      ...details,
      durationMs: getDevTimingDurationMs(startedAt),
    });
  }
}

export function createDevTimer(scope: string) {
  const startedAt = getDevTimingNow();
  let previousMarkAt = startedAt;

  return {
    mark(label: string, details?: Record<string, unknown>) {
      const now = getDevTimingNow();
      logDevTiming(scope, label, {
        ...details,
        durationMs: Math.round(now - previousMarkAt),
        totalMs: Math.round(now - startedAt),
      });
      previousMarkAt = now;
    },
    end(label = "total", details?: Record<string, unknown>) {
      const now = getDevTimingNow();
      logDevTiming(scope, label, {
        ...details,
        durationMs: Math.round(now - previousMarkAt),
        totalMs: Math.round(now - startedAt),
      });
    },
  };
}
