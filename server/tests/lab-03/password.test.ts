import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordForLogin,
  passwordRuleError,
  newPasswordError,
  SAME_AS_CURRENT,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../src/password.js";

// UNIT-01 — password hashing (docs/lab-03/specification.md BR-06, BR-10, D-03).
// UNIT-02, UNIT-03 — password rules (BR-07, BR-08), added by Issue 3.

describe("UNIT-01 password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("Correct-horse-42");
    expect(await verifyPassword("Correct-horse-42", hash)).toBe(true);
    expect(await verifyPassword("correct-horse-42", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("stores scrypt with its parameters, never the plaintext", async () => {
    const hash = await hashPassword("Correct-horse-42");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain("Correct-horse-42");
  });

  it("salts every hash, so the same password never hashes the same way twice", async () => {
    const a = await hashPassword("Same-password-1");
    const b = await hashPassword("Same-password-1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("Same-password-1", a)).toBe(true);
    expect(await verifyPassword("Same-password-1", b)).toBe(true);
  });

  it("never verifies against a missing hash — a migrated account is locked (BR-10)", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("", null)).toBe(false);
  });

  it("never verifies against a malformed or tampered hash, and never throws", async () => {
    const good = await hashPassword("Correct-horse-42");
    const [, n, r, p, salt, key] = good.split("$");
    const malformed = [
      "",
      "plaintext",
      `bcrypt$${n}$${r}$${p}$${salt}$${key}`,
      `scrypt$${n}$${r}$${p}$${salt}`,
      `scrypt$abc$${r}$${p}$${salt}$${key}`,
      `scrypt$${n}$${r}$${p}$${salt}$`,
      // Parameters far beyond scrypt's memory limit must fail closed.
      `scrypt$1073741824$${r}$${p}$${salt}$${key}`,
    ];
    for (const stored of malformed) {
      await expect(verifyPassword("Correct-horse-42", stored), stored).resolves.toBe(false);
    }
  });

  it("handles non-ASCII passwords, such as Thai", async () => {
    const hash = await hashPassword("รหัสผ่านใหม่2569");
    expect(await verifyPassword("รหัสผ่านใหม่2569", hash)).toBe(true);
    expect(await verifyPassword("รหัสผ่านใหม่2568", hash)).toBe(false);
  });
});

describe("UNIT-02 password rules (BR-07)", () => {
  const EMAIL = "someone@kmutt.ac.th";
  const ofLength = (n: number) => "a1" + "b".repeat(n - 2);

  it("accepts exactly 10 and exactly 128 characters, rejects 9 and 129", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(passwordRuleError(ofLength(10), EMAIL)).toBeNull();
    expect(passwordRuleError(ofLength(128), EMAIL)).toBeNull();
    expect(passwordRuleError(ofLength(9), EMAIL)).toMatch(/10 to 128 characters/);
    expect(passwordRuleError(ofLength(129), EMAIL)).toMatch(/10 to 128 characters/);
  });

  it("counts characters, not bytes or UTF-16 units — Thai and emoji count as one each", () => {
    expect(passwordRuleError("รหัสผ่านไทย12", EMAIL)).toBeNull(); // 13 characters, 37 bytes
    expect(passwordRuleError("🔒🔒🔒🔒🔒🔒🔒🔒a1", EMAIL)).toBeNull(); // 10 code points, 18 UTF-16 units
    expect(passwordRuleError("🔒🔒🔒🔒🔒🔒🔒a1", EMAIL)).toMatch(/10 to 128/); // 9 code points
  });

  it("requires at least one letter and at least one number", () => {
    expect(passwordRuleError("1234567890", EMAIL)).toMatch(/letter/);
    expect(passwordRuleError("abcdefghij", EMAIL)).toMatch(/number/);
    expect(passwordRuleError("ก1ข2ค3ง4จ5", EMAIL)).toBeNull(); // Thai letters count as letters
  });

  it("refuses the user's own email in any letter case, and never trims the password", () => {
    expect(passwordRuleError("Long.Name.2569@KMUTT.ac.th", "long.name.2569@kmutt.ac.th")).toMatch(/email/);
    expect(passwordRuleError("long.name.2569@kmutt.ac.th", "  Long.Name.2569@kmutt.ac.th ")).toMatch(/email/);
    expect(passwordRuleError(" long.name.2569@kmutt.ac.th", "long.name.2569@kmutt.ac.th")).toBeNull();
  });
});

describe("UNIT-03 a new password must differ from the current one (BR-08)", () => {
  it("rejects a new password identical to the current one, and accepts any other valid one", () => {
    expect(newPasswordError("Correct-horse-42", "x@kmutt.ac.th", "Correct-horse-42")).toBe(SAME_AS_CURRENT);
    expect(newPasswordError("Correct-horse-43", "x@kmutt.ac.th", "Correct-horse-42")).toBeNull();
    // Case matters: a different letter case is a different password.
    expect(newPasswordError("correct-horse-42", "x@kmutt.ac.th", "Correct-horse-42")).toBeNull();
  });

  it("reports the BR-07 rule first when the new password also breaks one", () => {
    expect(newPasswordError("short1", "x@kmutt.ac.th", "short1")).toMatch(/10 to 128/);
  });
});

describe("Sign-in verification never reveals whether a password exists (BR-10, BR-12)", () => {
  it("is false for a missing hash, and still does a full scrypt verification", async () => {
    const real = await hashPassword("Correct-horse-42");
    const t0 = performance.now();
    expect(await verifyPasswordForLogin("Correct-horse-42", null)).toBe(false);
    const missing = performance.now() - t0;
    const t1 = performance.now();
    expect(await verifyPasswordForLogin("Wrong-horse-42", real)).toBe(false);
    const wrong = performance.now() - t1;
    expect(await verifyPasswordForLogin("Correct-horse-42", real)).toBe(true);
    // Same order of magnitude: the missing-hash path really runs scrypt
    // instead of returning immediately. (A loose bound, so it is not flaky.)
    expect(missing).toBeGreaterThan(wrong / 4);
  });
});
