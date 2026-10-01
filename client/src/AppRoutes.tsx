import { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useRequester } from "./context/RequesterContext.js";
import { useAuth } from "./context/AuthContext.js";
import { Login } from "./screens/Login.js";
import { ChangePassword } from "./screens/ChangePassword.js";
import { RequireRequester } from "./components/RequireRequester.js";
import { AppShell } from "./components/AppShell.js";
import SystemStatus from "./screens/SystemStatus.js";
import { RequesterSelector } from "./screens/RequesterSelector.js";
import { CreateTicket } from "./screens/CreateTicket.js";
import { MyTickets } from "./screens/MyTickets.js";
import { RequesterTicketDetail } from "./screens/RequesterTicketDetail.js";
import { ROUTES } from "./routes.js";

// The actual route table the app ships, extracted out of App.tsx so tests
// can render it directly inside a MemoryRouter instead of only ever testing
// synthetic route tables the test files build themselves (review finding,
// message.txt Blocking 1 — see client/tests/lab-02/AppRoutes.test.tsx).

function ShellLayout({ children }: { children: ReactNode }) {
  const { requester, changeRequester } = useRequester();
  return (
    <AppShell currentRequesterName={requester?.name} onChangeRequester={changeRequester}>
      {children}
    </AppShell>
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
      <Route path="/" element={<SystemStatus />} />
      <Route path={ROUTES.select} element={<RequesterSelector />} />
      <Route
        path={ROUTES.list}
        element={
          <RequireRequester>
            <ShellLayout>
              <MyTickets />
            </ShellLayout>
          </RequireRequester>
        }
      />
      <Route
        path={ROUTES.create}
        element={
          <RequireRequester>
            <ShellLayout>
              <CreateTicket />
            </ShellLayout>
          </RequireRequester>
        }
      />
      <Route
        path={ROUTES.detailPattern}
        element={
          <RequireRequester>
            <ShellLayout>
              <RequesterTicketDetail />
            </ShellLayout>
          </RequireRequester>
        }
      />
    </Routes>
  );
}
