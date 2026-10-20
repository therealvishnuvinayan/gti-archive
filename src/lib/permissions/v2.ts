import "server-only";

import { runtimeAuthorization } from "../authorization/runtime";
import type { AuthorizationRequest } from "../authorization/policy";

/** Explicit migration boundary: use V2 capability names and a target ID.
 * Never OR this result with hasPermission/hasProjectPermission. The synchronous
 * legacy resolver stays unchanged until the corresponding service is migrated.
 */
export async function hasV2Permission(request: AuthorizationRequest) {
  return (await runtimeAuthorization.authorize(request)).decision === "ALLOW";
}

export const withV2Permission = runtimeAuthorization.runAuthorized;
