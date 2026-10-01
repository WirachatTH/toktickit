import { describe, it, expect } from "vitest";
import { LoginThrottle, MAX_FAILURES, WINDOW_MS, loginThrottle, resetLoginThrottle } from "../../src/loginThrottle.js";

// UNIT-06 — the login throttle store (docs/lab-03/specification.md BR-14, D-12),
// driven by an explicit clock so no test waits.

const T0 = 1_800_000_000_000;
const MIN = 60 * 1000;

function fail(t: LoginThrottle, email: string, now: number) {
  const start = t.beginAttempt(email, now);
  expect(start.allowed, `attempt at ${now}`).toBe(true);
  t.endAttempt(email, "failure", now);
}

describe("UNIT-06 login throttle", () => {
  it("allows four failures, refuses after the fifth, and names the wait", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 4; i++) fail(t, "a@x.test", T0 + i * MIN);
    expect(t.beginAttempt("a@x.test", T0 + 4 * MIN).allowed).toBe(true);
    t.endAttempt("a@x.test", "failure", T0 + 4 * MIN);

    const refused = t.beginAttempt("a@x.test", T0 + 5 * MIN);
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: (WINDOW_MS - 5 * MIN) / 1000 });
    expect(MAX_FAILURES).toBe(5);
  });

  it("frees the email as the oldest failure leaves the 15-minute window (sliding)", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) fail(t, "a@x.test", T0 + i * MIN);
    expect(t.beginAttempt("a@x.test", T0 + WINDOW_MS - 1).allowed).toBe(false);
    expect(t.beginAttempt("a@x.test", T0 + WINDOW_MS).allowed).toBe(true); // oldest just left
  });

  it("counts each email on its own, normalised", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) fail(t, i % 2 ? "  A@X.test " : "a@x.test", T0 + i);
    expect(t.beginAttempt("A@x.TEST", T0 + 10).allowed).toBe(false);
    expect(t.beginAttempt("b@x.test", T0 + 10).allowed).toBe(true);
  });

  it("is cleared by a success, but only for that email", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 4; i++) {
      fail(t, "a@x.test", T0 + i);
      fail(t, "b@x.test", T0 + i);
    }
    expect(t.beginAttempt("a@x.test", T0 + 10).allowed).toBe(true);
    t.endAttempt("a@x.test", "success", T0 + 10);
    for (let i = 0; i < 4; i++) fail(t, "a@x.test", T0 + 20 + i); // four more: still allowed
    expect(t.beginAttempt("a@x.test", T0 + 30).allowed).toBe(true);
    fail(t, "b@x.test", T0 + 30); // b's fifth
    expect(t.beginAttempt("b@x.test", T0 + 31).allowed).toBe(false);
  });

  it("reserves attempts in flight, so a burst cannot pass the limit before any is counted", () => {
    const t = new LoginThrottle();
    const starts = Array.from({ length: 20 }, () => t.beginAttempt("a@x.test", T0));
    expect(starts.filter((s) => s.allowed)).toHaveLength(MAX_FAILURES);
    expect(starts.filter((s) => !s.allowed)).toHaveLength(20 - MAX_FAILURES);

    // In-flight attempts add to earlier failures.
    const u = new LoginThrottle();
    for (let i = 0; i < 3; i++) fail(u, "a@x.test", T0 + i);
    expect(u.beginAttempt("a@x.test", T0 + 10).allowed).toBe(true);
    expect(u.beginAttempt("a@x.test", T0 + 10).allowed).toBe(true);
    expect(u.beginAttempt("a@x.test", T0 + 10).allowed).toBe(false);
  });

  it("gives a slot back on a neutral outcome without counting it", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) {
      expect(t.beginAttempt("a@x.test", T0 + i).allowed).toBe(true);
      t.endAttempt("a@x.test", "neutral", T0 + i);
    }
    expect(t.beginAttempt("a@x.test", T0 + 10).allowed).toBe(true);
    expect(t.size).toBe(1); // only the reservation just made
  });

  it("never evicts a throttled email to make room, so flooding other emails cannot lift it", () => {
    const t = new LoginThrottle(3);
    for (let i = 0; i < 5; i++) fail(t, "victim@x.test", T0 + i);
    for (let n = 0; n < 50; n++) fail(t, `other${n}@x.test`, T0 + 100 + n);
    expect(t.size).toBeLessThanOrEqual(3);
    expect(t.beginAttempt("victim@x.test", T0 + 1000).allowed).toBe(false);
  });

  it("holds at most the cap, forgetting the least recently used unthrottled email first", () => {
    const t = new LoginThrottle(3);
    fail(t, "a@x.test", T0);
    fail(t, "b@x.test", T0 + 1);
    fail(t, "c@x.test", T0 + 2);
    fail(t, "a@x.test", T0 + 3); // a is now the most recently used
    fail(t, "d@x.test", T0 + 4); // over the cap: b goes
    expect(t.size).toBe(3);
    for (let i = 0; i < 3; i++) fail(t, "b@x.test", T0 + 10 + i); // b starts from zero again
    expect(t.beginAttempt("b@x.test", T0 + 20).allowed).toBe(true);
  });

  it("resetLoginThrottle empties the shared store", () => {
    fail(loginThrottle, "shared@x.test", T0);
    expect(loginThrottle.size).toBeGreaterThan(0);
    resetLoginThrottle();
    expect(loginThrottle.size).toBe(0);
  });
});
