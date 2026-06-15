export const ALLOWED_PROJECT_CURRENCIES = ["USD", "AED", "EUR"] as const;

export type ProjectCurrencyCode = (typeof ALLOWED_PROJECT_CURRENCIES)[number];

export const PROJECT_CURRENCY_OPTIONS: Array<{
  code: ProjectCurrencyCode;
  name: string;
}> = [
  { code: "USD", name: "US Dollar" },
  { code: "AED", name: "UAE Dirham" },
  { code: "EUR", name: "Euro" },
];

export const DEFAULT_PROJECT_CURRENCY: ProjectCurrencyCode = "USD";

export function isAllowedProjectCurrency(value: string): value is ProjectCurrencyCode {
  return ALLOWED_PROJECT_CURRENCIES.includes(value as ProjectCurrencyCode);
}

export function normalizeProjectCurrency(value: string) {
  return value.trim().toUpperCase();
}

export function resolveProjectCurrency(value: string) {
  const normalizedCurrency = normalizeProjectCurrency(value);

  return isAllowedProjectCurrency(normalizedCurrency) ? normalizedCurrency : null;
}
