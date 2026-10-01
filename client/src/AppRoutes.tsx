import { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Role } from "./api.js";
import { useAuth } from "./context/AuthContext.js";
import { Login } from "./screens/Login.js";
import { ChangePassword } from "./screens/ChangePassword.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { AppShell } from "./components/AppShell.js";
import SystemStatus from "./screens/SystemStatus.js";
import { CreateTicket } from "./screens/CreateTicket.js";
import { MyTickets } from "./screens/MyTickets.js";
import { RequesterTicketDetail } from "./screens/RequesterTicketDetail.js";
import { ComingSoon } from "./screens/ComingSoon.js";
import { ROUTES, SCREEN_ROLES } from "./routes.js";

// The actual route table the app ships, extracted out of App.tsx so tests
// can render it directly inside a MemoryRouter instead of only ever testing
// synthetic route tables the test files build themselves (review finding,
// message.txt Blocking 1 — see client/tests/lab-02/AppRoutes.test.tsx).

// Lab 3, Issue 4 — every protected screen is reached through RequireAuth with
// the roles that may open it (routes.ts SCREEN_ROLES), inside the role-aware
// shell. The Requester screens act as the signed-in user; Lab 2's Development
// Requester selector is gone (Issue 5, FR-13).
function Protected({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  return (
    <RequireAuth roles={roles}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

// Lab 3 BR-02 — a signed-in user who still has an initial password is kept on
// Change Password, whatever route they open. The server enforces the same rule
// on every API call; this only spares them screens that would refuse anyway.
function PasswordChangeGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (user?.mustChangePassword && pathname !== ROUTES.changePassword) {
    return <Navigate to={ROUTES.changePassword} replace />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <PasswordChangeGate>
      <AppRouteTable />
    </PasswordChangeGate>
  );
}

function AppRouteTable() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<Login />} />
      <Route path={ROUTES.changePassword} element={<ChangePassword />} />
      {/* Lab 1's System Status page stays public (D-18). */}
      <Route path="/" element={<SystemStatus />} />
      <Route
        path={ROUTES.list}
        element={
          <Protected roles={SCREEN_ROLES.requester}>
            <MyTickets />
          </Protected>
        }
      />
      <Route
        path={ROUTES.create}
        element={
          <Protected roles={SCREEN_ROLES.requester}>
            <CreateTicket />
          </Protected>
        }
      />
      <Route
        path={ROUTES.detailPattern}
        element={
          <Protected roles={SCREEN_ROLES.requester}>
            <RequesterTicketDetail />
          </Protected>
        }
      />
      <Route
        path={ROUTES.staffQueue}
        element={
          <Protected roles={SCREEN_ROLES.staffQueue}>
            <ComingSoon title="Ticket Queue" />
          </Protected>
        }
      />
      <Route
        path={ROUTES.adminUsers}
        element={
          <Protected roles={SCREEN_ROLES.adminUsers}>
            <ComingSoon title="User Management" />
          </Protected>
        }
      />
    </Routes>
  );
}
