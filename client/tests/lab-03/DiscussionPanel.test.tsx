import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../src/api.js";
import { DiscussionPanel } from "../../src/components/DiscussionPanel.js";

// UI-24 — the shared Public comments / Internal notes panel (docs/lab-03/ui-spec.md
// §1.6, §7.2; AC-24, FR-20). Issue 6 builds and tests it on its own; Issue 8
// mounts it on IT Staff Ticket Detail.

const STAFF = { id: 8, name: "Pimchanok Srisuk", role: "IT_STAFF" as const, isActive: true };
const entry = (id: number, body: string) => ({ id, body, createdAt: "2026-10-01T10:00:00.000Z", author: STAFF });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchComments").mockResolvedValue([entry(1, "Public reply")]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([entry(2, "Private finding")]);
});

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const panelOf = (name: RegExp) => document.getElementById(tab(name).getAttribute("aria-controls")!)!;

describe("UI-24 Public comments and Internal notes stay distinct (AC-24)", () => {
  it("is a two-tab list that opens on Public comments, with arrow-key navigation", async () => {
    render(<DiscussionPanel ticketId={42} canComment canPost />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(tab(/public comments/i)).toHaveAttribute("aria-selected", "true");
    expect(tab(/internal notes/i)).toHaveAttribute("aria-selected", "false");
    expect(await within(panelOf(/public comments/i)).findByText("Public reply")).toBeVisible();
    expect(panelOf(/internal notes/i)).not.toBeVisible();

    tab(/public comments/i).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(tab(/internal notes/i)).toHaveAttribute("aria-selected", "true");
    expect(tab(/internal notes/i)).toHaveFocus();
    expect(await within(panelOf(/internal notes/i)).findByText("Private finding")).toBeVisible();
    await userEvent.keyboard("{ArrowLeft}");
    expect(tab(/public comments/i)).toHaveAttribute("aria-selected", "true");
  });

  it("puts the note composer inside the Internal region with its caption, and labels the two buttons differently", async () => {
    render(<DiscussionPanel ticketId={42} canComment canPost />);
    const publicPanel = panelOf(/public comments/i);
    expect(within(publicPanel).getByRole("button", { name: "Post public comment" })).toBeInTheDocument();
    expect(within(publicPanel).getByText("Visible to the Requester")).toBeInTheDocument();
    expect(publicPanel.querySelector(".zg-internal-region")).toBeNull();

    await userEvent.click(tab(/internal notes/i));
    const internal = panelOf(/internal notes/i);
    const region = internal.querySelector(".zg-internal-region")!;
    expect(region).not.toBeNull();
    expect(within(region as HTMLElement).getByText("Internal — not visible to the Requester")).toBeInTheDocument();
    expect(within(region as HTMLElement).getByRole("textbox", { name: /add an internal note/i })).toBeInTheDocument();
    expect(within(region as HTMLElement).getByRole("button", { name: "Add internal note" })).toBeInTheDocument();
    expect(within(internal).queryByRole("button", { name: /public/i })).toBeNull();
  });

  it("keeps a separate draft per tab, so text typed as a note can't be posted publicly by switching tabs", async () => {
    const postComment = vi.spyOn(api, "postComment").mockResolvedValue(entry(3, "x"));
    const postNote = vi.spyOn(api, "postInternalNote").mockResolvedValue(entry(4, "Root cause: recalled battery"));
    render(<DiscussionPanel ticketId={42} canComment canPost />);

    await userEvent.click(tab(/internal notes/i));
    await userEvent.type(within(panelOf(/internal notes/i)).getByRole("textbox"), "Root cause: recalled battery");
    await userEvent.click(tab(/public comments/i));
    const publicBox = within(panelOf(/public comments/i)).getByRole("textbox");
    expect(publicBox).toHaveValue("");
    expect(within(panelOf(/public comments/i)).getByRole("button", { name: "Post public comment" })).toBeDisabled();

    await userEvent.click(tab(/internal notes/i));
    const noteBox = within(panelOf(/internal notes/i)).getByRole("textbox");
    expect(noteBox).toHaveValue("Root cause: recalled battery");
    await userEvent.click(within(panelOf(/internal notes/i)).getByRole("button", { name: "Add internal note" }));
    await waitFor(() => expect(postNote).toHaveBeenCalledWith(42, "Root cause: recalled battery"));
    expect(postComment).not.toHaveBeenCalled();
  });

  it("is read-only for an Administrator: both threads, no composer", async () => {
    render(<DiscussionPanel ticketId={42} canComment canPost={false} />);
    expect(await within(panelOf(/public comments/i)).findByText("Public reply")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /post public comment|add internal note/i })).toBeNull();
  });

  it("on a closed ticket allows an Internal note but not a Public comment (BR-52)", async () => {
    render(<DiscussionPanel ticketId={42} canComment={false} canPost />);
    expect(within(panelOf(/public comments/i)).getByRole("textbox")).toBeDisabled();
    expect(within(panelOf(/public comments/i)).getByText("This ticket is closed — new comments are not accepted.")).toBeInTheDocument();
    await userEvent.click(tab(/internal notes/i));
    expect(within(panelOf(/internal notes/i)).getByRole("textbox")).toBeEnabled();
  });
});

// Follow-ups from the PR #56 review (Issue 7).
describe("#56 review: tabs and ticket changes", () => {
  it("moves to the first and last tab with Home and End", async () => {
    render(<DiscussionPanel ticketId={42} canComment canPost />);
    tab(/public comments/i).focus();
    await userEvent.keyboard("{End}");
    expect(tab(/internal notes/i)).toHaveAttribute("aria-selected", "true");
    expect(tab(/internal notes/i)).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(tab(/public comments/i)).toHaveAttribute("aria-selected", "true");
    expect(tab(/public comments/i)).toHaveFocus();
  });

  it("reloads both threads and starts fresh drafts when it is shown for another ticket", async () => {
    const { rerender } = render(<DiscussionPanel ticketId={42} canComment canPost />);
    await within(panelOf(/public comments/i)).findByText("Public reply");
    await userEvent.type(within(panelOf(/public comments/i)).getByRole("textbox"), "draft for 42");

    vi.mocked(api.fetchComments).mockResolvedValue([entry(5, "Reply on ticket 43")]);
    vi.mocked(api.fetchInternalNotes).mockResolvedValue([entry(6, "Note on ticket 43")]);
    rerender(<DiscussionPanel ticketId={43} canComment canPost />);
    expect(await within(panelOf(/public comments/i)).findByText("Reply on ticket 43")).toBeInTheDocument();
    expect(within(panelOf(/public comments/i)).queryByText("Public reply")).toBeNull();
    expect(within(panelOf(/public comments/i)).getByRole("textbox")).toHaveValue("");
    expect(api.fetchComments).toHaveBeenLastCalledWith(43);
    expect(api.fetchInternalNotes).toHaveBeenLastCalledWith(43);
  });
});
