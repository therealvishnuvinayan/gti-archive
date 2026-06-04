export const MIN_PASSWORD_LENGTH = 6;

export const PASSWORD_REQUIREMENTS = [
  "At least 6 characters",
  "One uppercase letter",
  "One number",
];

export const PASSWORD_VALIDATION_MESSAGES = {
  minLength: "Password must be at least 6 characters.",
  uppercase: "Password must include at least one uppercase letter.",
  number: "Password must include at least one number.",
};

export function getPasswordValidationErrors(password: string) {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(PASSWORD_VALIDATION_MESSAGES.minLength);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push(PASSWORD_VALIDATION_MESSAGES.uppercase);
  }

  if (!/[0-9]/.test(password)) {
    errors.push(PASSWORD_VALIDATION_MESSAGES.number);
  }

  return errors;
}

export function getPasswordValidationMessage(password: string) {
  return getPasswordValidationErrors(password).join(" ");
}

export function hasValidPasswordValue(password: string) {
  return getPasswordValidationErrors(password).length === 0;
}
