import "server-only";

// No environment file is changed by Phase 6.1. Disabled works on migration 116.
export function archiveFoldersEnabled() { return process.env.FLUX_ARCHIVE_FOLDERS === "1"; }
