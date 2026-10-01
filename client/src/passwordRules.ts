// Lab 3, Issue 3 — the password rules the Change Password checklist shows
// (ui-spec.md §4), mirroring the server's BR-07 and BR-08. The server remains
// the authority; this only gives immediate feedback while typing.

export interface PasswordRuleCheck {
  id: "length" | "letter" | "number" | "notEmail" | "notCurrent";
  label: string;
  met: boolean;
}

export const MIN_LENGTH = 10;
export const MAX_LENGTH = 128;

export function checkPasswordRules(password: string, email: string, currentPassword: string): PasswordRuleCheck[] {
  // Characters as code points, so Thai characters and emoji count as one each.
  const length = [...password].length;
  return [
    { id: "length", label: `${MIN_LENGTH} to ${MAX_LENGTH} characters`, met: length >= MIN_LENGTH && length <= MAX_LENGTH },
    { id: "letter", label: "At least one letter", met: /\p{L}/u.test(password) },
    { id: "number", label: "At least one number", met: /\p{Nd}/u.test(password) },
    {
      id: "notEmail",
      label: "Not the same as your email",
      met: password.length > 0 && password.toLowerCase() !== email.trim().toLowerCase(),
    },
    { id: "notCurrent", label: "Different from your current password", met: password.length > 0 && password !== currentPassword },
  ];
}
