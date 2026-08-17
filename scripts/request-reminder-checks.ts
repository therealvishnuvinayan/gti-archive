import assert from "node:assert/strict";

import { buildChecklistInformationReminderEmail } from "../src/lib/email/checklist-information-request";
import { buildPhysicalSampleReminderEmail } from "../src/lib/email/production-workflow";
import {
  buildRequestReminderCreateData,
  formatRequestReminderInterval,
  getNextReminderAt,
  isRequestReminderInterval,
  mapRequestReminder,
  REQUEST_REMINDER_INTERVAL_HOURS,
} from "../src/lib/request-reminders";

const base = new Date("2026-08-18T10:00:00.000Z");

assert.deepEqual(REQUEST_REMINDER_INTERVAL_HOURS, [24, 48, 72]);
for (const hours of REQUEST_REMINDER_INTERVAL_HOURS) {
  const next = getNextReminderAt(base, hours);
  assert.equal(next.getTime() - base.getTime(), hours * 60 * 60 * 1_000);
  assert(next > base, `${hours}h must never schedule an immediate reminder`);
  assert.equal(formatRequestReminderInterval(hours), `Every ${hours} hours`);
}
assert(isRequestReminderInterval(24));
assert(isRequestReminderInterval(48));
assert(isRequestReminderInterval(72));
assert(!isRequestReminderInterval(0));
assert(!isRequestReminderInterval(25));
assert(!isRequestReminderInterval("24"));

assert.equal(
  buildRequestReminderCreateData({
    projectId: "project",
    configuredById: "user",
    intervalHours: null,
    now: base,
  }),
  undefined,
  "disabled reminders must not create historical/default rows",
);
const enabled = buildRequestReminderCreateData({
  projectId: "project",
  configuredById: "user",
  intervalHours: 48,
  now: base,
});
assert(enabled);
assert.equal(enabled.nextReminderAt.toISOString(), "2026-08-20T10:00:00.000Z");
assert.equal(mapRequestReminder(null), null);
assert.deepEqual(
  mapRequestReminder({
    enabled: true,
    intervalHours: 72,
    nextReminderAt: getNextReminderAt(base, 72),
    lastReminderAt: null,
  }),
  {
    enabled: true,
    intervalHours: 72,
    nextReminderAt: "2026-08-21T10:00:00.000Z",
    lastReminderAt: null,
  },
);

const changedAt = new Date("2026-08-18T14:00:00.000Z");
assert.equal(
  getNextReminderAt(changedAt, 48).toISOString(),
  "2026-08-20T14:00:00.000Z",
  "an interval change must calculate from the change time",
);

const stageFiveEmail = buildChecklistInformationReminderEmail({
  recipientName: "Recipient",
  requesterName: "Requester",
  projectName: "Project",
  fileName: "Artwork.ai",
  fieldLabel: "Barcode",
  responseUrl: "https://example.test/external/checklist-request/token",
});
assert(stageFiveEmail.subject.includes("Reminder:"));
assert(stageFiveEmail.text.includes("Reminder:"));
assert(stageFiveEmail.text.includes("/external/checklist-request/token"));

const stageSevenEmail = buildPhysicalSampleReminderEmail({
  recipientName: "Supplier",
  projectName: "Project",
  unitName: "Carton",
  roundName: "Round 2",
  sampleType: "Production Sample",
  deadline: "20 Aug 2026",
  referenceFiles: [{ name: "Carton.ai", url: "https://example.test/file" }],
  actionUrl: "https://example.test/file",
  actionLabel: "Download Reference File",
});
assert(stageSevenEmail.subject.includes("Reminder:"));
assert(stageSevenEmail.text.includes("Carton.ai"));
assert(stageSevenEmail.text.includes("https://example.test/file"));

console.log("Request reminder timing, opt-in defaults, interval-change, and template checks passed.");
