// Deliberately opt-in. No existing feature flag or local environment is changed.
export function dashboardV2Enabled() {
  return process.env.FLUX_DASHBOARD_V2 === "1";
}
