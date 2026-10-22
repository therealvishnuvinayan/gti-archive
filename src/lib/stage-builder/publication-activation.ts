import "server-only";
import { ensure } from "./contracts";

export const publicationEnabled = () => process.env.FLUX_STAGE_BUILDER_PUBLICATION === "1";
export const publicationDependenciesEnabled = () => ["FLUX_STAGE_BUILDER_DRAFTS", "FLUX_APPROVAL_ENGINE", "FLUX_SHARED_EVENTS"].every(key => process.env[key] === "1");
export function requirePublication() {
  ensure(publicationEnabled(), "PUBLICATION_DISABLED", 404);
  ensure(publicationDependenciesEnabled(), "PUBLICATION_DEPENDENCIES_REQUIRED", 503);
}
