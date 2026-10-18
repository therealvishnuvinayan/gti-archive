import { NextResponse } from "next/server";
import { externalCompletionSubmission } from "@/lib/completion-documents/service";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const data = await request.json();
    if (!["INFO", "PREPARE", "FINISH"].includes(data.command)) throw new Error("Invalid submission operation.");
    const input = data.command === "INFO" ? undefined : {
      originalFileName: data.originalFileName, mimeType: data.mimeType, fileSize: data.fileSize, storageKey: data.storageKey, failed: data.failed === true,
    };
    return NextResponse.json(await externalCompletionSubmission(token, data.command, input), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return NextResponse.json({ error: "Submission unavailable. Check the link, request status and file, or contact the project manager." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
