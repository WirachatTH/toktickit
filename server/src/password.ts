import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Lab 3 password hashing — docs/lab-03/specification.md BR-06, D-03.
//
// Node's built-in scrypt: memory-hard, salted per password, and no new
// dependency or native build step. The parameters are stored inside every
// hash (`scrypt$N$r$p$salt$hash`) so they can be raised later without
// invalidating passwords that were hashed with the old ones.

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => (error ? reject(error) : resolve(derived)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

// A missing or malformed hash never verifies. A migrated account has no hash
// until a password is assigned, and that must be a locked door (BR-10, D-07).
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Object.values(cost).every((v) => Number.isSafeInteger(v) && v > 0)) return false;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, cost);
  } catch {
    // e.g. parameters beyond scrypt's memory limit in a tampered hash
    return false;
  }
  // Constant-time comparison, so the time taken reveals nothing about how much
  // of the hash matched.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// Sign-in timing (BR-10, BR-12)
// ---------------------------------------------------------------------------

// Started when the module loads, not on the first unknown email, so the first
// such request does not stand out by doing two scrypt operations.
const dummyHash: Promise<string> = hashPassword(randomBytes(32).toString("base64"));

// Used by login. When there is no hash to check — an unknown email, or a
// migrated account that has no password yet — it still runs one full scrypt
// verification against a dummy hash, so response time does not reveal which
// emails exist or which accounts have a password. Always false in that case.
export async function verifyPasswordForLogin(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    await verifyPassword(password, await dummyHash);
    return false;
  }
  return verifyPassword(password, stored);
}

// ---------------------------------------------------------------------------
// Password rules (BR-07, BR-08)
// ---------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// The rules a new password must meet, each with the exact wording the Change
// Password checklist shows (ui-spec §4). Characters are counted as code points,
// so an emoji or a Thai character is one character. scrypt has no input-length
// limit, so no separate byte limit is needed (unlike bcrypt's 72 bytes).
// Passwords are never trimmed: a space is a character the user chose.
export function passwordRuleError(password: string, email: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    return `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!/\p{L}/u.test(password)) return "Include at least one letter.";
  if (!/\p{Nd}/u.test(password)) return "Include at least one number.";
  if (password.toLowerCase() === email.trim().toLowerCase()) return "Don't use your email address as your password.";
  return null;
}

// BR-08 — needs the current password, so the change-password handler calls
// this only after it has verified the current password is correct.
export const SAME_AS_CURRENT = "Choose a password different from your current one.";

export function newPasswordError(newPassword: string, email: string, currentPassword: string): string | null {
  return passwordRuleError(newPassword, email) ?? (newPassword === currentPassword ? SAME_AS_CURRENT : null);
}
