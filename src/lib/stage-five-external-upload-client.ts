export type ExternalStageFiveUploadedAttachment = {
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

function putFile(uploadUrl: string, file: File, headers: Record<string, string>) {
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

export async function uploadExternalStageFiveAttachment(
  token: string,
  file: File,
): Promise<ExternalStageFiveUploadedAttachment> {
  const requestBasePath = `/api/external/checklist-request/${encodeURIComponent(token)}`;
  let attachmentId: string | undefined;
  try {
    const response = await fetch(`${requestBasePath}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      }),
    });
    const preparation = (await response.json()) as UploadPreparation;
    if (!response.ok || !preparation.attachmentId || !preparation.uploadUrl) {
      throw new Error(preparation.error || "Unable to prepare the upload.");
    }
    attachmentId = preparation.attachmentId;
    await putFile(
      preparation.uploadUrl,
      file,
      preparation.uploadExpectedHeaders ?? {
        "Content-Type": file.type || "application/octet-stream",
      },
    );
    const completeResponse = await fetch(`${requestBasePath}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ attachmentId }),
    });
    const complete = (await completeResponse.json()) as { error?: string };
    if (!completeResponse.ok) {
      throw new Error(complete.error || "Unable to finish the upload.");
    }
    return {
      id: attachmentId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };
  } catch (error) {
    if (attachmentId) {
      await fetch(`${requestBasePath}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ attachmentId, failed: true }),
      }).catch(() => undefined);
    }
    throw error;
  }
}
