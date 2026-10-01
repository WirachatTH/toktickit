import { ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "../../src/context/AuthContext.js";
import type { AuthUser } from "../../src/api.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// Shared helpers for the Lab 3 sign-in screen tests.

export const REQUESTER: AuthUser = {
  id: 7,
  name: "Somchai Prasert",
  email: "somchai.prasert@kmutt.ac.th",
  role: "REQUESTER",
  isActive: true,
  mustChangePassword: false,
};

export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

// Renders the given screen at `path` inside the real AuthProvider, plus a
// marker element on every other route, so a test can see where it navigated.
export function renderAt(path: string, routes: { path: string; element: ReactNode }[]) {
  return render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <Routes>
          {routes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route path="*" element={<p>other page</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>,
  );
}
