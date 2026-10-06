import { describe, it, expect, vi, afterEach } from "vitest";
import { LAB4_CALLS } from "./lab4ApiCalls.js";

// REG-05 — every Lab 4 API call sends the session cookie to a same-origin /api
// URL, as every Lab 3 call does (Lab 3 PR #55 review, D-11). Lab 3's
// apiCredentials.test.ts checks that no exported call is missing from its list
// plus this one.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("REG-05 every Lab 4 API call carries the session cookie", () => {
  it.each(LAB4_CALLS)("%s sends credentials: \"include\" to a same-origin /api URL", async (_name, call) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await call();
    expect(fetchSpy).toHaveBeenCalled();
    for (const [url, init] of fetchSpy.mock.calls) {
      expect(String(url)).toMatch(/^\/api\/tickets\/42\/actions-taken/);
      expect(init?.credentials).toBe("include");
    }
  });
});
