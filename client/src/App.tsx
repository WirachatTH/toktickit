import { ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { RequireRequester } from "./components/RequireRequester.js";
import { AppShell } from "./components/AppShell.js";
import SystemStatus from "./screens/SystemStatus.js";
import { RequesterSelector } from "./screens/RequesterSelector.js";
import { ROUTES } from "./routes.js";

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

export default function App() {
  return (
    <RequesterProvider>
      <BrowserRouter>
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
                  <ComingSoon label="Create Ticket" />
                </ShellLayout>
              </RequireRequester>
            }
          />
          <Route
            path="/tickets/:id"
            element={
              <RequireRequester>
                <ShellLayout>
                  <ComingSoon label="Ticket Detail" />
                </ShellLayout>
              </RequireRequester>
            }
          />
        </Routes>
      </BrowserRouter>
    </RequesterProvider>
  );
}
