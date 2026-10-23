export const archiveFoldersMigration = "20261025010000_archive_folders";

// Restore the exact 116-migration data model for compatibility rehearsals.
export function withoutArchiveFoldersSchema(schema) {
  for (const name of ["ArchiveFolder", "ArchiveFilePlacement", "ArchiveOrganizationCommand", "ArchiveVerificationDecision", "RetainedArchiveSource"]) {
    schema = schema.replace(new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, "m"), "");
    schema = schema.replace(new RegExp(`^  \\w+\\s+${name}(?:\\[\\]|\\?)?[^\\n]*\\n`, "gm"), "");
  }
  return schema.replace(/^  ARCHIVE_VERIFICATION_DECIDED\n/m, "");
}
