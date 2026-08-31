import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AttachmentSection } from "../../src/components/AttachmentSection.js";
import * as api from "../../src/api.js";
import { ApiError, TicketDetailAttachment } from "../../src/api.js";

// Issue 8 — Attachment list, add, and soft-remove on Ticket Detail
// (ui-spec.md §6.5, specification.md BR-30-39). UI-12/UI-13/UI-14 per
// tests.md's planned test-file split.

const ACTIVE: TicketDetailAttachment = {
  id: 1,
  originalFilename: "evidence.png",
  mimeType: "image/png",
  sizeBytes: 204800,
  uploadedAt: "2026-08-27T09:15:00.000Z",
  isRemoved: false,
  removedAt: null,
  removedReason: null,
};

const REMOVED: TicketDetailAttachment = {
  id: 2,
  originalFilename: "old_photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 92000,
  uploadedAt: "2026-08-26T10:00:00.000Z",
  isRemoved: true,
  removedAt: "2026-08-27T08:00:00.000Z",
  removedReason: "Wrong screenshot, replaced by evidence.png.",
};

function makeActive(id: number): TicketDetailAttachment {
  return { ...ACTIVE, id, originalFilename: `photo-${id}.png` };
}

// A small stateful harness — AttachmentSection is a controlled component,
// so a test needs something that actually applies onAttachmentsChange for
// the re-render to reflect an add/remove, the same as RequesterTicketDetail
// does in the real app.
function Harness({ initial }: { initial: TicketDetailAttachment[] }) {
  const [attachments, setAttachments] = useState(initial);
  return <AttachmentSection requesterId={3} ticketId={42} attachments={attachments} onAttachmentsChange={setAttachments} />;
}

function renderSection(initial: TicketDetailAttachment[]) {
  return render(<Harness initial={initial} />);
}

beforeEach(() => {
  // jsdom doesn't implement these — Download stubs them out for real use.
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock-url"), revokeObjectURL: vi.fn() });
});

describe("active attachments", () => {
  it("shows filename, size, upload date, and Download + Remove controls", () => {
    renderSection([ACTIVE]);
    expect(screen.getByText("evidence.png")).toBeInTheDocument();
    expect(screen.getByText(/200 kb/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("downloads via a blob save, not a plain link (auth requires a custom header)", async () => {
    vi.spyOn(api, "downloadAttachment").mockResolvedValue(new Blob(["data"]));
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    await waitFor(() => expect(api.downloadAttachment).toHaveBeenCalledWith(3, 42, ACTIVE.id));
  });

  it("shows a safe error if download fails", async () => {
    vi.spyOn(api, "downloadAttachment").mockRejectedValue(new Error("network down"));
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(await screen.findByText(/unable to download this attachment/i)).toBeInTheDocument();
  });
});

describe("removed attachments are metadata-only (UI-13, BR-36)", () => {
  it("shows filename, size, removed date, and reason, with no action controls", () => {
    renderSection([REMOVED]);
    expect(screen.getByText("old_photo.jpg")).toBeInTheDocument();
    expect(screen.getByText(/wrong screenshot, replaced by evidence\.png/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("lists active and removed attachments separately when both exist", () => {
    renderSection([ACTIVE, REMOVED]);
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(screen.getByText("evidence.png")).toBeInTheDocument();
    expect(screen.getByText("old_photo.jpg")).toBeInTheDocument();
  });
});

describe("soft-remove requires a reason and explicit confirmation (UI-12, BR-34)", () => {
  it("does not remove on a single click — opens a confirmation modal instead", async () => {
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(removeSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove attachment/i })).toBeInTheDocument();
  });

  it("rejects an empty reason inline without calling the API", async () => {
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.click(screen.getByRole("button", { name: /remove attachment/i }));

    expect(await screen.findByText(/between 3 and 200 characters/i)).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("rejects a too-short reason inline without calling the API", async () => {
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.type(screen.getByLabelText(/reason for removal/i), "no");
    await userEvent.click(screen.getByRole("button", { name: /remove attachment/i }));

    expect(await screen.findByText(/between 3 and 200 characters/i)).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("rejects a too-long reason (201 characters) inline without calling the API — only the short boundary was tested before", async () => {
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    // fireEvent, not userEvent.type — 201 simulated keystrokes would be
    // needlessly slow for a value the component never inspects character
    // by character.
    fireEvent.change(screen.getByLabelText(/reason for removal/i), { target: { value: "x".repeat(201) } });
    await userEvent.click(screen.getByRole("button", { name: /remove attachment/i }));

    expect(await screen.findByText(/between 3 and 200 characters/i)).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("accepts a reason at exactly the 200-character boundary", async () => {
    vi.spyOn(api, "removeAttachment").mockResolvedValue({
      id: ACTIVE.id,
      isRemoved: true,
      removedAt: "2026-08-30T12:00:00.000Z",
      removedReason: "x".repeat(200),
    });
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    fireEvent.change(screen.getByLabelText(/reason for removal/i), { target: { value: "x".repeat(200) } });
    await userEvent.click(screen.getByRole("button", { name: /remove attachment/i }));

    await waitFor(() => expect(api.removeAttachment).toHaveBeenCalledWith(3, 42, ACTIVE.id, "x".repeat(200)));
  });

  it("Cancel closes the modal without removing", async () => {
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.type(screen.getByLabelText(/reason for removal/i), "Wrong file entirely.");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("Escape closes the modal without removing, same as Cancel", async () => {
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.type(screen.getByLabelText(/reason for removal/i), "Wrong file entirely.");
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("clicking outside the modal does nothing — it stays open, nothing is removed", async () => {
    const removeSpy = vi.spyOn(api, "removeAttachment");
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    const dialog = screen.getByRole("dialog");
    // The backdrop is the dialog's parent; click it directly (not the dialog itself).
    await userEvent.click(dialog.parentElement as HTMLElement);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("returns focus to the triggering Remove button after Cancel", async () => {
    renderSection([ACTIVE]);
    const removeButton = screen.getByRole("button", { name: /remove/i });

    await userEvent.click(removeButton);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(removeButton).toHaveFocus());
  });

  it("submits a valid reason, calls the API, and reflects the removal without a full reload", async () => {
    vi.spyOn(api, "removeAttachment").mockResolvedValue({
      id: ACTIVE.id,
      isRemoved: true,
      removedAt: "2026-08-30T12:00:00.000Z",
      removedReason: "Wrong file, superseded by a clearer screenshot.",
    });
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.type(screen.getByLabelText(/reason for removal/i), "Wrong file, superseded by a clearer screenshot.");
    await userEvent.click(screen.getByRole("button", { name: /remove attachment/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.removeAttachment).toHaveBeenCalledWith(3, 42, ACTIVE.id, "Wrong file, superseded by a clearer screenshot.");
    // Same attachment now shown in the removed section — no Download/Remove
    // buttons left for it, and the previously-active list is now empty.
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
    expect(screen.getByText(/wrong file, superseded by a clearer screenshot/i)).toBeInTheDocument();
  });

  it("shows a safe inline error and keeps the modal open if the API call fails", async () => {
    vi.spyOn(api, "removeAttachment").mockRejectedValue(new ApiError(409, "CONFLICT", "This attachment has already been removed."));
    renderSection([ACTIVE]);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.type(screen.getByLabelText(/reason for removal/i), "Trying to remove it.");
    await userEvent.click(screen.getByRole("button", { name: /remove attachment/i }));

    expect(await screen.findByText(/already been removed/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Add Attachment", () => {
  it("adds a valid file and updates the list without a full page reload", async () => {
    const newAttachment: TicketDetailAttachment = {
      id: 9,
      originalFilename: "new-evidence.png",
      mimeType: "image/png",
      sizeBytes: 10240,
      uploadedAt: "2026-08-30T12:00:00.000Z",
      isRemoved: false,
      removedAt: null,
      removedReason: null,
    };
    vi.spyOn(api, "addAttachmentToTicket").mockResolvedValue(newAttachment);
    renderSection([]);

    const input = screen.getByLabelText(/add attachment/i) as HTMLInputElement;
    const file = new File([new Uint8Array(1024)], "new-evidence.png", { type: "image/png" });
    await userEvent.upload(input, file);

    expect(await screen.findByText("new-evidence.png")).toBeInTheDocument();
    expect(api.addAttachmentToTicket).toHaveBeenCalledWith(3, 42, file);
  });

  it("rejects an oversized file client-side without calling the API", async () => {
    const addSpy = vi.spyOn(api, "addAttachmentToTicket");
    renderSection([]);

    const input = screen.getByLabelText(/add attachment/i) as HTMLInputElement;
    const tooBig = new File([new Uint8Array(6 * 1024 * 1024)], "huge.png", { type: "image/png" });
    await userEvent.upload(input, tooBig);

    expect(await screen.findByText(/exceeds the 5 mb limit/i)).toBeInTheDocument();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("is disabled with a tooltip once 5 active attachments exist (UI-14)", () => {
    const fiveActive = [1, 2, 3, 4, 5].map(makeActive);
    renderSection(fiveActive);

    const addButton = screen.getByRole("button", { name: /add attachment/i });
    expect(addButton).toBeDisabled();
    expect(addButton.closest("span")).toHaveAttribute("title", expect.stringMatching(/at most 5 active attachments/i));
  });

  it("stays enabled with fewer than 5 active attachments", () => {
    const fourActive = [1, 2, 3, 4].map(makeActive);
    renderSection(fourActive);
    expect(screen.getByRole("button", { name: /add attachment/i })).toBeEnabled();
  });
});
