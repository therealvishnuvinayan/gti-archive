import { createBlueprintDraft } from "@/lib/standard-templates/service";
import { body, response } from "@/lib/stage-builder/http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ blueprintId: string }> }) {
  return response(async () => createBlueprintDraft((await params).blueprintId, await body(request)));
}
