import { runtimeEnabled } from "../stage-runtime/activation";
import { ensure } from "../stage-builder/contracts";

/** Separate opt-in; never modifies or infers local deployment configuration. */
export function runtimeIntegrationEnabled() {
  return runtimeEnabled() && process.env.FLUX_RUNTIME_INTEGRATION === "1";
}
export function requireRuntimeIntegration() {
  ensure(runtimeIntegrationEnabled(), "RUNTIME_INTEGRATION_DISABLED", 404);
}
