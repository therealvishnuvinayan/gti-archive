import "server-only";
export function denyLegacyAdministration(): never {
  throw new Error("Legacy account, invitation and permission administration is disabled. V2 role changes require the audited assignment service.");
}
