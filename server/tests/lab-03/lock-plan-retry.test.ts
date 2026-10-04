import { describe, it, expect, vi } from "vitest";
import { LockPlanChanged, retryOnLockPlanChange } from "../../src/adminUsers.js";

// PR #60 review (Menelaus122, optional nit 3): a user edit plans its locks from
// an unlocked read and starts over if the locked rows differ (BR-81). If that
// happens on every attempt the request used to end in a plain 500. It now ends
// in 409 STALE_STATE, which tells the Administrator to try again.

describe("BR-81 lock-plan retries (PR #60 review)", () => {
  it("returns the result as soon as an attempt keeps its plan", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new LockPlanChanged()).mockResolvedValueOnce("saved");
    await expect(retryOnLockPlanChange(attempt)).resolves.toBe("saved");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives up after three changed plans with 409 STALE_STATE, not a server error", async () => {
    const attempt = vi.fn().mockRejectedValue(new LockPlanChanged());
    const error = await retryOnLockPlanChange(attempt).catch((e: unknown) => e);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({ status: 409, code: "STALE_STATE" });
    expect((error as Error).message).toBe("This user was changed by someone else at the same time. Please try again.");
  });

  it("passes any other error straight through, without retrying", async () => {
    const boom = new Error("database down");
    const attempt = vi.fn().mockRejectedValue(boom);
    await expect(retryOnLockPlanChange(attempt)).rejects.toBe(boom);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
