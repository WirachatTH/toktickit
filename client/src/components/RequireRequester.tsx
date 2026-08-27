import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";
import { ROUTES } from "../routes.js";

// Route guard (BR-08, AC-02): no Requester-scoped screen is reachable
// without a current selection.
export function RequireRequester({ children }: { children: ReactNode }) {
  const { requester } = useRequester();
  if (!requester) {
    return <Navigate to={ROUTES.select} replace />;
  }
  return <>{children}</>;
}
