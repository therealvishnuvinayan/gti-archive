export const MIN_PASSWORD_LENGTH = 1;

export function hasValidPasswordValue(password: string) {
  return password.trim().length >= MIN_PASSWORD_LENGTH;
}
