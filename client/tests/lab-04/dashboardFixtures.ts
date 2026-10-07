import type * as api from "../../src/api.js";

// Dashboard payloads shaped like docs/lab-04/api-spec.md §3, shared by the Lab 4
// dashboard and navigation tests. Values are chosen so that no metric equals
// the length of any list: a screen that counted for itself would show a wrong
// number (BR-34).

export const STAFF: api.AuthUser = { id: 8, name: "Pimchanok Srisuk", email: "pimchanok.srisuk@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false };
export const ADMIN: api.AuthUser = { ...STAFF, id: 9, name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR" };
export const REQUESTER: api.AuthUser = { ...STAFF, id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th", role: "REQUESTER" };

const ENVELOPE = {
  generatedAt: "2026-10-07T09:12:00.000Z", // 16:12 in Bangkok
  timeZone: "Asia/Bangkok",
  today: { start: "2026-10-06T17:00:00.000Z", end: "2026-10-07T17:00:00.000Z" },
};
const PERSON = { id: 10, name: "Chanon Rattanakorn", role: "IT_STAFF" as const, isActive: true };

const staffTicket = (id: number, summary: string, status: api.TicketStatus, itPriority: api.Priority = "MEDIUM"): api.DashboardTicket => ({
  id, ticketNumber: `TCK-${String(id).padStart(6, "0")}`, summary, currentStatus: status, updatedAt: "2026-10-07T03:00:00.000Z",
  itPriority, owner: PERSON, href: `/staff/tickets/${id}`,
});

export function staffDashboard(): api.StaffDashboard {
  return {
    ...ENVELOPE,
    metrics: [
      { key: "unassigned", label: "Unassigned", value: 4, href: "/staff/queue?owner=unassigned" },
      { key: "myTickets", label: "My tickets", value: 7, href: "/staff/queue?owner=me" },
      { key: "myPlannedActions", label: "My planned actions", value: 9, href: "/dashboard#my-planned-actions" },
      { key: "appearsResolved", label: "Requester says resolved", value: 1, href: "/staff/queue?appearsResolved=true" },
      { key: "createdToday", label: "Created today", value: 3, href: "/staff/queue?status=ALL&sort=createdAt&order=desc" },
      { key: "resolvedToday", label: "Resolved today", value: 0, href: "/staff/queue?status=ALL&sort=updatedAt&order=desc" },
    ],
    byStatus: (["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const).map((s, i) => ({
      key: s, label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "), value: i + 10, href: `/staff/queue?status=${s}`,
    })),
    byItPriority: (["HIGH", "MEDIUM", "LOW"] as const).map((p, i) => ({ key: p, label: p.charAt(0) + p.slice(1).toLowerCase(), value: 20 + i, href: `/staff/queue?status=UNRESOLVED&itPriority=${p}` })),
    lists: {
      myPlannedActions: [
        { actionId: 118, actionAt: "2026-10-07T03:30:00.000Z", description: "Replace the laptop battery.", ticket: { id: 42, ticketNumber: "TCK-000042", summary: "Laptop battery drains quickly", currentStatus: "IN_PROGRESS" }, href: "/staff/tickets/42#action-118" },
        { actionId: 119, actionAt: "2026-10-08T02:00:00.000Z", description: "Call the Requester back.", ticket: { id: 43, ticketNumber: "TCK-000043", summary: "VPN drops", currentStatus: "OPEN" }, href: "/staff/tickets/43#action-119" },
      ],
      urgent: [staffTicket(50, "Payroll server unreachable", "OPEN", "HIGH")],
      recentlyUpdated: [staffTicket(42, "Laptop battery drains quickly", "IN_PROGRESS"), staffTicket(43, "VPN drops", "OPEN")],
    },
  };
}

export function adminDashboard(): api.AdminDashboard {
  return {
    ...staffDashboard(),
    users: [
      { key: "activeRequesters", label: "Active Requesters", value: 6, href: "/admin/users?role=REQUESTER&status=active" },
      { key: "activeItStaff", label: "Active IT Staff", value: 3, href: "/admin/users?role=IT_STAFF&status=active" },
      { key: "activeAdministrators", label: "Active Administrators", value: 2, href: "/admin/users?role=ADMINISTRATOR&status=active" },
      { key: "inactive", label: "Inactive accounts", value: 2, href: "/admin/users?status=inactive" },
    ],
  };
}

const own = (id: number, summary: string, status: api.TicketStatus, extra: Partial<api.DashboardTicket> = {}): api.DashboardTicket => ({
  id, ticketNumber: `TCK-${String(id).padStart(6, "0")}`, summary, currentStatus: status, updatedAt: "2026-10-07T03:00:00.000Z", href: `/tickets/${id}`, ...extra,
});

export function requesterDashboard(): api.RequesterDashboard {
  return {
    ...ENVELOPE,
    metrics: [
      { key: "unresolved", label: "Open requests", value: 5, href: "/tickets?status=UNRESOLVED" },
      { key: "waitingForMe", label: "Waiting for you", value: 2, href: "/tickets?status=WAITING_FOR_REQUESTER" },
      { key: "resolved", label: "Resolved", value: 4, href: "/tickets?status=RESOLVED" },
      { key: "closed", label: "Closed", value: 12, href: "/tickets?status=CLOSED" },
    ],
    lists: {
      needsAttention: [own(61, "Docking station no longer charges", "WAITING_FOR_REQUESTER")],
      recentlyUpdated: [own(61, "Docking station no longer charges", "WAITING_FOR_REQUESTER"), own(62, "Calendar invites arrive late", "RESOLVED")],
      recentlyResolved: [own(62, "Calendar invites arrive late", "RESOLVED", { resolvedAt: "2026-10-06T02:00:00.000Z" })],
    },
  };
}

export function emptyRequesterDashboard(): api.RequesterDashboard {
  const d = requesterDashboard();
  return { ...d, metrics: d.metrics.map((m) => ({ ...m, value: 0 })), lists: { needsAttention: [], recentlyUpdated: [], recentlyResolved: [] } };
}
