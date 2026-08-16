function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function getArchiveFileNameValidationError(
  originalFileName: string,
  proposedFileName: string,
  otherFileNames: string[],
) {
  const nextName = proposedFileName.trim();
  if (!nextName) return "Archive file name is required.";

  const originalExtension = getFileExtension(originalFileName);
  const nextExtension = getFileExtension(nextName);
  if (originalExtension && nextExtension !== originalExtension) {
    return `Keep the .${originalExtension} extension for this file.`;
  }
  if (!originalExtension && nextExtension) {
    return "Use the original file extension format for this archive file.";
  }
  if (
    otherFileNames.some(
      (candidate) => candidate.trim().toLowerCase() === nextName.toLowerCase(),
    )
  ) {
    return "Archive file names must be unique within this project archive.";
  }

  return null;
}
