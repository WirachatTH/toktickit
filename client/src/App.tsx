import { BrowserRouter } from "react-router-dom";
import { RequesterProvider } from "./context/RequesterContext.js";
import { AppRoutes } from "./AppRoutes.js";

// react-router v7 future flags opted into now: removes noisy console
// warnings from every render/test run without changing behavior today.
const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export default function App() {
  return (
    <RequesterProvider>
      <BrowserRouter future={ROUTER_FUTURE}>
        <AppRoutes />
      </BrowserRouter>
    </RequesterProvider>
  );
}
