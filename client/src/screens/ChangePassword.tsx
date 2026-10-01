import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError, changePassword } from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { homeFor, ROUTES } from "../routes.js";
import { checkPasswordRules } from "../passwordRules.js";
import { Button } from "../components/Button.js";
import { FormField } from "../components/FormField.js";
import { PasswordInput } from "../components/PasswordInput.js";

// Lab 3, Issue 3 — Change Password (ui-spec.md §4, FR-04).
//
// Forced mode (the account still has an initial password, BR-02): there is no
// way into the rest of the app except through this form, and no Cancel — only
// Log out. Voluntary mode: the same form with a Cancel.

type Fields = { currentPassword?: string; newPassword?: string; confirmPassword?: string };

export function ChangePassword() {
  const { user, status, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Fields>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "loading") return null;
  if (!user) return <Navigate to={ROUTES.login} replace />;

  const forced = user.mustChangePassword;
  const rules = checkPasswordRules(newPassword, user.email, currentPassword);
  const allRulesMet = rules.every((r) => r.met);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSave = currentPassword.length > 0 && allRulesMet && confirmPassword === newPassword && !busy;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setErrors({});
    setFailure(null);
    try {
      const updated = await changePassword(currentPassword, newPassword);
      setUser(updated);
      navigate(homeFor(updated.role), { replace: true, state: { toast: "Password updated." } });
    } catch (error) {
      const err = error instanceof ApiError ? error : null;
      if (err?.code === "VALIDATION_ERROR" && err.fields) {
        setErrors({ currentPassword: err.fields.currentPassword, newPassword: err.fields.newPassword });
      } else if (err?.status === 401) {
        setUser(null);
        navigate(ROUTES.login, { replace: true, state: { sessionEnded: true } });
      } else {
        setFailure("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogOut() {
    await signOut();
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <main className="container py-5" style={{ maxWidth: 480 }}>
      <div className="zg-card p-4">
        <h1 className="h3 mb-2">{forced ? "Set a new password" : "Change password"}</h1>
        {forced && <p style={{ color: "var(--zg-text-muted)" }}>You must set a new password before you can continue.</p>}

        <div aria-live="polite">
          {failure && (
            <div className="zg-banner zg-banner--error mb-3" role="alert">
              <span aria-hidden="true">⚠ </span>
              {failure}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <FormField htmlFor="current-password" label="Current password" required error={errors.currentPassword}>
            <PasswordInput
              autoComplete="current-password"
              aria-required="true"
              value={currentPassword}
              disabled={busy}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </FormField>

          <FormField htmlFor="new-password" label="New password" required error={errors.newPassword}>
            <PasswordInput
              autoComplete="new-password"
              aria-required="true"
              aria-describedby="password-rules"
              value={newPassword}
              disabled={busy}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>
          <ul id="password-rules" className="zg-checklist mb-3" aria-live="polite" aria-label="Password rules">
            {rules.map((rule) => (
              <li key={rule.id} className={rule.met ? "zg-checklist--met" : "zg-checklist--unmet"} data-rule={rule.id}>
                <span aria-hidden="true">{rule.met ? "✓" : "✗"}</span> {rule.label}
                <span className="zg-visually-hidden">{rule.met ? " (met)" : " (not met)"}</span>
              </li>
            ))}
          </ul>

          <FormField
            htmlFor="confirm-password"
            label="Confirm new password"
            required
            error={mismatch ? "Passwords don't match." : errors.confirmPassword}
          >
            <PasswordInput
              autoComplete="new-password"
              aria-required="true"
              value={confirmPassword}
              disabled={busy}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormField>

          <div className="d-flex gap-2 flex-wrap">
            <Button type="submit" busy={busy} busyLabel="Saving…" disabled={!canSave}>
              Save password
            </Button>
            {forced ? (
              <Button variant="tertiary" onClick={handleLogOut} disabled={busy}>
                Log out
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate(-1)} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
