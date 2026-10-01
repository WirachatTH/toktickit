import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/password.js";

// UNIT-01 — password hashing (docs/lab-03/specification.md BR-06, BR-10, D-03).
// Password *rules* (BR-07, BR-08) belong to Issue 3 (UNIT-02, UNIT-03).

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
