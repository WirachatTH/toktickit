import { ReactNode, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "./Button.js";

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
          <Link to="/tickets" className="zg-shell-brand">
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

          <nav
            id="zg-shell-nav"
            className={"zg-shell-nav d-flex gap-3 align-items-center" + (mobileNavOpen ? " zg-shell-nav--open" : "")}
            aria-label="Primary"
          >
            <NavLink to="/tickets" className={navLinkClassName} end>
              My Tickets
            </NavLink>
            <NavLink to="/tickets/new" className={navLinkClassName}>
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
