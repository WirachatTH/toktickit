import type { Role } from "./api.js";

// Single source of truth for route paths, so the shell's nav links, the
// route guard's redirect target, and the router's own path definitions
// (App.tsx) never drift out of sync with each other.
export const ROUTES = {
  select: "/select-requester",
  list: "/tickets",
  create: "/tickets/new",
  detail: (id: number | string) => `/tickets/${id}`,
  // The <Route path> pattern for detail(), kept alongside it so the router
  // definition never hardcodes "/tickets/:id" independently — the exact
  // drift this file exists to prevent (review finding, message.txt).
  detailPattern: "/tickets/:id",
  // Lab 3, Issue 3 — authentication screens (ui-spec.md §3, §4).
  login: "/login",
  changePassword: "/change-password",
} as const;

// Each role's home screen (ui-spec.md §2). The IT Staff and Administrator
// screens arrive with Issues 7 and 9; until Issue 5 moves Requesters onto
// sessions, the Requester home still asks for a Development Requester.
export const HOME_BY_ROLE: Record<Role, string> = {
  REQUESTER: ROUTES.list,
  IT_STAFF: "/staff/queue",
  ADMINISTRATOR: "/admin/users",
};

export function homeFor(role: Role): string {
  return HOME_BY_ROLE[role] ?? ROUTES.list;
}
