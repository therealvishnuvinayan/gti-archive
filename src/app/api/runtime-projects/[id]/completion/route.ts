import { getRuntimeCompletion, runtimeCompletionCommand } from "@/lib/runtime-completion/service";
import { body, runtimeResponse } from "@/lib/stage-runtime/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) { return runtimeResponse(async () => getRuntimeCompletion((await context.params).id)); }
export async function POST(request: Request, context: Context) { return runtimeResponse(async () => runtimeCompletionCommand((await context.params).id, await body(request))); }
