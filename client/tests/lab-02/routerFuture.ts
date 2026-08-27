// Shared future-flags object for every MemoryRouter in the Lab 2 test
// suite — keeps them all opted into the same v7 behavior as the real
// BrowserRouter in src/App.tsx, and avoids repeating the literal in every file.
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
