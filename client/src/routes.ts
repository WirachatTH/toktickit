import { matchPath } from "react-router-dom";
import type { Role } from "./api.js";

// Single source of truth for route paths, so the shell's nav links, the
// route guard's redirect target, and the router's own path definitions
// (App.tsx) never drift out of sync with each other.
export const ROUTES = {
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
  // Lab 3, Issue 4 — the IT Staff and Administrator homes (ui-spec.md §2). Their
  // screens arrive with Issues 7 and 9.
  staffQueue: "/staff/queue",
  adminUsers: "/admin/users",
} as const;

// Each role's home screen (ui-spec.md §2).
export const HOME_BY_ROLE: Record<Role, string> = {
  REQUESTER: ROUTES.list,
  IT_STAFF: ROUTES.staffQueue,
  ADMINISTRATOR: ROUTES.adminUsers,
};

export function homeFor(role: Role): string {
  return HOME_BY_ROLE[role] ?? ROUTES.list;
}

// Lab 3, Issue 4 — the navigation each role sees: exactly the screens it may
// open, and nothing else (ui-spec.md §2, FR-10). Hiding a link is feedback,
// not protection: the server refuses the same role on the same data (BR-27).
export const NAV_BY_ROLE: Record<Role, { label: string; to: string }[]> = {
  REQUESTER: [
    { label: "My Tickets", to: ROUTES.list },
    { label: "Create Ticket", to: ROUTES.create },
  ],
  IT_STAFF: [{ label: "Ticket Queue", to: ROUTES.staffQueue }],
  ADMINISTRATOR: [
    { label: "User Management", to: ROUTES.adminUsers },
    { label: "Ticket Queue", to: ROUTES.staffQueue },
  ],
};

// Which roles may open each protected screen. The same lists guard the routes
// in AppRoutes.tsx and decide where Login returns a user to.
export const SCREEN_ROLES = {
  requester: ["REQUESTER"],
  staffQueue: ["IT_STAFF", "ADMINISTRATOR"],
  adminUsers: ["ADMINISTRATOR"],
} as const satisfies Record<string, readonly Role[]>;

const PROTECTED_SCREENS: { pattern: string; roles: readonly Role[] }[] = [
  { pattern: ROUTES.list, roles: SCREEN_ROLES.requester },
  { pattern: ROUTES.create, roles: SCREEN_ROLES.requester },
  { pattern: ROUTES.detailPattern, roles: SCREEN_ROLES.requester },
  { pattern: ROUTES.staffQueue, roles: SCREEN_ROLES.staffQueue },
  { pattern: ROUTES.adminUsers, roles: SCREEN_ROLES.adminUsers },
];

/** Whether `role` may open `pathname`; screens without a role list (e.g. `/`) are open to all. */
export function canOpen(role: Role, pathname: string): boolean {
  const screen = PROTECTED_SCREENS.find(({ pattern }) => matchPath(pattern, pathname));
  return !screen || screen.roles.includes(role);
}
