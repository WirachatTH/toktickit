// Login attempt throttling — docs/lab-03/specification.md BR-14, D-12.
//
// Failures are counted per normalised email, never per IP: in this setup every
// browser reaches the API through the same Vite proxy, so an IP cannot tell
// users apart. Unknown emails are counted exactly like real ones, otherwise a
// 429 for one and a 401 for the other would reveal which emails exist (BR-12).
//
// The limit is a sliding window: once an email has MAX_FAILURES failures inside
// the last WINDOW_MS, it is refused until the oldest of them leaves the window.
//
// Attempts are RESERVED before the password is checked. Checking the limit,
// awaiting the password hash, and only then counting the failure would let
// every request sent at the same moment pass the check before any of them was
// counted — a burst of guesses would get past the limit. beginAttempt has no
// await between its check and its reservation, and Node runs it to completion
// before handling any other request, so the two cannot be separated.
//
// The store is in this process's memory: a restart clears it (D-12).

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_TRACKED_EMAILS = 10_000;

interface Entry {
  failures: number[]; // timestamps inside the window, oldest first
  inFlight: number; // reserved attempts whose outcome is not known yet
}

export type AttemptOutcome = "failure" | "success" | "neutral";
export type AttemptStart = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function throttleKey(email: string): string {
  return email.trim().toLowerCase();
}

export class LoginThrottle {
  // Insertion order is kept least-recently-used first, for eviction.
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly maxTracked: number = MAX_TRACKED_EMAILS) {}

  private prune(entry: Entry, now: number): void {
    while (entry.failures.length > 0 && now - entry.failures[0] >= WINDOW_MS) entry.failures.shift();
  }

  // Reserves one attempt, or refuses it. Refused when the failures inside the
  // window plus the attempts already in flight reach the limit: in-flight
  // attempts are guesses too, and if they fail the email is throttled.
  beginAttempt(email: string, now: number): AttemptStart {
    const key = throttleKey(email);
    const entry = this.entries.get(key) ?? { failures: [], inFlight: 0 };
    this.prune(entry, now);

    if (entry.failures.length + entry.inFlight >= MAX_FAILURES) {
      // The earliest the email can be allowed again is when its oldest failure
      // leaves the window. With attempts still in flight there may be no
      // failure yet; if they all fail, the window starts now.
      const oldest = entry.failures[0] ?? now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)) };
    }

    entry.inFlight += 1;
    this.touch(key, entry, now);
    return { allowed: true };
  }

  // Releases a reservation with its outcome. Every allowed attempt must end
  // here exactly once (the login handler calls it from a finally block).
  endAttempt(email: string, outcome: AttemptOutcome, now: number): void {
    const key = throttleKey(email);
    const entry = this.entries.get(key);
    if (!entry) return; // evicted while in flight; nothing left to count against
    entry.inFlight = Math.max(0, entry.inFlight - 1);
    this.prune(entry, now);

    if (outcome === "failure") entry.failures.push(now);
    // A success clears the count (BR-14). Other attempts still in flight keep
    // their reservations and report their own outcomes.
    if (outcome === "success") entry.failures = [];

    if (entry.failures.length === 0 && entry.inFlight === 0) this.entries.delete(key);
    else this.touch(key, entry, now);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  private touch(key: string, entry: Entry, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.evictIfFull(now);
  }

  // Over the cap, forget the least recently used email that is neither
  // throttled nor mid-attempt. Forgetting a throttled email would let anyone
  // lift its limit early by failing on enough other emails. Only when every
  // tracked email is throttled or mid-attempt does the oldest go (D-12).
  private evictIfFull(now: number): void {
    while (this.entries.size > this.maxTracked) {
      let victim: string | undefined;
      for (const [key, entry] of this.entries) {
        this.prune(entry, now);
        if (entry.inFlight === 0 && entry.failures.length < MAX_FAILURES) {
          victim = key;
          break;
        }
      }
      this.entries.delete(victim ?? this.entries.keys().next().value!);
    }
  }
}

// The one store the login endpoint uses.
export const loginThrottle = new LoginThrottle();

// Tests call this in beforeEach, so one test's failed logins cannot throttle
// the next test's account.
export function resetLoginThrottle(): void {
  loginThrottle.clear();
}
