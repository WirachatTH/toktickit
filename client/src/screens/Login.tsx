import { FormEvent, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, login } from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { canOpen, homeFor, ROUTES } from "../routes.js";
import type { FromState } from "../components/RequireAuth.js";
import { Button } from "../components/Button.js";
import { FormField } from "../components/FormField.js";
import { TextInput } from "../components/TextInput.js";
import { PasswordInput } from "../components/PasswordInput.js";

// Lab 3, Issue 3 — the Login screen (ui-spec.md §3, FR-01).
//
// Every failure the server can give has its own wording, but none of them
// reveals more than the server chose to say: an unknown email and a wrong
// password look identical (BR-12), and "inactive" only ever follows a correct
// password (BR-13).

type Banner = { kind: "error" | "info"; text: string } | null;

export function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as FromState | null;
  const sessionEnded = state?.sessionEnded === true;
  // Issue 4 — where a guard sent the visitor from, to return there after sign-in.
  const from = state?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [banner, setBanner] = useState<Banner>(
    sessionEnded ? { kind: "info", text: "Your session has ended. Please sign in again." } : null,
  );
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return; // one request per submission, however fast the clicks
    const next: typeof errors = {};
    if (email.trim() === "") next.email = "Enter your email address.";
    if (password === "") next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setBanner(null);
    try {
      const user = await login(email.trim(), password);
      setUser(user);
      // ui-spec §2: back to the route they asked for if their role may open it,
      // otherwise their home. A pending password change comes first (BR-02).
      const destination = user.mustChangePassword
        ? ROUTES.changePassword
        : from && canOpen(user.role, from.pathname)
          ? from.pathname + from.search
          : homeFor(user.role);
      navigate(destination, { replace: true });
    } catch (error) {
      const err = error instanceof ApiError ? error : null;
      if (err?.code === "INVALID_CREDENTIALS") {
        setBanner({ kind: "error", text: "Email or password is incorrect." });
        setPassword("");
        requestAnimationFrame(() => passwordRef.current?.focus());
      } else if (err?.code === "ACCOUNT_INACTIVE") {
        setBanner({ kind: "error", text: "This account is inactive. Contact your IT administrator." });
      } else if (err?.code === "TOO_MANY_ATTEMPTS") {
        const minutes = Math.max(1, Math.ceil((err.retryAfterSeconds ?? 15 * 60) / 60));
        setBanner({ kind: "error", text: `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` });
      } else if (err?.code === "VALIDATION_ERROR" && err.fields) {
        setErrors({ email: err.fields.email, password: err.fields.password });
      } else {
        setBanner({ kind: "error", text: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: 420 }}>
      <div className="zg-card p-4">
        <p className="zg-shell-brand mb-2" style={{ color: "var(--zg-primary)" }}>
          TokTickIT
        </p>
        <h1 className="h3 mb-4">Sign in</h1>

        <div aria-live="polite">
          {banner && (
            <div className={`zg-banner zg-banner--${banner.kind} mb-3`} role={banner.kind === "error" ? "alert" : "status"}>
              <span aria-hidden="true">{banner.kind === "error" ? "⚠ " : "ℹ "}</span>
              {banner.text}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <FormField htmlFor="login-email" label="Email" required error={errors.email}>
            <TextInput
              type="email"
              autoComplete="username"
              aria-required="true"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="login-password" label="Password" required error={errors.password}>
            <PasswordInput
              ref={passwordRef}
              autoComplete="current-password"
              aria-required="true"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <Button type="submit" className="w-100" busy={busy} busyLabel="Signing in…">
            Sign in
          </Button>
        </form>

        <p className="mt-3 mb-0" style={{ color: "var(--zg-text-muted)", fontSize: "0.8125rem" }}>
          Forgot your password? Contact your IT administrator.
        </p>
      </div>
    </main>
  );
}
