import "server-only";
export function archiveVerificationEnabled() { return process.env.FLUX_ARCHIVE_VERIFICATION === "1"; }
