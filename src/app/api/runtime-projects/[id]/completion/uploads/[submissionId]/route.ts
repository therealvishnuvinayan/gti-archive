import { runtimeDocumentUploadTarget } from "@/lib/runtime-completion/service";
import { body, runtimeResponse } from "@/lib/stage-runtime/http";
export async function POST(request: Request, context: { params: Promise<{ id: string; submissionId: string }> }) { return runtimeResponse(async () => { await body(request); const p = await context.params; return runtimeDocumentUploadTarget(p.id, p.submissionId); }); }
