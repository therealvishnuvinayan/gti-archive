export const REQUEST_REMINDER_INTERVAL_HOURS = [24, 48, 72] as const;

export type RequestReminderIntervalHours =
  (typeof REQUEST_REMINDER_INTERVAL_HOURS)[number];

export function isRequestReminderInterval(
  value: unknown,
): value is RequestReminderIntervalHours {
  return (
    typeof value === "number" &&
    REQUEST_REMINDER_INTERVAL_HOURS.includes(value as RequestReminderIntervalHours)
  );
}

export function getNextReminderAt(
  now: Date,
  intervalHours: RequestReminderIntervalHours,
) {
  return new Date(now.getTime() + intervalHours * 60 * 60 * 1_000);
}

export function formatRequestReminderInterval(
  intervalHours: RequestReminderIntervalHours,
) {
  return `Every ${intervalHours} hours`;
}
