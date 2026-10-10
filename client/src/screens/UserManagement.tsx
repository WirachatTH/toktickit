import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminUser, ApiError, createUser, fetchAdminUsers, Role, setInitialPassword, updateUser } from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { RoleBadge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { FormField } from "../components/FormField.js";
import { Modal } from "../components/Modal.js";
import { PasswordInput } from "../components/PasswordInput.js";
import { Select } from "../components/Select.js";
import { TextInput } from "../components/TextInput.js";
import { ErrorState } from "../components/ErrorState.js";
import { EmptyState } from "../components/EmptyState.js";
import { checkPasswordRules } from "../passwordRules.js";
import { ROUTES } from "../routes.js";

// Lab 3, Issue 9 — User Management (docs/lab-03/ui-spec.md §8, FR-31 to FR-36,
// BR-53 to BR-60). Deliberately simple (labsheet §8.5): one search, one role
// filter, no paging or sorting. The server enforces every rule; the disabled
// controls here only explain them (BR-27).

const SEARCH_DEBOUNCE_MS = 300;
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "REQUESTER", label: "Requester" },
  { value: "IT_STAFF", label: "IT Staff" },
  { value: "ADMINISTRATOR", label: "Administrator" },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SELF_REASON = "You can't change your own role or deactivate your own account.";

// A random password that meets BR-07: 16 characters with at least one letter
// and one digit, from the browser's cryptographic random source.
export function generatePassword(): string {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits + "-_.!@#";
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(letters), pick(digits), ...Array.from({ length: 14 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label="Active" className="zg-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="zg-switch__track" aria-hidden="true" />
      <span>{checked ? "Active" : "Inactive"}</span>
    </button>
  );
}

// An address that may wrap: preferably just before the "@", anywhere only if
// one half alone is still too wide.
function Email({ address }: { address: string }) {
  const at = address.lastIndexOf("@");
  if (at <= 0) return <>{address}</>;
  return (
    <>
      {address.slice(0, at)}
      <wbr />
      {address.slice(at)}
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`zg-pill ${active ? "zg-pill--active" : "zg-pill--inactive"}`}>
      <span aria-hidden="true">{active ? "✓" : "✗"}</span> <span>{active ? "Active" : "Inactive"}</span>
    </span>
  );
}

function PasswordRules({ password, email }: { password: string; email: string }) {
  const rules = checkPasswordRules(password, email, "").filter((r) => r.id !== "notCurrent");
  return (
    <ul className="zg-checklist mb-2" aria-label="Password rules">
      {rules.map((rule) => (
        <li key={rule.id} className={rule.met ? "zg-checklist--met" : "zg-checklist--unmet"}>
          <span aria-hidden="true">{rule.met ? "✓" : "✗"}</span> {rule.id === "notEmail" ? "Not the same as the user's email" : rule.label}
          <span className="zg-visually-hidden">{rule.met ? " (met)" : " (not met)"}</span>
        </li>
      ))}
    </ul>
  );
}
const rulesMet = (password: string, email: string) => checkPasswordRules(password, email, "").filter((r) => r.id !== "notCurrent").every((r) => r.met);

type Errors = Partial<Record<"name" | "email" | "role" | "isActive" | "initialPassword" | "form", string>>;

// LAST_ADMINISTRATOR goes beside the control that caused it: Active when the
// save deactivated the user, Role when only the role changed (PR #60 review).
function errorsFrom(error: unknown, lastAdminField: "isActive" | "role" = "isActive"): Errors {
  const err = error instanceof ApiError ? error : null;
  if (!err) return { form: "Something went wrong. Please try again." };
  if (err.code === "LAST_ADMINISTRATOR") return { [lastAdminField]: err.message };
  if (err.code === "OWNS_OPEN_TICKETS") return { role: err.message };
  if (err.code === "SELF_CHANGE_FORBIDDEN") return { role: err.message };
  if (err.fields) return err.fields as Errors;
  return { form: err.status < 500 ? err.message : "Something went wrong. Please try again." };
}

interface PanelProps {
  me: number;
  editing: AdminUser | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function UserPanel({ me, editing, onClose, onSaved }: PanelProps) {
  const isOwn = editing?.id === me;
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [role, setRole] = useState<Role>(editing?.role ?? "REQUESTER");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const titleId = editing ? "edit-user-title" : "create-user-title";
  // Save changes never sends the new initial password (only Set initial
  // password does), so it waits until that field is used or cleared (PR #60 review).
  const unsentPassword = Boolean(editing) && password.length > 0;
  const title = editing ? `Edit ${editing.name}` : "Create user";

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2 || name.trim().length > 100) e.name = "Enter a name of 2 to 100 characters.";
    if (!EMAIL.test(email.trim()) || email.trim().length > 254) e.email = "Enter a valid email address.";
    if (!editing && !rulesMet(password, email)) e.initialPassword = "The initial password doesn't meet the rules.";
    return e;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Lab 4, Issue 7 (BR-43): one request at a time, even for a submit that
    // does not come through the (disabled) button.
    if (busy || unsentPassword) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    const changes: Partial<Pick<AdminUser, "name" | "email" | "role" | "isActive">> = {};
    try {
      if (editing) {
        // Only what changed (UI-29); an empty edit just closes.
        if (name.trim() !== editing.name) changes.name = name.trim();
        if (email.trim().toLowerCase() !== editing.email) changes.email = email.trim();
        if (role !== editing.role) changes.role = role;
        if (isActive !== editing.isActive) changes.isActive = isActive;
        if (Object.keys(changes).length > 0) await updateUser(editing.id, changes);
        onSaved("Changes saved");
      } else {
        await createUser({ name: name.trim(), email: email.trim(), role, isActive, initialPassword: password });
        onSaved("User created");
      }
    } catch (error) {
      setErrors(errorsFrom(error, changes.isActive === undefined && changes.role !== undefined ? "role" : "isActive"));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!editing) return;
    setBusy(true);
    try {
      await setInitialPassword(editing.id, password);
      setConfirmReset(false);
      onSaved("Initial password set");
    } catch (error) {
      setConfirmReset(false);
      const e = errorsFrom(error);
      setErrors(e.initialPassword || e.form ? e : { initialPassword: Object.values(e)[0] });
    } finally {
      setBusy(false);
    }
  }

  const passwordField = (label: string) => (
    <>
      <FormField htmlFor="user-password" label={label} required={!editing} error={errors.initialPassword}>
        <PasswordInput autoComplete="new-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      <div className="d-flex align-items-start gap-2 flex-wrap mb-2">
        <Button variant="tertiary" type="button" onClick={() => setPassword(generatePassword())} disabled={busy}>Generate</Button>
      </div>
      <PasswordRules password={password} email={email} />
    </>
  );

  return (
    <Modal titleId={titleId} onClose={onClose} variant="panel">
      <form onSubmit={submit} noValidate className="d-flex flex-column flex-grow-1">
        <div className="d-flex justify-content-between align-items-start mb-3">
          <h2 id={titleId} className="h5 mb-0">{title}</h2>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>
        {errors.form && <div className="zg-banner zg-banner--error mb-3" role="alert">{errors.form}</div>}

        <FormField htmlFor="user-name" label="Full name" required error={errors.name}>
          <TextInput value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField htmlFor="user-email" label="Email" required error={errors.email}>
          <TextInput type="email" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField htmlFor="user-role" label="Role" required error={errors.role}>
          <Select value={role} disabled={busy || isOwn} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FormField>
        <div className="mb-3">
          <div className="zg-label">Status</div>
          <Switch checked={isActive} disabled={busy || isOwn} onChange={setIsActive} />
          {errors.isActive && <span className="zg-field-error d-block" role="alert">{errors.isActive}</span>}
        </div>
        {isOwn && <p className="small" style={{ color: "var(--zg-text-muted)" }}>{SELF_REASON}</p>}

        {!editing && (
          <>
            {passwordField("Initial password")}
            <p className="small" style={{ color: "var(--zg-text-muted)" }}>
              The user must change this password when they first sign in. Share it with them yourself — it is not emailed.
            </p>
          </>
        )}

        {editing && (
          <>
            <hr />
            <h3 className="h6">Set new initial password</h3>
            {isOwn ? (
              <p className="small">
                To change your own password, use <Link to={ROUTES.changePassword}>Change password</Link>.
              </p>
            ) : (
              <>
                {passwordField("New initial password")}
                <Button variant="secondary" type="button" disabled={busy || !rulesMet(password, email)} onClick={() => setConfirmReset(true)}>
                  Set initial password
                </Button>
                {unsentPassword && (
                  <p id="unsent-password-hint" className="small mt-2 mb-0" style={{ color: "var(--zg-text-muted)" }}>
                    Save changes doesn't send this password. Use Set initial password, or clear the field.
                  </p>
                )}
              </>
            )}
          </>
        )}

        <div className="zg-side-panel__footer d-flex gap-2 justify-content-end mt-4">
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" busy={busy} busyLabel={editing ? "Saving…" : "Creating…"} disabled={unsentPassword} aria-describedby={unsentPassword ? "unsent-password-hint" : undefined}>{editing ? "Save changes" : "Create user"}</Button>
        </div>
      </form>

      {confirmReset && editing && (
        <Modal titleId="reset-title" onClose={() => setConfirmReset(false)}>
          <h2 id="reset-title" className="h5">Set a new initial password?</h2>
          <p>{editing.name} will be signed out everywhere and must choose a new password at their next sign-in.</p>
          <div className="d-flex gap-2 justify-content-end flex-wrap">
            <Button variant="secondary" onClick={() => setConfirmReset(false)} disabled={busy}>Keep the current password</Button>
            <Button busy={busy} busyLabel="Setting…" onClick={() => void resetPassword()}>Set initial password</Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

type LoadState = "loading" | "loaded" | "failure";

export function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // Lab 4, Issue 6 — the role filter and the activation filter live in the URL,
  // so a dashboard user count opens exactly its users (ui-spec §7, D-13). The
  // activation filter shows as a removable chip, not as a second toolbar control.
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const role: Role | "" = ROLE_OPTIONS.some((o) => o.value === roleParam) ? (roleParam as Role) : "";
  const statusParam = searchParams.get("status");
  const activation: "active" | "inactive" | null = statusParam === "active" || statusParam === "inactive" ? statusParam : null;
  const writeUrl = (nextRole: Role | "", nextStatus: "active" | "inactive" | null) => {
    const next = new URLSearchParams();
    if (nextRole) next.set("role", nextRole);
    if (nextStatus) next.set("status", nextStatus);
    setSearchParams(next, { replace: true });
  };
  const setRole = (next: Role | "") => writeUrl(next, activation);
  const [reload, setReload] = useState(0);
  const [panel, setPanel] = useState<{ editing: AdminUser | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const params: { search?: string; role?: Role; status?: "active" | "inactive" } = {};
    if (search) params.search = search;
    if (role) params.role = role;
    if (activation) params.status = activation;
    fetchAdminUsers(params)
      .then((data) => {
        if (cancelled) return;
        setUsers(data);
        setState("loaded");
      })
      .catch(() => !cancelled && setState("failure"));
    return () => {
      cancelled = true;
    };
  }, [search, role, activation, reload]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!user) return null;
  const filtered = Boolean(search || role || activation);
  const clear = () => {
    setSearchInput("");
    setSearch("");
    writeUrl("", null);
  };
  const chipLabel = activation === "active" ? "Active only" : "Inactive only";
  const editButton = (u: AdminUser) => (
    <Button variant="tertiary" aria-label={`Edit ${u.name}`} onClick={() => setPanel({ editing: u })}>Edit</Button>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3 flex-wrap">
        <h1 className="h3 mb-0">User Management</h1>
        <Button onClick={() => setPanel({ editing: null })}>Create user</Button>
      </div>

      <div aria-live="polite">{toast && <div className="zg-banner zg-banner--info mb-3" role="status">{toast}</div>}</div>

      <div className="d-flex align-items-end gap-3 flex-wrap mb-4">
        <div style={{ minWidth: 260 }}>
          <label htmlFor="users-search" className="zg-label">Search</label>
          <TextInput id="users-search" placeholder="Search by name or email" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div>
          <label htmlFor="users-role" className="zg-label">Role</label>
          <Select id="users-role" value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        {activation && (
          <span className="zg-filter-chip">
            {chipLabel}
            <button type="button" className="zg-filter-chip__remove" aria-label={`Remove the ${chipLabel} filter`} onClick={() => writeUrl(role, null)}>
              <span aria-hidden="true">✕</span>
            </button>
          </span>
        )}
      </div>

      {state === "loading" && (
        <div aria-busy="true" role="status" aria-label="Loading users">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="zg-skeleton-row" />
          ))}
        </div>
      )}
      {state === "failure" && (
        <ErrorState message="Unable to load users. Please try again." action={<Button variant="secondary" onClick={() => setReload((r) => r + 1)}>Retry</Button>} />
      )}
      {state === "loaded" && users.length === 0 && (
        <EmptyState message={filtered ? "No users match your search." : "No users yet."} action={filtered ? <Button variant="tertiary" onClick={clear}>Clear</Button> : undefined} />
      )}
      {state === "loaded" && users.length > 0 && (
        <>
          <div className="d-none d-md-block table-responsive">
            <table className="table zg-ticket-table" data-testid="users-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="d-inline-flex align-items-center gap-1 flex-wrap">
                        <span>{u.name}</span>
                        {u.id === user.id && <span className="zg-pill zg-pill--you">You</span>}
                      </span>
                    </td>
                    <td className="zg-wrap-anywhere"><Email address={u.email} /></td>
                    <td><RoleBadge role={u.role} /></td>
                    <td><StatusPill active={u.isActive} /></td>
                    <td>{editButton(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-md-none" data-testid="users-cards">
            {users.map((u) => (
              <div key={u.id} className="zg-ticket-card">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <strong>{u.name}{u.id === user.id && <span className="zg-pill zg-pill--you ms-1">You</span>}</strong>
                  <RoleBadge role={u.role} />
                </div>
                <div className="zg-user-card__email zg-wrap-anywhere"><Email address={u.email} /></div>
                <div className="zg-ticket-card__meta">
                  <StatusPill active={u.isActive} />
                  {editButton(u)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {panel && (
        <UserPanel
          key={panel.editing?.id ?? "new"}
          me={user.id}
          editing={panel.editing}
          onClose={() => setPanel(null)}
          onSaved={(message) => {
            setPanel(null);
            setToast(message);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
