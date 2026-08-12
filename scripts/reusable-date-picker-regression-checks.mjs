import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} is missing.`);
}

function assertNotIncludes(source, value, label) {
  assert(!source.includes(value), `${label} must not be present.`);
}

const appDatePicker = read("src/components/calendar/app-date-picker.tsx");
const archiveMetadataForm = read("src/components/archives/archive-artwork-metadata-form.tsx");

for (const snippet of [
  "CalendarMonthGrid",
  "formatCalendarDateValue",
  "parseCalendarDateValue",
  "createPortal",
  "clearable",
  "onChange(\"\")",
  "type=\"hidden\"",
]) {
  assertIncludes(appDatePicker, snippet, `Reusable date picker ${snippet}`);
}

assertNotIncludes(
  appDatePicker,
  'type="date"',
  "Reusable date picker native date input",
);

for (const snippet of [
  'import { AppDatePicker } from "@/components/calendar/app-date-picker";',
  'type === "date"',
  "<AppDatePicker",
  "clearable={!required}",
  "creationDate",
  "lastModifiedDate",
  "goLiveOnShelfDate",
  "expirySunsetDate",
  "approvedAt",
]) {
  assertIncludes(archiveMetadataForm, snippet, `Archive metadata date picker usage ${snippet}`);
}

assert(
  !/<(?:Input|input)[^>]*type="date"/s.test(archiveMetadataForm),
  "Archive wizard native date input must not be present.",
);

console.log("Reusable date picker regression checks passed.");
