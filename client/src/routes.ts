// Single source of truth for route paths, so the shell's nav links, the
// route guard's redirect target, and the router's own path definitions
// (App.tsx) never drift out of sync with each other.
export const ROUTES = {
  select: "/select-requester",
  list: "/tickets",
  create: "/tickets/new",
  detail: (id: number | string) => `/tickets/${id}`,
} as const;
