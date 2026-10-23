import { createPackagingDraft } from "@/lib/standard-templates/service";
import { body, response } from "@/lib/stage-builder/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return response(async () => createPackagingDraft(await body(request)));
}
