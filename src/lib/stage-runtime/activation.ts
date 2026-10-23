import { ensure } from "../stage-builder/contracts";
export const runtimeEnabled = () => process.env.FLUX_STAGE_RUNTIME === "1";
export function requireRuntime() {
  ensure(runtimeEnabled(), "RUNTIME_DISABLED", 404);
  ensure(["FLUX_SHARED_FILE_IDENTITY", "FLUX_APPROVAL_ENGINE", "FLUX_SHARED_EVENTS", "FLUX_STAGE_BUILDER_DRAFTS", "FLUX_STAGE_BUILDER_PUBLICATION"].every(k => process.env[k] === "1"), "RUNTIME_DEPENDENCIES_DISABLED", 503);
}
