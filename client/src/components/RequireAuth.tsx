import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Role } from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { homeFor, ROUTES } from "../routes.js";
import { LoadingSpinner } from "./LoadingSpinner.js";

// Lab 3, Issue 4 — the route guard for every protected screen (ui-spec.md §2).
//
// - While /api/auth/me is still loading, a spinner stands in for the whole
//   screen, so no navigation flashes for the wrong role.
// - Signed out: to Login, remembering where the visitor was going, and whether
//   it is because the server ended their session (AC-08).
// - Signed in with a role that may not open this screen: to that role's home,
//   which shows the forbidden callout (AC-15).
//
// This only decides what to render. Every request the screen makes is checked
// again by the server, which is the actual boundary (BR-27).

export interface FromState {
  from?: { pathname: string; search: string };
  sessionEnded?: boolean;
  forbidden?: boolean;
}

export function RequireAuth({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user, status, sessionEnded, signedOut } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="d-flex justify-content-center py-5">
        <LoadingSpinner />
      </div>
    );
  }
  if (!user) {
    // After an explicit Log out there is nowhere to return to: the next person
    // to sign in starts at their own home, not on the last user's screen
    // (Lab 4, Issue 8). An expired session still returns to where it was.
    const state: FromState = signedOut ? {} : { from: { pathname: location.pathname, search: location.search }, sessionEnded };
    return <Navigate to={ROUTES.login} replace state={state} />;
  }
  if (!roles.includes(user.role)) {
    const state: FromState = { forbidden: true };
    return <Navigate to={homeFor(user.role)} replace state={state} />;
  }
  return <>{children}</>;
}
