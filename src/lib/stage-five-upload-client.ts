export type StageFiveUploadedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

export type StageFiveDirectSourceUpload = StageFiveUploadedAttachment & {
  handoffId: string;
  checklistId: string;
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
  onProgress?: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(Math.min(1, event.loaded / event.total));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve();
      } else reject(new Error("The storage upload was not accepted."));
    };
    request.onerror = () => reject(new Error("The storage upload could not be completed."));
    request.send(file);
  });
}

export async function uploadStageFiveChecklistAttachment(
  projectId: string,
  file: File,
  checklistRequestId?: string,
  onProgress?: (progress: number) => void,
): Promise<StageFiveUploadedAttachment> {
  let attachmentId: string | undefined;
  const requestBasePath = checklistRequestId
    ? `/api/requests/checklist/${encodeURIComponent(checklistRequestId)}`
    : null;

  try {
    onProgress?.(0.01);
    const response = await fetch(requestBasePath ? `${requestBasePath}/upload-url` : "/api/project-assets/upload-url", {
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
      (progress) => onProgress?.(0.02 + progress * 0.93),
    );

    const completeResponse = await fetch(requestBasePath ? `${requestBasePath}/complete` : "/api/project-assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId, projectId }),
    });
    const complete = (await completeResponse.json()) as { error?: string };
    if (!completeResponse.ok) {
      throw new Error(complete.error || "Unable to finish the checklist upload.");
    }
    onProgress?.(1);

    return {
      id: attachmentId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };
  } catch (error) {
    if (attachmentId) {
      await fetch(requestBasePath ? `${requestBasePath}/complete` : "/api/project-assets/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId, projectId, failed: true }),
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function uploadStageFiveDirectSource(
  projectId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<StageFiveDirectSourceUpload> {
  let attachmentId: string | undefined;
  let finalizationUncertain = false;
  let definitiveFinalizationFailure = false;

  try {
    onProgress?.(0.01);
    const response = await fetch("/api/project-assets/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        assetType: "GENERAL_PROJECT_ASSET",
        stageFiveDirectSource: true,
      }),
    });
    const preparation = (await response.json()) as UploadPreparation;
    if (!response.ok || !preparation.attachmentId || !preparation.uploadUrl) {
      throw new Error(
        preparation.error || "Unable to prepare the final-file upload.",
      );
    }
    attachmentId = preparation.attachmentId;

    await putFile(
      preparation.uploadUrl,
      file,
      preparation.uploadExpectedHeaders ?? {
        "Content-Type": file.type || "application/octet-stream",
      },
      (progress) => onProgress?.(0.02 + progress * 0.9),
    );

    let lastNetworkError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const completeResponse = await fetch("/api/project-assets/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attachmentId,
            projectId,
            stageFiveDirectSource: true,
          }),
        });
        const completed = (await completeResponse.json()) as {
          error?: string;
          stageFiveSource?: {
            handoffId: string;
            checklistId: string;
          } | null;
        };
        if (!completeResponse.ok || !completed.stageFiveSource) {
          definitiveFinalizationFailure = true;
          throw new Error(
            completed.error || "Unable to finish the final-file upload.",
          );
        }

        onProgress?.(1);
        return {
          id: attachmentId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          handoffId: completed.stageFiveSource.handoffId,
          checklistId: completed.stageFiveSource.checklistId,
        };
      } catch (error) {
        if (definitiveFinalizationFailure) {
          throw error;
        }
        lastNetworkError = error;
      }
    }

    finalizationUncertain = true;
    throw (
      lastNetworkError ??
      new Error(
        "The upload finished, but its Stage 5 status could not be confirmed. Refresh before trying again.",
      )
    );
  } catch (error) {
    if (attachmentId && !finalizationUncertain) {
      await fetch("/api/project-assets/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachmentId,
          projectId,
          failed: true,
          stageFiveDirectSource: true,
        }),
      }).catch(() => undefined);
    }
    throw error;
  }
}
