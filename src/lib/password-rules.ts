export const MIN_PASSWORD_LENGTH = 8;

const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
const PASSWORD_NUMBER_REGEX = /\d/;
const PASSWORD_SPECIAL_CHARACTER_REGEX = /[!@#$%^&*]/;

export function getPasswordRequirementChecks(password: string) {
  return {
    minLength: password.length >= MIN_PASSWORD_LENGTH,
    uppercase: PASSWORD_UPPERCASE_REGEX.test(password),
    number: PASSWORD_NUMBER_REGEX.test(password),
    specialCharacter: PASSWORD_SPECIAL_CHARACTER_REGEX.test(password),
  };
}

export function isStrongPassword(password: string) {
  const checks = getPasswordRequirementChecks(password);
  return Object.values(checks).every(Boolean);
}
