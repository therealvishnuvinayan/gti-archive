import "server-only";
import { DraftError } from "../stage-builder/contracts";
import { packagingBlueprint } from "./packaging";
import { posmBlueprint } from "./posm";
import { retailDisplayBlueprint } from "./retail-display";

// Explicit identities only: never resolve module paths or accept client definitions.
const registry = new Map([
  ["gti-packaging-artwork", packagingBlueprint],
  ["gti-posm-promotional-materials", posmBlueprint],
  ["gti-retail-display", retailDisplayBlueprint],
]);
export function getBlueprint(id: string) {
  const factory = registry.get(id);
  if (!factory) throw new DraftError("BLUEPRINT_NOT_FOUND", 404);
  return factory();
}
