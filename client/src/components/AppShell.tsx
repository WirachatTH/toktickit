import { ReactNode, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./Button.js";
import { RoleBadge } from "./Badge.js";
import { useAuth } from "../context/AuthContext.js";
import { homeFor, NAV_BY_ROLE, ROUTES } from "../routes.js";
import type { FromState } from "./RequireAuth.js";

export interface AppShellProps {
  /** Lab 2: name of the selected Development Requester, shown only when nobody is signed in. */
  currentRequesterName?: string | null;
  /** Lab 2: the Change Requester action, shown only when nobody is signed in. */
  onChangeRequester?: () => void;
  children: ReactNode;
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  "zg-nav-link" + (isActive ? " zg-nav-link--active" : "");

// TokTickIT identity, navigation, the current user, and responsive mobile nav
// — docs/lab-02/ui-spec.md §6.1, extended by docs/lab-03/ui-spec.md §2.
//
// Lab 3, Issue 4: for a signed-in user the shell shows exactly the
// destinations of their role, their name and role badge, Change password and
// Log out, and the forbidden callout when a guard sent them home. With nobody
// signed in it renders as in Lab 2 (the Development Requester display), which
// is what the Lab 2 component tests still exercise until Issue 5 retires it.
export function AppShell({ currentRequesterName, onChangeRequester, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const forbidden = (location.state as FromState | null)?.forbidden === true;
  const [calloutDismissed, setCalloutDismissed] = useState(false);
  const showCallout = forbidden && !calloutDismissed;

  const destinations = NAV_BY_ROLE[user?.role ?? "REQUESTER"];

  async function handleLogOut() {
    await signOut();
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <div>
      <header className="zg-shell-header">
        <div className="container d-flex align-items-center justify-content-between py-2 flex-wrap">
          <Link to={user ? homeFor(user.role) : ROUTES.list} className="zg-shell-brand">
            TokTickIT
          </Link>

          <button
            type="button"
            className="btn zg-shell-toggle d-md-none"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileNavOpen}
            aria-controls="zg-shell-nav"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            Menu
          </button>

          {/* Plain "zg-shell-nav" only — no Bootstrap d-flex/gap-3 utility
              classes here. Those compile to `display: flex !important`,
              which silently beat the mobile media query's `display: none`
              below and left the nav visibly open before the toggle was ever
              clicked (caught by a real-browser check; jsdom doesn't apply
              CSS at all, so the component-level tests couldn't see it). */}
          <nav
            id="zg-shell-nav"
            className={"zg-shell-nav" + (mobileNavOpen ? " zg-shell-nav--open" : "")}
            aria-label="Primary"
          >
            {destinations.map(({ label, to }) => (
              <NavLink key={to} to={to} className={navLinkClassName} end>
                {label}
              </NavLink>
            ))}

            {user ? (
              <div className="zg-shell-account" role="group" aria-label="Account">
                <span className="zg-shell-account-name">{user.name}</span>
                <RoleBadge role={user.role} />
                <Link to={ROUTES.changePassword} className="zg-nav-link">
                  Change password
                </Link>
                <Button variant="tertiary" onClick={handleLogOut}>
                  Log out
                </Button>
              </div>
            ) : (
              <>
                {currentRequesterName && (
                  <span className="zg-shell-requester ms-md-3">{currentRequesterName}</span>
                )}
                {onChangeRequester && (
                  <Button variant="tertiary" onClick={onChangeRequester} className="zg-shell-requester">
                    Change Requester
                  </Button>
                )}
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container py-4">
        {showCallout && (
          <div className="zg-banner zg-banner--warning mb-3 d-flex justify-content-between align-items-center" role="alert">
            <span>
              <span aria-hidden="true">⚠ </span>
              You don't have access to that page.
            </span>
            <button type="button" className="zg-banner-dismiss" onClick={() => setCalloutDismissed(true)}>
              Dismiss
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
