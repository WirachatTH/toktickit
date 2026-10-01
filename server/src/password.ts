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
