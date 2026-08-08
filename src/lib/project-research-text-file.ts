export const PROJECT_RESEARCH_TEXT_FILE_MAX_BYTES = 1024 * 1024;
export const PROJECT_RESEARCH_TEXT_FILE_MAX_NAME_LENGTH = 180;

const invalidFileNameCharacters = /[<>:"/\\|?*\u0000-\u001f]/u;

export function normalizeProjectResearchTextFileName(value: string) {
  const trimmedName = value.trim();

  if (!trimmedName) {
    return { error: "File name is required." } as const;
  }

  if (
    trimmedName === "." ||
    trimmedName === ".." ||
    trimmedName.endsWith(".") ||
    invalidFileNameCharacters.test(trimmedName)
  ) {
    return {
      error: 'File names cannot contain path characters such as /, \\, :, *, ?, ", <, >, or |.',
    } as const;
  }

  const fileName = trimmedName.toLocaleLowerCase("en").endsWith(".txt")
    ? trimmedName
    : `${trimmedName}.txt`;

  if (fileName.length > PROJECT_RESEARCH_TEXT_FILE_MAX_NAME_LENGTH) {
    return {
      error: `File name must be ${PROJECT_RESEARCH_TEXT_FILE_MAX_NAME_LENGTH} characters or fewer, including .txt.`,
    } as const;
  }

  return { fileName } as const;
}

export function validateProjectResearchTextContent(value: string) {
  const byteLength = new TextEncoder().encode(value).byteLength;

  if (byteLength === 0) {
    return { error: "Enter some text before saving." } as const;
  }

  if (byteLength > PROJECT_RESEARCH_TEXT_FILE_MAX_BYTES) {
    return {
      error: "Text files created here must be 1 MB or smaller.",
    } as const;
  }

  return { byteLength } as const;
}

export function validatePreparedProjectResearchTextFile(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  const normalizedName = normalizeProjectResearchTextFileName(input.fileName);
  if ("error" in normalizedName) return normalizedName;

  if (normalizedName.fileName !== input.fileName.trim()) {
    return { error: "Created text files must use the .txt extension." } as const;
  }

  if (input.mimeType.toLocaleLowerCase("en") !== "text/plain") {
    return { error: "Created text files must use the text/plain MIME type." } as const;
  }

  if (
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > PROJECT_RESEARCH_TEXT_FILE_MAX_BYTES
  ) {
    return { error: "Created text files must be between 1 byte and 1 MB." } as const;
  }

  return { fileName: normalizedName.fileName } as const;
}
