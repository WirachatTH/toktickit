import { describe, it, expect, vi, afterEach } from "vitest";
import * as api from "../../src/api.js";

// Every API call sends the session cookie (credentials: "include") and stays
// on the page's own origin (relative /api URL, D-11). Raised in the PR #55
// review: the Requester calls relied on the same-origin default, which is
// correct today but would silently drop the cookie if the client were ever
// served from another origin. One test per exported call, so a new call that
// bypasses apiFetch fails here.

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ user: {}, data: [], pagination: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const CALLS: [string, () => Promise<unknown>][] = [
  ["fetchCategories", () => api.fetchCategories()],
  ["fetchRelatedSystems", () => api.fetchRelatedSystems()],
  ["createTicket", () => api.createTicket({ categoryId: 1, relatedSystemId: 1, summary: "s", description: "d" })],
  ["fetchTickets", () => api.fetchTickets({ page: 2 })],
  ["fetchTicket", () => api.fetchTicket(42)],
  ["addAttachmentToTicket", () => api.addAttachmentToTicket(42, new File(["x"], "x.png", { type: "image/png" }))],
  ["removeAttachment", () => api.removeAttachment(42, 7, "Wrong file")],
  ["downloadAttachment", () => api.downloadAttachment(42, 7)],
  ["fetchComments", () => api.fetchComments(42)],
  ["postComment", () => api.postComment(42, "Hello")],
  ["fetchInternalNotes", () => api.fetchInternalNotes(42)],
  ["postInternalNote", () => api.postInternalNote(42, "Hello")],
  ["fetchStaffQueue", () => api.fetchStaffQueue({ status: "ALL", page: "2" })],
  ["fetchAssignableUsers", () => api.fetchAssignableUsers()],
  ["fetchStaffTicket", () => api.fetchStaffTicket(42)],
  ["changeOwner", () => api.changeOwner(42, { ownerId: 8, expectedOwnerId: null, expectedStatus: "NEW" })],
  ["changeItPriority", () => api.changeItPriority(42, { itPriority: "HIGH", expectedStatus: "OPEN" })],
  ["changeStatus", () => api.changeStatus(42, { status: "IN_PROGRESS", expectedStatus: "OPEN", expectedOwnerId: 8 })],
  ["markAppearsResolved", () => api.markAppearsResolved(42, "Works now")],
  ["checkSystem", () => api.checkSystem()],
  ["login", () => api.login("a@kmutt.ac.th", "pw")],
  ["logout", () => api.logout()],
  ["fetchCurrentUser", () => api.fetchCurrentUser()],
  ["changePassword", () => api.changePassword("old", "new")],
];

describe("every API call carries the session cookie (PR #55 review)", () => {
  it.each(CALLS)("%s sends credentials: \"include\" to a same-origin /api URL", async (_name, call) => {
    const fetchSpy = stubFetch();
    await call();
    expect(fetchSpy).toHaveBeenCalled();
    for (const [url, init] of fetchSpy.mock.calls) {
      expect(String(url)).toMatch(/^\/api\//);
      expect(init?.credentials).toBe("include");
    }
  });

  it("covers every exported request function", () => {
    const exported = Object.entries(api)
      .filter(([name, value]) => typeof value === "function" && name !== "ApiError" && name !== "onSessionEnded")
      .map(([name]) => name)
      .sort();
    expect(exported).toEqual(CALLS.map(([name]) => name).sort());
  });
});
