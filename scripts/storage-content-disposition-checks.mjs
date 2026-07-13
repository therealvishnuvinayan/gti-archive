import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const source = readFileSync("src/lib/storage/s3.ts", "utf8");

for (const snippet of [
  "function buildContentDisposition",
  "filename*=UTF-8''",
  "encodeRfc5987ValueChars",
  "sanitizeFileName(fileName)",
  'buildContentDisposition("attachment", fileName)',
  'buildContentDisposition("inline", fileName)',
]) {
  assert(source.includes(snippet), `Missing content disposition safeguard: ${snippet}`);
}

assert(
  !source.includes('ResponseContentDisposition: `attachment; filename="${fileName}"`') &&
    !source.includes('ResponseContentDisposition: `inline; filename="${fileName}"`'),
  "S3 response content disposition must not interpolate raw Unicode filenames.",
);

console.log("Storage content disposition checks passed.");
