export type StageSevenUploadedEvidence = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

export async function uploadStageSevenEvidence(
  projectId: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  if (!/^(image|video)\//i.test(file.type)) {
    throw new Error("Select an image or video file.");
  }
  let attachmentId: string | undefined;
  try {
    const response = await fetch("/api/project-assets/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        originalFileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        assetType: "SAMPLE_ROUND_EVIDENCE",
      }),
    });
    const preparation = (await response.json()) as {
      attachmentId?: string;
      uploadUrl?: string;
      uploadExpectedHeaders?: Record<string, string>;
      error?: string;
    };
    if (!response.ok || !preparation.attachmentId || !preparation.uploadUrl) {
      throw new Error(preparation.error || "Unable to prepare the evidence upload.");
    }
    attachmentId = preparation.attachmentId;
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", preparation.uploadUrl!);
      Object.entries(
        preparation.uploadExpectedHeaders ?? { "Content-Type": file.type },
      ).forEach(([key, value]) => request.setRequestHeader(key, value));
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 90));
      };
      request.onload = () =>
        request.status >= 200 && request.status < 300
          ? resolve()
          : reject(new Error("The storage upload was not accepted."));
      request.onerror = () => reject(new Error("The evidence upload could not be completed."));
      request.send(file);
    });
    onProgress?.(95);
    const completedResponse = await fetch("/api/project-assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId, projectId }),
    });
    const completed = (await completedResponse.json()) as { error?: string };
    if (!completedResponse.ok) {
      throw new Error(completed.error || "Unable to finish the evidence upload.");
    }
    onProgress?.(100);
    return {
      id: attachmentId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
    } satisfies StageSevenUploadedEvidence;
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
