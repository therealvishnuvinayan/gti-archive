export type ProjectContactInput = {
  name: string;
  company?: string;
  position?: string;
  email?: string;
  phone?: string;
};

export type ProjectContactField = keyof ProjectContactInput;
export type ProjectContactFieldErrors = Partial<Record<ProjectContactField, string>>;

const MAX_CONTACT_NAME_LENGTH = 160;
const MAX_CONTACT_COMPANY_LENGTH = 160;
const MAX_CONTACT_POSITION_LENGTH = 160;
const MAX_CONTACT_EMAIL_LENGTH = 254;
const MAX_CONTACT_PHONE_LENGTH = 50;
const EMAIL_LOCAL_PART_PATTERN = /^[^\s@]+$/;
const EMAIL_DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
const INTERNATIONAL_PHONE_INPUT_PATTERN = /^[+\d\s().-]+$/;
const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeProjectContactEmail(value: string) {
  return value.trim().toLocaleLowerCase("en");
}

export function isValidProjectContactEmail(value: string) {
  const email = normalizeProjectContactEmail(value);

  if (!email || email.length > MAX_CONTACT_EMAIL_LENGTH) {
    return false;
  }

  const separatorIndex = email.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex !== email.indexOf("@")) {
    return false;
  }

  const localPart = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex + 1);
  const domainLabels = domain.split(".");

  return (
    localPart.length <= 64 &&
    EMAIL_LOCAL_PART_PATTERN.test(localPart) &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..") &&
    domainLabels.length >= 2 &&
    domainLabels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        EMAIL_DOMAIN_LABEL_PATTERN.test(label),
    )
  );
}

export function normalizeInternationalPhone(value: string) {
  const phone = value.trim();
  const hasLeadingPlus = phone.startsWith("+");

  if (
    !phone ||
    phone.length > MAX_CONTACT_PHONE_LENGTH ||
    (phone.match(/\+/g)?.length ?? 0) !== (hasLeadingPlus ? 1 : 0) ||
    !INTERNATIONAL_PHONE_INPUT_PATTERN.test(phone)
  ) {
    return null;
  }

  const normalized = `+${(hasLeadingPlus ? phone.slice(1) : phone).replace(/[^\d]/g, "")}`;
  return E164_PHONE_PATTERN.test(normalized) ? normalized : null;
}

export function validateProjectContactInput(input: ProjectContactInput) {
  const fieldErrors: ProjectContactFieldErrors = {};
  const name = normalizeWhitespace(input.name ?? "");
  const company = normalizeWhitespace(input.company ?? "");
  const position = normalizeWhitespace(input.position ?? "");
  const email = normalizeProjectContactEmail(input.email ?? "");
  const rawPhone = input.phone?.trim() ?? "";
  const phone = rawPhone ? normalizeInternationalPhone(rawPhone) : "";

  if (!name) {
    fieldErrors.name = "Name is required.";
  } else if (name.length > MAX_CONTACT_NAME_LENGTH) {
    fieldErrors.name = `Keep the name under ${MAX_CONTACT_NAME_LENGTH} characters.`;
  }

  if (company.length > MAX_CONTACT_COMPANY_LENGTH) {
    fieldErrors.company = `Keep the company under ${MAX_CONTACT_COMPANY_LENGTH} characters.`;
  }

  if (position.length > MAX_CONTACT_POSITION_LENGTH) {
    fieldErrors.position = `Keep the position under ${MAX_CONTACT_POSITION_LENGTH} characters.`;
  }

  if (email && !isValidProjectContactEmail(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (rawPhone && !phone) {
    fieldErrors.phone =
      "Enter a valid international phone number including country code.";
  }

  return {
    fieldErrors,
    data: {
      name,
      company,
      position,
      email,
      phone: phone ?? "",
    },
  };
}
