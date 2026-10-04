import { describe, it, expect } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  sessionCookieOptions,
  sessionExpiry,
  SESSION_TTL_MS,
} from "../../src/session.js";

// UNIT-04, UNIT-05 — session tokens and expiry (docs/lab-03/specification.md BR-15 to BR-17).

describe("UNIT-04 session token generation and storage", () => {
  it("is 32 random bytes, base64url-encoded, and never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes -> 43 base64url characters, no padding
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });

  it("stores only the SHA-256 hex digest, which never equals the token", () => {
    const token = generateSessionToken();
    const stored = hashSessionToken(token);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(token);
    expect(stored).not.toContain(token);
    expect(hashSessionToken(token)).toBe(stored); // deterministic, so it can be looked up
  });

  it("uses the cookie attributes BR-16 requires", () => {
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api", maxAge: 8 * 60 * 60 * 1000 });
  });
});

describe("UNIT-05 session expiry (BR-17)", () => {
  it("is valid until 8 hours after creation, and not a millisecond longer", () => {
    const created = new Date("2026-10-02T08:00:00.000Z");
    const expiresAt = sessionExpiry(created);
    expect(expiresAt.getTime() - created.getTime()).toBe(SESSION_TTL_MS);
    expect(SESSION_TTL_MS).toBe(8 * 60 * 60 * 1000);

    expect(isSessionExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isSessionExpired(expiresAt, expiresAt)).toBe(true);
    expect(isSessionExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
  });
});
