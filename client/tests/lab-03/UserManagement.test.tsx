import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import type { AdminUser } from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { checkPasswordRules } from "../../src/passwordRules.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// UI-26 to UI-31 — User Management (docs/lab-03/ui-spec.md §8). The real route
// table, shell, and screen; only the network is mocked.

const ME: api.AuthUser = { id: 1, name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false };
const user = (id: number, name: string, role: api.Role, isActive = true): AdminUser => ({
  id,
  name,
  email: `${name.toLowerCase().replace(/ /g, ".")}@kmutt.ac.th`,
  role,
  isActive,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: "2026-10-01T08:00:00.000Z",
});
const USERS = [
  user(5, "Chanon Rattanakorn", "IT_STAFF"),
  user(1, "Siriporn Boonmee", "ADMINISTRATOR"),
  user(7, "Somchai Prasert", "REQUESTER"),
  user(9, "Suda Kaewmanee", "IT_STAFF", false),
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(ME);
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue(USERS);
});

function renderScreen() {
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/admin/users"]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}
const table = () => screen.getByTestId("users-table");
const rowOf = (name: string) => within(table()).getByText(name).closest("tr")!;
const lastParams = () => vi.mocked(api.fetchAdminUsers).mock.calls.at(-1)![0];

describe("UI-26 the user list (FR-31, FR-32, ui-spec §8.1)", () => {
  it("shows name, email, role badge, status, and an Edit button per user, with a You pill on the caller", async () => {
    renderScreen();
    expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
    await within(await screen.findByTestId("users-table")).findByText("Chanon Rattanakorn");
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Email", "Role", "Status", "Actions"]);
    expect(within(rowOf("Siriporn Boonmee")).getByText("You")).toBeInTheDocument();
    expect(within(rowOf("Chanon Rattanakorn")).queryByText("You")).toBeNull();
    expect(within(rowOf("Chanon Rattanakorn")).getByText("IT Staff")).toHaveClass("zg-badge--role-it-staff");
    expect(within(rowOf("Suda Kaewmanee")).getByText("Inactive")).toBeInTheDocument();
    expect(within(rowOf("Somchai Prasert")).getByText("Active")).toBeInTheDocument();
    expect(within(rowOf("Somchai Prasert")).getByRole("button", { name: "Edit Somchai Prasert" })).toBeInTheDocument();
    expect(screen.getByTestId("users-cards")).toBeInTheDocument();
  });

  it("sends the search (debounced and trimmed) and the role filter as parameters", async () => {
    renderScreen();
    await screen.findByTestId("users-table");
    expect(lastParams()).toEqual({});
    await userEvent.type(screen.getAllByLabelText("Search")[0], "  chanon ");
    await waitFor(() => expect(lastParams()).toEqual({ search: "chanon" }));
    await userEvent.selectOptions(screen.getAllByLabelText("Role")[0], "IT_STAFF");
    await waitFor(() => expect(lastParams()).toEqual({ search: "chanon", role: "IT_STAFF" }));
  });

  it("says no users match, with Clear, and shows a failure with Retry", async () => {
    vi.mocked(api.fetchAdminUsers).mockResolvedValueOnce(USERS).mockResolvedValueOnce([]);
    renderScreen();
    await screen.findByTestId("users-table");
    await userEvent.type(screen.getAllByLabelText("Search")[0], "nobody");
    expect(await screen.findByText("No users match your search.")).toBeInTheDocument();
    vi.mocked(api.fetchAdminUsers).mockRejectedValueOnce(new Error("down"));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Unable to load users. Please try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await within(await screen.findByTestId("users-table")).findByText("Chanon Rattanakorn");
  });
});

async function openCreate() {
  renderScreen();
  await screen.findByTestId("users-table");
  await userEvent.click(screen.getByRole("button", { name: "Create user" }));
  return screen.findByRole("dialog", { name: "Create user" });
}

describe("UI-27 the Create user panel (FR-33, ui-spec §8.2)", () => {
  it("validates each field, generates a password that meets every rule, and on success closes and lists the user", async () => {
    const created = user(20, "Napat Wongsa", "IT_STAFF");
    const create = vi.spyOn(api, "createUser").mockResolvedValue(created);
    const panel = await openCreate();
    expect(within(panel).getByText(/Share it with them yourself — it is not emailed/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Create user" }));
    expect(create).not.toHaveBeenCalled();
    expect(within(panel).getByText("Enter a name of 2 to 100 characters.")).toBeInTheDocument();
    expect(within(panel).getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(within(panel).getByText("The initial password doesn't meet the rules.")).toBeInTheDocument();

    await userEvent.type(within(panel).getByLabelText(/^Full name/), "Napat Wongsa");
    await userEvent.type(within(panel).getByLabelText(/^Email/), "napat.wongsa@kmutt.ac.th");
    await userEvent.selectOptions(within(panel).getByLabelText(/^Role/), "IT_STAFF");
    await userEvent.click(within(panel).getByRole("button", { name: "Generate" }));
    const generated = (within(panel).getByLabelText(/^Initial password/) as HTMLInputElement).value;
    expect(checkPasswordRules(generated, "napat.wongsa@kmutt.ac.th", "").filter((r) => r.id !== "notCurrent").every((r) => r.met)).toBe(true);
    expect(within(panel).getByRole("switch", { name: "Active" })).toHaveAttribute("aria-checked", "true");

    vi.mocked(api.fetchAdminUsers).mockResolvedValue([...USERS, created]);
    await userEvent.click(within(panel).getByRole("button", { name: "Create user" }));
    expect(create).toHaveBeenCalledWith({ name: "Napat Wongsa", email: "napat.wongsa@kmutt.ac.th", role: "IT_STAFF", isActive: true, initialPassword: generated });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("User created")).toBeInTheDocument();
    expect(await within(table()).findByText("Napat Wongsa")).toBeInTheDocument();
  });

  it("generates a different password each time", async () => {
    const panel = await openCreate();
    await userEvent.type(within(panel).getByLabelText(/^Email/), "x@kmutt.ac.th");
    await userEvent.click(within(panel).getByRole("button", { name: "Generate" }));
    const first = (within(panel).getByLabelText(/^Initial password/) as HTMLInputElement).value;
    await userEvent.click(within(panel).getByRole("button", { name: "Generate" }));
    expect((within(panel).getByLabelText(/^Initial password/) as HTMLInputElement).value).not.toBe(first);
  });
});

describe("UI-28 a duplicate email (AC-36)", () => {
  it("shows 409 EMAIL_TAKEN below Email and keeps the panel open with the input", async () => {
    vi.spyOn(api, "createUser").mockRejectedValue(new api.ApiError(409, "EMAIL_TAKEN", "x", { email: "Another user already has this email." }));
    const panel = await openCreate();
    await userEvent.type(within(panel).getByLabelText(/^Full name/), "Dup Licate");
    await userEvent.type(within(panel).getByLabelText(/^Email/), "chanon.rattanakorn@kmutt.ac.th");
    await userEvent.type(within(panel).getByLabelText(/^Initial password/), "Initial-pass-2026");
    await userEvent.click(within(panel).getByRole("button", { name: "Create user" }));
    expect(await within(panel).findByText("Another user already has this email.")).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^Email/)).toHaveAttribute("aria-invalid", "true");
    expect(within(panel).getByLabelText(/^Full name/)).toHaveValue("Dup Licate");
    expect(screen.getByRole("dialog", { name: "Create user" })).toBeInTheDocument();
  });
});

async function openEdit(name: string) {
  renderScreen();
  await within(await screen.findByTestId("users-table")).findByText(name);
  await userEvent.click(within(rowOf(name)).getByRole("button", { name: `Edit ${name}` }));
  return screen.findByRole("dialog", { name: `Edit ${name}` });
}

describe("UI-29 editing and setting an initial password (AC-37, AC-38)", () => {
  it("sends only the fields that changed", async () => {
    const update = vi.spyOn(api, "updateUser").mockResolvedValue({ ...USERS[0], role: "ADMINISTRATOR" });
    const panel = await openEdit("Chanon Rattanakorn");
    expect(within(panel).getByLabelText(/^Full name/)).toHaveValue("Chanon Rattanakorn");
    await userEvent.selectOptions(within(panel).getByLabelText(/^Role/), "ADMINISTRATOR");
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    expect(update).toHaveBeenCalledWith(5, { role: "ADMINISTRATOR" });
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("asks for confirmation before setting an initial password, then sets it", async () => {
    const setPw = vi.spyOn(api, "setInitialPassword").mockResolvedValue({ ...USERS[2], mustChangePassword: true });
    const panel = await openEdit("Somchai Prasert");
    await userEvent.type(within(panel).getByLabelText(/^New initial password/), "Reset-pass-2026");
    await userEvent.click(within(panel).getByRole("button", { name: "Set initial password" }));
    expect(setPw).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("dialog", { name: "Set a new initial password?" });
    expect(within(confirm).getByText("Somchai Prasert will be signed out everywhere and must choose a new password at their next sign-in.")).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Set initial password" }));
    expect(setPw).toHaveBeenCalledWith(7, "Reset-pass-2026");
    expect(await screen.findByText("Initial password set")).toBeInTheDocument();
  });
});

describe("UI-30 one's own account (AC-39, BR-57)", () => {
  it("disables Role and Active with the reason, and links to Change password instead of setting an initial password", async () => {
    const panel = await openEdit("Siriporn Boonmee");
    expect(within(panel).getByLabelText(/^Role/)).toBeDisabled();
    expect(within(panel).getByRole("switch", { name: "Active" })).toBeDisabled();
    expect(within(panel).getByText("You can't change your own role or deactivate your own account.")).toBeInTheDocument();
    expect(within(panel).queryByLabelText(/^New initial password/)).toBeNull();
    expect(within(panel).getByRole("link", { name: /change password/i })).toHaveAttribute("href", "/change-password");
    expect(within(panel).getByLabelText(/^Full name/)).toBeEnabled();
  });
});

describe("UI-31 server safety refusals (AC-40, BR-58, BR-60)", () => {
  it("shows LAST_ADMINISTRATOR below Active and OWNS_OPEN_TICKETS below Role, saving nothing and keeping the input", async () => {
    const update = vi
      .spyOn(api, "updateUser")
      .mockRejectedValueOnce(new api.ApiError(409, "LAST_ADMINISTRATOR", "TokTickIT must keep at least one active Administrator."))
      .mockRejectedValueOnce(new api.ApiError(409, "OWNS_OPEN_TICKETS", "Reassign this user's open tickets before making them a Requester."));
    const panel = await openEdit("Chanon Rattanakorn");
    await userEvent.click(within(panel).getByRole("switch", { name: "Active" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    const activeBlock = within(panel).getByRole("switch", { name: "Active" }).closest(".mb-3")!;
    expect(await within(activeBlock as HTMLElement).findByText("TokTickIT must keep at least one active Administrator.")).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("switch", { name: "Active" }));
    await userEvent.selectOptions(within(panel).getByLabelText(/^Role/), "REQUESTER");
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    const roleBlock = within(panel).getByLabelText(/^Role/).closest(".mb-3")!;
    expect(await within(roleBlock as HTMLElement).findByText("Reassign this user's open tickets before making them a Requester.")).toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog", { name: "Edit Chanon Rattanakorn" })).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^Role/)).toHaveValue("REQUESTER");
  });
});

// Issue 10 — RESP-06 at component level (ui-spec §1.8, §10): the side panel and
// the dialog inside it trap focus, close on Escape one layer at a time, and give
// focus back to the control that opened them.
describe("RESP-06 side panel focus and Escape (ui-spec §1.8, §10)", () => {
  it("returns focus to Create user when the Create panel closes with Escape or Close", async () => {
    renderScreen();
    const create = await screen.findByRole("button", { name: "Create user" });
    await userEvent.click(create);
    const panel = await screen.findByRole("dialog", { name: "Create user" });
    expect(panel).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(create).toHaveFocus();

    await userEvent.click(create);
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Create user" })).getByRole("button", { name: "Close" }));
    expect(create).toHaveFocus();
  });

  it("returns focus to the row's Edit button when the Edit panel is cancelled", async () => {
    renderScreen();
    await screen.findByTestId("users-table");
    const edit = within(rowOf("Chanon Rattanakorn")).getByRole("button", { name: "Edit Chanon Rattanakorn" });
    await userEvent.click(edit);
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Edit Chanon Rattanakorn" })).getByRole("button", { name: "Cancel" }));
    expect(edit).toHaveFocus();
  });

  it("keeps Tab inside the panel", async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Create user" }));
    const panel = await screen.findByRole("dialog", { name: "Create user" });
    for (let i = 0; i < 25; i++) {
      await userEvent.tab();
      expect(panel).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("Escape in the confirmation closes only the confirmation, and focus goes back to its button", async () => {
    renderScreen();
    await screen.findByTestId("users-table");
    await userEvent.click(within(rowOf("Somchai Prasert")).getByRole("button", { name: "Edit Somchai Prasert" }));
    const panel = await screen.findByRole("dialog", { name: "Edit Somchai Prasert" });
    await userEvent.type(within(panel).getByLabelText(/^New initial password/), "Reset-pass-2026");
    const setButton = within(panel).getByRole("button", { name: "Set initial password" });
    await userEvent.click(setButton);
    await screen.findByRole("dialog", { name: "Set a new initial password?" });

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set a new initial password?" })).not.toBeInTheDocument());
    // The panel is still open, with what was typed, and focus is back on its button.
    expect(screen.getByRole("dialog", { name: "Edit Somchai Prasert" })).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^New initial password/)).toHaveValue("Reset-pass-2026");
    expect(setButton).toHaveFocus();
  });
});
