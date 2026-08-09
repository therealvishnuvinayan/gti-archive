import {
  createSecureExternalToken,
  getApplicationUrl,
  getSecureExternalTokenExpiryDays,
  hashSecureExternalToken,
} from "@/lib/secure-external-token";

const DEFAULT_APPROVAL_EXPIRY_DAYS = 7;
const DEFAULT_HANDOVER_EXPIRY_DAYS = 14;

export function createProductionApprovalToken(now = new Date()) {
  return createSecureExternalToken({
    expiryDays: getSecureExternalTokenExpiryDays({
      environmentKey: "PRODUCTION_APPROVAL_EXPIRY_DAYS",
      defaultDays: DEFAULT_APPROVAL_EXPIRY_DAYS,
    }),
    now,
  });
}

export function createProductionHandoverToken(now = new Date()) {
  return createSecureExternalToken({
    expiryDays: getSecureExternalTokenExpiryDays({
      environmentKey: "PRODUCTION_HANDOVER_EXPIRY_DAYS",
      defaultDays: DEFAULT_HANDOVER_EXPIRY_DAYS,
    }),
    now,
  });
}

export const hashProductionExternalToken = hashSecureExternalToken;

export function buildExternalProductionApprovalUrl(token: string) {
  return `${getApplicationUrl()}/external/production-approval/${encodeURIComponent(token)}`;
}

export function buildExternalProductionHandoverUrl(token: string) {
  return `${getApplicationUrl()}/external/production-handover/${encodeURIComponent(token)}`;
}
