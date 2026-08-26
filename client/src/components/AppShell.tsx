import { ReactNode, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "./Button.js";
import { ROUTES } from "../routes.js";

export interface AppShellProps {
  /** Name of the currently selected Development Requester, or null before one is chosen. */
  currentRequesterName?: string | null;
  onChangeRequester?: () => void;
  children: ReactNode;
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  "zg-nav-link" + (isActive ? " zg-nav-link--active" : "");

// TokTickIT identity, My Tickets / Create Ticket navigation, current
// Requester display, and responsive mobile nav — docs/lab-02/ui-spec.md §6.1.
// Presentational only: Issue 4 wires this to the real Requester context and
// mounts it as the app's actual shell.
export function AppShell({ currentRequesterName, onChangeRequester, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div>
      <header className="zg-shell-header">
        <div className="container d-flex align-items-center justify-content-between py-2 flex-wrap">
          <Link to={ROUTES.list} className="zg-shell-brand">
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
            <NavLink to={ROUTES.list} className={navLinkClassName} end>
              My Tickets
            </NavLink>
            <NavLink to={ROUTES.create} className={navLinkClassName}>
              Create Ticket
            </NavLink>

            {currentRequesterName && (
              <span className="zg-shell-requester ms-md-3">{currentRequesterName}</span>
            )}
            {onChangeRequester && (
              <Button variant="tertiary" onClick={onChangeRequester} className="zg-shell-requester">
                Change Requester
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="container py-4">{children}</main>
    </div>
  );
}
