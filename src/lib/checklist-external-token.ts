const DEFAULT_EXPIRY_DAYS = 7;

import {
  createSecureExternalToken,
  getApplicationUrl,
  getSecureExternalTokenExpiryDays,
  hashSecureExternalToken,
} from "@/lib/secure-external-token";

export function getChecklistExternalRequestExpiryDays() {
  return getSecureExternalTokenExpiryDays({
    environmentKey: "CHECKLIST_EXTERNAL_REQUEST_EXPIRY_DAYS",
    defaultDays: DEFAULT_EXPIRY_DAYS,
  });
}

export function hashExternalChecklistToken(token: string) {
  return hashSecureExternalToken(token);
}

export function createExternalChecklistToken(now = new Date()) {
  return createSecureExternalToken({
    expiryDays: getChecklistExternalRequestExpiryDays(),
    now,
  });
}

export function buildExternalChecklistRequestUrl(token: string) {
  return `${getApplicationUrl()}/external/checklist-request/${encodeURIComponent(token)}`;
}
