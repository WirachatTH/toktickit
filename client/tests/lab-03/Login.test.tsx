import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { Login } from "../../src/screens/Login.js";
import { REQUESTER, renderAt } from "./authTestUtils.js";

// UI-01 to UI-05 — the Login screen (docs/lab-03/ui-spec.md §3).

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(null);
});

const renderLogin = () => renderAt("/login", [{ path: "/login", element: <Login /> }]);

async function signIn(email: string, password: string) {
  await userEvent.type(screen.getByLabelText(/^email/i), email);
  await userEvent.type(screen.getByLabelText(/^password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("UI-01 a successful sign-in", () => {
  it.each([
    ["REQUESTER", false, "/tickets"],
    ["IT_STAFF", false, "/staff/queue"],
    ["ADMINISTRATOR", false, "/admin/users"],
    ["IT_STAFF", true, "/change-password"],
  ] as const)("for a %s (must change: %s) calls login once and lands on %s", async (role, mustChangePassword, expected) => {
    const spy = vi.spyOn(api, "login").mockResolvedValue({ ...REQUESTER, role, mustChangePassword });
    renderLogin();
    await signIn("  Somchai.Prasert@kmutt.ac.th ", "Correct-horse-42");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(expected));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("Somchai.Prasert@kmutt.ac.th", "Correct-horse-42");
  });
});

describe("UI-02 to UI-04 failures, each with its own message", () => {
  it("UI-02 a 401 shows the generic message, clears the password, keeps the email, and focuses the password", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."));
    renderLogin();
    await signIn("somchai.prasert@kmutt.ac.th", "Wrong-horse-42");

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(screen.getByLabelText(/^password/i)).toHaveValue("");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("somchai.prasert@kmutt.ac.th");
    await waitFor(() => expect(screen.getByLabelText(/^password/i)).toHaveFocus());
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("UI-03 a 403 ACCOUNT_INACTIVE shows the inactive-account message, distinct from the generic one", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError(403, "ACCOUNT_INACTIVE", "inactive"));
    renderLogin();
    await signIn("ananya.ruangrit@kmutt.ac.th", "Correct-horse-42");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This account is inactive. Contact your IT administrator.");
    expect(alert).not.toHaveTextContent(/incorrect/i);
  });

  it("UI-04 a 429 names the wait from Retry-After", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError(429, "TOO_MANY_ATTEMPTS", "x", undefined, 600));
    renderLogin();
    await signIn("somchai.prasert@kmutt.ac.th", "Wrong-horse-42");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-in attempts. Try again in 10 minutes.");
  });

  it("shows a safe message, never raw detail, when the request fails unexpectedly", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new TypeError("Failed to fetch at http://internal:3000"));
    renderLogin();
    await signIn("somchai.prasert@kmutt.ac.th", "Correct-horse-42");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong. Please try again.");
    expect(alert).not.toHaveTextContent(/internal|fetch/i);
  });
});

describe("UI-05 validation and duplicate submission", () => {
  it("shows a message below each empty field and sends nothing", async () => {
    const spy = vi.spyOn(api, "login");
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute("aria-invalid", "true");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends exactly one request however fast Sign in is clicked, and shows the busy state", async () => {
    let finish!: (user: api.AuthUser) => void;
    const spy = vi.spyOn(api, "login").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderLogin();
    await userEvent.type(screen.getByLabelText(/^email/i), "somchai.prasert@kmutt.ac.th");
    await userEvent.type(screen.getByLabelText(/^password/i), "Correct-horse-42");
    const button = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.dblClick(button);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    expect(screen.getByLabelText(/^email/i)).toBeDisabled();
    finish(REQUESTER);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/tickets"));
  });

  it("lets the password be shown and hidden with an accessible toggle", async () => {
    renderLogin();
    const field = screen.getByLabelText(/^password/i);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(field).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers no password-reset link — only help text (D-16)", () => {
    renderLogin();
    expect(screen.getByText("Forgot your password? Contact your IT administrator.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /forgot/i })).not.toBeInTheDocument();
  });
});
