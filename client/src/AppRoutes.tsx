import { ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { useRequester } from "./context/RequesterContext.js";
import { RequireRequester } from "./components/RequireRequester.js";
import { AppShell } from "./components/AppShell.js";
import SystemStatus from "./screens/SystemStatus.js";
import { RequesterSelector } from "./screens/RequesterSelector.js";
import { CreateTicket } from "./screens/CreateTicket.js";
import { ROUTES } from "./routes.js";

// The actual route table the app ships, extracted out of App.tsx so tests
// can render it directly inside a MemoryRouter instead of only ever testing
// synthetic route tables the test files build themselves (review finding,
// message.txt Blocking 1 — see client/tests/lab-02/AppRoutes.test.tsx).

// Temporary placeholder for a screen a later issue implements. Replaced,
// not built out here — Issue 4's scope is the Selector, routing, and guard.
function ComingSoon({ label }: { label: string }) {
  return <p>{label} — coming in a later issue.</p>;
}

function ShellLayout({ children }: { children: ReactNode }) {
  const { requester, changeRequester } = useRequester();
  return (
    <AppShell currentRequesterName={requester?.name} onChangeRequester={changeRequester}>
      {children}
    </AppShell>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SystemStatus />} />
      <Route path={ROUTES.select} element={<RequesterSelector />} />
      <Route
        path={ROUTES.list}
        element={
          <RequireRequester>
            <ShellLayout>
              <ComingSoon label="My Tickets" />
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
              <ComingSoon label="Ticket Detail" />
            </ShellLayout>
          </RequireRequester>
        }
      />
    </Routes>
  );
}
