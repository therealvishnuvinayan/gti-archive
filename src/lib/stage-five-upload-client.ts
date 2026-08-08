export type StageFiveUploadedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

type UploadPreparation = {
  attachmentId?: string;
  uploadUrl?: string;
  uploadExpectedHeaders?: Record<string, string>;
  error?: string;
};

function putFile(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The storage upload was not accepted."));
    };
    request.onerror = () => reject(new Error("The storage upload could not be completed."));
    request.send(file);
  });
}

export async function uploadStageFiveChecklistAttachment(
  projectId: string,
  file: File,
): Promise<StageFiveUploadedAttachment> {
  let attachmentId: string | undefined;

  try {
    const response = await fetch("/api/project-assets/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        assetType: "FILE_CHECKLIST_ATTACHMENT",
      }),
    });
    const preparation = (await response.json()) as UploadPreparation;
    if (!response.ok || !preparation.attachmentId || !preparation.uploadUrl) {
      throw new Error(preparation.error || "Unable to prepare the checklist upload.");
    }
    attachmentId = preparation.attachmentId;

    await putFile(
      preparation.uploadUrl,
      file,
      preparation.uploadExpectedHeaders ?? {
        "Content-Type": file.type || "application/octet-stream",
      },
    );

    const completeResponse = await fetch("/api/project-assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId, projectId }),
    });
    const complete = (await completeResponse.json()) as { error?: string };
    if (!completeResponse.ok) {
      throw new Error(complete.error || "Unable to finish the checklist upload.");
    }

    return {
      id: attachmentId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };
  } catch (error) {
    if (attachmentId) {
      await fetch("/api/project-assets/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId, projectId, failed: true }),
      }).catch(() => undefined);
    }
    throw error;
  }
}
