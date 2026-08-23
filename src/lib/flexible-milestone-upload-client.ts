import { getUploadErrorMessage } from "@/lib/upload-validation";

export async function uploadFlexibleMilestoneAttachments(
  projectId: string,
  milestoneId: string,
  files: File[],
) {
  const milestonePath = `/api/flexible-projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}/attachments`;

  for (const file of files) {
    const preparationResponse = await fetch(`${milestonePath}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      }),
    });
    const preparation = (await preparationResponse.json()) as {
      error?: string;
      attachmentId?: string;
      uploadUrl?: string;
      uploadExpectedHeaders?: Record<string, string>;
    };
    if (!preparationResponse.ok || !preparation.attachmentId || !preparation.uploadUrl) {
      throw new Error(getUploadErrorMessage(preparation, `Unable to prepare ${file.name} for upload.`));
    }

    let failed = false;
    try {
      const putResponse = await fetch(preparation.uploadUrl, {
        method: "PUT",
        headers: preparation.uploadExpectedHeaders ?? { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putResponse.ok) throw new Error(`Unable to upload ${file.name}.`);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      const completionResponse = await fetch(`${milestonePath}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: preparation.attachmentId, failed }),
      });
      if (!failed && !completionResponse.ok) {
        const completion = (await completionResponse.json()) as { error?: string };
        throw new Error(completion.error || `Unable to finish uploading ${file.name}.`);
      }
    }
  }
}
