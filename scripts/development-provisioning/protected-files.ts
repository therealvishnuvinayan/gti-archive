import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { requireProvisioning } from "./accounts";

function protectedParent(path: string, repository: string) {
  requireProvisioning(isAbsolute(path), "PROTECTED_FILE_REQUIRES_ABSOLUTE_PATH");
  const parent = realpathSync(dirname(path));
  const rel = relative(repository, parent);
  requireProvisioning(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel), "PROTECTED_FILES_MUST_BE_OUTSIDE_REPOSITORY");
  const directory = lstatSync(parent);
  requireProvisioning(directory.uid === process.getuid?.() && (directory.mode & 0o077) === 0, "PROTECTED_DIRECTORY_REQUIRES_OWNER_ONLY_ACCESS");
}

export function protectedFile(path: string, repository: string) {
  protectedParent(path, repository);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    requireProvisioning(stat.isFile() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0 && stat.size <= 16384,
      "PROTECTED_FILE_REQUIRES_OWNER_ONLY_ACCESS");
    const content = readFileSync(descriptor, "utf8");
    requireProvisioning(!/PRIVATE KEY/.test(content), "PRIVATE_SIGNING_KEYS_FORBIDDEN");
    return content;
  } finally { closeSync(descriptor); }
}

export function writeProtectedRequest(path: string, repository: string, payload: string) {
  protectedParent(path, repository);
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(descriptor, payload, "utf8"); } finally { closeSync(descriptor); }
}
