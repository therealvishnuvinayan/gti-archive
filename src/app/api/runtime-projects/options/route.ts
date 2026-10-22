import { runtimeCreationOptions } from "@/lib/stage-runtime/service";
import { runtimeResponse } from "@/lib/stage-runtime/http";
export async function GET() { return runtimeResponse(runtimeCreationOptions); }
