import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { ChangePassword } from "../../src/screens/ChangePassword.js";
import { REQUESTER, renderAt } from "./authTestUtils.js";

// UI-06 to UI-08 — Change Password (docs/lab-03/ui-spec.md §4).

const FORCED = { ...REQUESTER, mustChangePassword: true };

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAs(user: api.AuthUser | null) {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
  return renderAt("/change-password", [{ path: "/change-password", element: <ChangePassword /> }]);
}

const field = (label: RegExp) => screen.getByLabelText(label);
const save = () => screen.getByRole("button", { name: /save password/i });
const rule = (id: string) => document.querySelector(`[data-rule="${id}"]`)!;

async function fill(current: string, next: string, confirm: string) {
  if (current) await userEvent.type(field(/^current password/i), current);
  if (next) await userEvent.type(field(/^new password/i), next);
  if (confirm) await userEvent.type(field(/^confirm new password/i), confirm);
}

describe("UI-06 forced mode", () => {
  it("offers no way out but Log out, and continues to the role's home after a valid change", async () => {
    const spy = vi.spyOn(api, "changePassword").mockResolvedValue({ ...REQUESTER, mustChangePassword: false });
    renderAs(FORCED);
    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(screen.getByText("You must set a new password before you can continue.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();

    await fill("Initial-pass-1", "Brand-new-pass-2", "Brand-new-pass-2");
    await userEvent.click(save());
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/tickets"));
    expect(spy).toHaveBeenCalledWith("Initial-pass-1", "Brand-new-pass-2");
  });

  it("voluntary mode has Cancel instead of Log out", async () => {
    renderAs(REQUESTER);
    expect(await screen.findByRole("heading", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor to Login", async () => {
    renderAs(null);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
  });
});

describe("UI-07 the live rules checklist", () => {
  it("flips each rule as the user types, and enables Save only when every rule passes and Confirm matches", async () => {
    renderAs(FORCED);
    await screen.findByRole("heading", { name: "Set a new password" });
    const list = screen.getByRole("list", { name: "Password rules" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(save()).toBeDisabled();

    await userEvent.type(field(/^current password/i), "Initial-pass-1");
    await userEvent.type(field(/^new password/i), "abc");
    expect(rule("letter")).toHaveClass("zg-checklist--met");
    expect(rule("number")).toHaveClass("zg-checklist--unmet");
    expect(rule("length")).toHaveClass("zg-checklist--unmet");
    expect(rule("length")).toHaveTextContent("(not met)");

    // Current password filled and Confirm matching, but the rules are not met:
    // Save must still be disabled — the rules alone decide this.
    await userEvent.type(field(/^confirm new password/i), "abc");
    expect(screen.queryByText("Passwords don't match.")).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    await userEvent.clear(field(/^confirm new password/i));

    await userEvent.type(field(/^new password/i), "defghij9");
    for (const id of ["length", "letter", "number", "notEmail", "notCurrent"]) expect(rule(id)).toHaveClass("zg-checklist--met");
    expect(save()).toBeDisabled(); // Confirm still empty

    await userEvent.type(field(/^confirm new password/i), "abcdefghij8");
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(save()).toBeDisabled();

    await userEvent.clear(field(/^confirm new password/i));
    await userEvent.type(field(/^confirm new password/i), "abcdefghij9");
    expect(screen.queryByText("Passwords don't match.")).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it("marks the email and current-password rules unmet when the new password reuses them", async () => {
    renderAs(FORCED);
    await screen.findByRole("heading", { name: "Set a new password" });
    await userEvent.type(field(/^current password/i), "Initial-pass-1");
    await userEvent.type(field(/^new password/i), "Initial-pass-1");
    expect(rule("notCurrent")).toHaveClass("zg-checklist--unmet");
    await userEvent.clear(field(/^new password/i));
    await userEvent.type(field(/^new password/i), REQUESTER.email.toUpperCase() + "1");
    await userEvent.clear(field(/^new password/i));
    await userEvent.type(field(/^new password/i), REQUESTER.email);
    expect(rule("notEmail")).toHaveClass("zg-checklist--unmet");
  });
});

describe("UI-08 server rejections", () => {
  it("shows a wrong current password below that field and keeps what was typed", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "x", { currentPassword: "Your current password is incorrect." }),
    );
    renderAs(FORCED);
    await screen.findByRole("heading", { name: "Set a new password" });
    await fill("Wrong-pass-1", "Brand-new-pass-2", "Brand-new-pass-2");
    await userEvent.click(save());

    expect(await screen.findByText("Your current password is incorrect.")).toBeInTheDocument();
    expect(field(/^current password/i)).toHaveAttribute("aria-invalid", "true");
    expect(field(/^new password/i)).toHaveValue("Brand-new-pass-2");
    expect(screen.getByTestId("location")).toHaveTextContent("/change-password");
  });

  it("shows a server rule rejection below New password", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "x", { newPassword: "Choose a password different from your current one." }),
    );
    renderAs(FORCED);
    await screen.findByRole("heading", { name: "Set a new password" });
    await fill("Initial-pass-1", "Brand-new-pass-2", "Brand-new-pass-2");
    await userEvent.click(save());
    expect(await screen.findByText("Choose a password different from your current one.")).toBeInTheDocument();
    expect(field(/^new password/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a safe banner on an unexpected failure, keeping the input", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(new TypeError("network down"));
    renderAs(FORCED);
    await screen.findByRole("heading", { name: "Set a new password" });
    await fill("Initial-pass-1", "Brand-new-pass-2", "Brand-new-pass-2");
    await userEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(field(/^confirm new password/i)).toHaveValue("Brand-new-pass-2");
  });
});
