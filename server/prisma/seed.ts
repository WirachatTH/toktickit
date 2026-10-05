import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { ActionTakenStatus, Prisma, Priority, PrismaClient, Role, TicketStatus } from "@prisma/client";
import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/password.js";
import { formatTicketNumber } from "../src/ticketNumber.js";

// Lab 1 Issue 3, Lab 2 Issue 2, Lab 3 Issue 2, Lab 4 Issue 2 — reference data,
// accounts, sample tickets, and their Actions Taken (docs/lab-03/specification.md
// §7.6, docs/lab-04/specification.md §7.6).
//
// IDEMPOTENT AND ADDITIVE (BR-78). Every run creates whatever is missing and
// nothing else: it never overwrites an existing password, role, or activation
// state, never edits an existing ticket, and never removes anything. The one
// "fill-in" it performs is giving a documented account the local-development
// password when that account has none yet — which is how the Lab 2 Requesters,
// left without a password by the migration (BR-73), become usable. To restore
// every documented account after a demo, run `npx prisma migrate reset`.
//
// Exported (rather than only run via main()) so tests can call it directly
// against the shared Prisma client.

// Local development only — documented in README.md, never a real password
// (BR-79). Meets BR-07: 18 characters, letters and digits.
export const SEED_PASSWORD = "TokTickIT-dev-2026";

// The one documented account that must change its password at first sign-in,
// so the forced-change path can be demonstrated by hand (§7.6).
export const FIRST_LOGIN_EMAIL = "first.login@kmutt.ac.th";

const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];

const RELATED_SYSTEMS = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

export interface SeedAccount {
  key: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

export const ACCOUNTS: SeedAccount[] = [
  // The six Lab 2 Development Requesters, unchanged. On a migrated database
  // these rows already exist (renamed into User) and only receive a password.
  { key: "somchai", name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "napassorn", name: "Napassorn Chaiyasit", email: "napassorn.chaiyasit@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "teerapat", name: "Teerapat Wongsawat", email: "teerapat.wongsawat@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "kanyarat", name: "Kanyarat Suksawang", email: "kanyarat.suksawang@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "piyawat", name: "Piyawat Chatchai", email: "piyawat.chatchai@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  // Inactive on purpose: proves an inactive account cannot sign in (BR-01).
  { key: "ananya", name: "Ananya Ruangrit", email: "ananya.ruangrit@kmutt.ac.th", role: "REQUESTER", isActive: false, mustChangePassword: false },
  { key: "firstLogin", name: "Thanawat Jaidee", email: FIRST_LOGIN_EMAIL, role: "REQUESTER", isActive: true, mustChangePassword: true },

  { key: "chanon", name: "Chanon Rattanakorn", email: "chanon.rattanakorn@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { key: "pimchanok", name: "Pimchanok Srisuk", email: "pimchanok.srisuk@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { key: "worawit", name: "Worawit Thongdee", email: "worawit.thongdee@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  // Inactive on purpose: still owns a ticket, showing that ownership survives
  // deactivation (BR-29).
  { key: "suda", name: "Suda Kaewmanee", email: "suda.kaewmanee@kmutt.ac.th", role: "IT_STAFF", isActive: false, mustChangePassword: false },

  // Two, so the last-Administrator rule can be exercised by removing one (BR-58).
  { key: "siriporn", name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false },
  { key: "krit", name: "Krit Wattana", email: "krit.wattana@kmutt.ac.th", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false },
];

type Key = (typeof ACCOUNTS)[number]["key"];

interface SeedEntry {
  author: Key;
  body: string;
  hoursAfter: number;
}

export interface SeedTicket {
  requester: Key;
  category: string;
  system: string;
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority;
  status: TicketStatus;
  owner: Key | null;
  daysAgo: number;
  resolutionSummary?: string;
  requesterResolvedHoursAfter?: number;
  // Lab 4 BR-31 — when a RESOLVED or CLOSED ticket was resolved.
  resolvedHoursAfter?: number;
  comments?: SeedEntry[];
  notes?: SeedEntry[];
}

// Every status, every priority, assigned and unassigned, IT Priority differing
// from Requested Priority on several, and every reason the rules require:
// RESOLVED carries a resolution summary (BR-44); CANCELLED and REOPENED carry
// the reason comment, written by the IT Staff member who made the change
// (BR-45). Only IT Staff make status changes (BR-39), so no status-reason
// comment is ever authored by an Administrator.
export const TICKETS: SeedTicket[] = [
  // --- NEW: unassigned (BR-28) ---
  { requester: "somchai", category: "Account and Access", system: "Email", summary: "Cannot sign in to staff email after password expiry",
    description: "My staff email password expired this morning and the reset page now says the account is locked.",
    requestedPriority: "HIGH", itPriority: "HIGH", status: "NEW", owner: null, daysAgo: 0.3 },
  { requester: "napassorn", category: "Software", system: "Grade Submission App", summary: "Grade upload rejects the CSV export",
    description: "The grade submission app rejects the CSV exported from the registrar system with a format error on row 1.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "NEW", owner: null, daysAgo: 0.6 },
  { requester: "teerapat", category: "Hardware", system: "Printer", summary: "Lab printer prints faded pages",
    description: "The printer in the second-floor computer lab prints every page faded, even after a test page.",
    requestedPriority: "LOW", itPriority: "LOW", status: "NEW", owner: null, daysAgo: 1.1 },

  // --- OPEN ---
  { requester: "kanyarat", category: "Network", system: "Campus Wi-Fi", summary: "Library reading room Wi-Fi drops every few minutes",
    description: "Students in the library reading room lose the Wi-Fi connection every few minutes throughout the day.",
    requestedPriority: "MEDIUM", itPriority: "HIGH", status: "OPEN", owner: "chanon", daysAgo: 2,
    comments: [{ author: "chanon", body: "Thanks for reporting this. We are checking the access point in the reading room.", hoursAfter: 3 }] },
  { requester: "piyawat", category: "Hardware", system: "Corporate Laptop", summary: "Laptop fan runs loudly and the case gets hot",
    description: "The fan on my work laptop runs at full speed and the case becomes too hot to touch after about an hour.",
    requestedPriority: "LOW", itPriority: "LOW", status: "OPEN", owner: "pimchanok", daysAgo: 3 },

  // --- IN_PROGRESS ---
  { requester: "somchai", category: "Network", system: "VPN", summary: "VPN disconnects while uploading large files",
    description: "The VPN connection drops whenever I upload large drawing files to the department file share from home.",
    requestedPriority: "HIGH", itPriority: "HIGH", status: "IN_PROGRESS", owner: "chanon", daysAgo: 5,
    comments: [
      { author: "somchai", body: "It happens most often with files over 200 MB.", hoursAfter: 4 },
      { author: "chanon", body: "We have raised the VPN idle timeout and are testing large uploads now.", hoursAfter: 20 },
    ],
    notes: [{ author: "chanon", body: "Suspect the MTU on the VPN gateway; compare with the engineering subnet settings.", hoursAfter: 21 }] },
  { requester: "napassorn", category: "Software", system: "LEB2 App", summary: "LEB2 shows the wrong timetable for semester 1",
    description: "LEB2 shows the semester 2 timetable when semester 1 is selected in the staff timetable view.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "IN_PROGRESS", owner: "worawit", daysAgo: 4,
    // The Requester believes it is fixed; IT Staff have not confirmed yet (BR-47).
    requesterResolvedHoursAfter: 30,
    comments: [{ author: "napassorn", body: "It looks correct today after the update, thank you.", hoursAfter: 30 }] },
  // Owned by an Administrator: assignable, though only IT Staff act on it (BR-21, BR-29).
  { requester: "teerapat", category: "Account and Access", system: "Grade Submission App", summary: "Request read access to the grade submission app",
    description: "I need read access to the grade submission app to check the marks entered for my two sections.",
    requestedPriority: "LOW", itPriority: "MEDIUM", status: "IN_PROGRESS", owner: "siriporn", daysAgo: 6,
    notes: [{ author: "pimchanok", body: "Access request needs the head of department's approval before we grant it.", hoursAfter: 5 }] },

  // --- WAITING_FOR_REQUESTER ---
  { requester: "kanyarat", category: "Hardware", system: "Corporate Laptop", summary: "Docking station no longer charges the laptop",
    description: "The docking station at my desk no longer charges my laptop, although both external screens still work.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "WAITING_FOR_REQUESTER", owner: "pimchanok", daysAgo: 7,
    comments: [{ author: "pimchanok", body: "Could you tell us the asset tag printed on the bottom of the docking station?", hoursAfter: 6 }] },
  { requester: "piyawat", category: "Account and Access", system: "Email", summary: "Shared finance mailbox missing from Outlook",
    description: "The shared finance mailbox disappeared from Outlook after the weekend and none of its folders are visible.",
    requestedPriority: "HIGH", itPriority: "HIGH", status: "WAITING_FOR_REQUESTER", owner: "worawit", daysAgo: 8,
    comments: [{ author: "worawit", body: "Please restart Outlook and let us know whether the mailbox reappears.", hoursAfter: 5 }],
    notes: [{ author: "worawit", body: "Mailbox permission re-granted from the admin console at 10:40.", hoursAfter: 4 }] },

  // --- RESOLVED: always owned, always with a resolution summary (BR-42, BR-44) ---
  { requester: "somchai", category: "Software", system: "Email", summary: "Calendar invites arrive about an hour late",
    description: "Meeting invites sent from other faculties arrive about an hour after they were sent.",
    requestedPriority: "LOW", itPriority: "LOW", status: "RESOLVED", owner: "chanon", daysAgo: 10,
    resolutionSummary: "The mail server clock had drifted; it was corrected and invites now arrive on time.", resolvedHoursAfter: 30 },
  { requester: "napassorn", category: "Hardware", system: "Printer", summary: "Registrar printer toner is empty",
    description: "The registrar office printer reports an empty toner cartridge and only prints blank pages.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "RESOLVED", owner: "pimchanok", daysAgo: 9,
    // Resolved about four days ago: inside the dashboards' 7-day window.
    resolutionSummary: "Toner cartridge replaced and a test page printed successfully.", resolvedHoursAfter: 5 * 24 },

  // --- CLOSED ---
  { requester: "teerapat", category: "Network", system: "Campus Wi-Fi", summary: "New kiosk tablet cannot join staff Wi-Fi",
    description: "The new library kiosk tablet cannot join the staff Wi-Fi network and shows an authentication error.",
    requestedPriority: "MEDIUM", itPriority: "LOW", status: "CLOSED", owner: "worawit", daysAgo: 14,
    resolutionSummary: "The tablet was registered on the staff network and connects normally.", resolvedHoursAfter: 20 },
  { requester: "kanyarat", category: "Software", system: "LEB2 App", summary: "LEB2 app crashes when opening the gradebook",
    description: "The LEB2 app closes immediately whenever I open the gradebook for my course.",
    requestedPriority: "HIGH", itPriority: "HIGH", status: "CLOSED", owner: "chanon", daysAgo: 12,
    resolutionSummary: "Fixed by the LEB2 update released this week; confirmed working by the Requester.", resolvedHoursAfter: 48 },

  // --- REOPENED: the reason is a Public Comment by the IT Staff member (BR-45) ---
  { requester: "piyawat", category: "Hardware", system: "Corporate Laptop", summary: "Laptop battery drains within an hour",
    description: "My laptop battery drops from full to almost empty within an hour of unplugging it.",
    requestedPriority: "MEDIUM", itPriority: "HIGH", status: "REOPENED", owner: "pimchanok", daysAgo: 11,
    comments: [{ author: "pimchanok", body: "Reopened: the battery is draining quickly again after the earlier recalibration.", hoursAfter: 60 }],
    notes: [{ author: "pimchanok", body: "Battery health report shows 61% capacity; order a replacement if it fails again.", hoursAfter: 61 }] },
  // Owned by a since-deactivated IT Staff member: ownership survives (BR-29).
  { requester: "somchai", category: "Network", system: "VPN", summary: "VPN asks for the authenticator code twice",
    description: "Every VPN sign-in asks for the authenticator code twice before it finally connects.",
    requestedPriority: "LOW", itPriority: "MEDIUM", status: "REOPENED", owner: "suda", daysAgo: 13,
    comments: [{ author: "suda", body: "Reopened: the duplicate prompt came back after the client update.", hoursAfter: 70 }],
    notes: [{ author: "chanon", body: "Suda's account is deactivated; this ticket needs reassigning.", hoursAfter: 90 }] },

  // --- CANCELLED: the reason is a Public Comment by the IT Staff member ---
  // Cancelled straight from NEW, never claimed (BR-42 allows it).
  { requester: "napassorn", category: "Account and Access", system: "LEB2 App", summary: "Duplicate request for a LEB2 password reset",
    description: "I need my LEB2 password reset because I can no longer sign in to the library account.",
    requestedPriority: "LOW", itPriority: "LOW", status: "CANCELLED", owner: null, daysAgo: 3,
    comments: [{ author: "worawit", body: "Cancelled: this duplicates an earlier ticket for the same request.", hoursAfter: 2 }] },
  { requester: "teerapat", category: "Hardware", system: "Printer", summary: "Printer request raised under the wrong category",
    description: "I raised this printer request under the wrong category by mistake; please ignore it.",
    requestedPriority: "LOW", itPriority: "LOW", status: "CANCELLED", owner: "chanon", daysAgo: 4,
    comments: [{ author: "chanon", body: "Cancelled: raised under the wrong category; a new ticket has been opened.", hoursAfter: 3 }] },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Lab 4 — Actions Taken on the seed tickets (docs/lab-04/specification.md §7.6,
// BR-48, BR-49). Keyed by ticket summary. Finished work (completed or
// cancelled) happened `hoursAfter` the ticket's creation. Planned work is due
// `hoursAhead` of the moment the seed runs, so it lies ahead even on a database
// whose tickets were seeded long ago. Between them they give:
// tickets with zero, one, and several actions; every action status; a handled
// and an open follow-up; an Administrator assignee and an IT Staff member
// deactivated since; and IN_PROGRESS tickets that can be resolved, are blocked
// by planned work, and are blocked by an open follow-up. Every RESOLVED or
// CLOSED ticket has completed work and nothing planned, so the seed never shows
// a state the resolution gate would refuse (BR-49). Krit Wattana (Administrator)
// owns nothing and is assigned nothing, so his own dashboard metrics are zero.
// ---------------------------------------------------------------------------

export interface SeedAction {
  description: string;
  status: ActionTakenStatus;
  assignee: Key;
  createdBy: Key;
  hoursAfter?: number; // finished work: hours after the ticket was created
  hoursAhead?: number; // planned work: hours after the seed runs
  result?: string;
  followUpNote?: string; // present = follow-up required (BR-04)
  attachmentNotes?: string;
  followUpOf?: number; // index of the earlier action in this ticket's list (BR-14)
  cancelReason?: string;
}

export const ACTIONS: Record<string, SeedAction[]> = {
  // IN_PROGRESS, blocked by planned work; four actions, a handled follow-up, and a cancellation.
  "VPN disconnects while uploading large files": [
    { description: "Raised the VPN idle timeout from 30 to 120 minutes.", status: "COMPLETED", assignee: "chanon", createdBy: "chanon", hoursAfter: 22,
      result: "Uploads of 150 MB now finish; 300 MB uploads still drop.", followUpNote: "Test a 500 MB upload after changing the gateway MTU.",
      attachmentNotes: "Gateway settings before the change: vpn-gateway-before.txt on the IT share." },
    { description: "Replace the Requester's home router.", status: "CANCELLED", assignee: "pimchanok", createdBy: "chanon", hoursAfter: 30,
      cancelReason: "Not needed: the fault is on our VPN gateway, not the home router." },
    { description: "Lowered the VPN gateway MTU to 1400 and retested large uploads.", status: "COMPLETED", assignee: "worawit", createdBy: "worawit", hoursAfter: 46,
      result: "A 500 MB upload completed twice without dropping.", followUpOf: 0 },
    { description: "Confirm with the Requester after a week of normal use.", status: "PLANNED", assignee: "chanon", createdBy: "chanon", hoursAhead: 48 },
  ],
  // IN_PROGRESS, ready to resolve: completed work, nothing planned, no open follow-up.
  "LEB2 shows the wrong timetable for semester 1": [
    { description: "Cleared the timetable cache and re-synced semester 1.", status: "COMPLETED", assignee: "worawit", createdBy: "worawit", hoursAfter: 26,
      result: "The semester 1 timetable now shows correctly for the reporting user." },
  ],
  // IN_PROGRESS, blocked by an open follow-up; assigned to an Administrator.
  "Request read access to the grade submission app": [
    { description: "Asked the head of department to approve read access.", status: "COMPLETED", assignee: "siriporn", createdBy: "pimchanok", hoursAfter: 6,
      result: "Approval request sent by email; waiting for the reply.", followUpNote: "Grant read access once the approval arrives." },
  ],
  // OPEN, exactly one action, planned.
  "Laptop fan runs loudly and the case gets hot": [
    { description: "Clean the fan and replace the thermal paste.", status: "PLANNED", assignee: "pimchanok", createdBy: "pimchanok", hoursAhead: 24,
      attachmentNotes: "Fan noise recording: fan-noise.m4a, to be attached by the Requester." },
  ],
  "Shared finance mailbox missing from Outlook": [
    { description: "Re-granted the finance mailbox permission from the admin console.", status: "COMPLETED", assignee: "worawit", createdBy: "worawit", hoursAfter: 4,
      result: "Permission applied; waiting for the Requester to restart Outlook.", attachmentNotes: "Permission page screenshot: mailbox-permissions.png on the IT share." },
  ],
  "Calendar invites arrive about an hour late": [
    { description: "Corrected the mail server clock and turned on NTP sync.", status: "COMPLETED", assignee: "chanon", createdBy: "chanon", hoursAfter: 28,
      result: "Test invites from two faculties arrived within a minute." },
  ],
  "Registrar printer toner is empty": [
    { description: "Replaced the toner cartridge.", status: "COMPLETED", assignee: "pimchanok", createdBy: "pimchanok", hoursAfter: 4.5 * 24,
      result: "A test page printed cleanly." },
  ],
  "New kiosk tablet cannot join staff Wi-Fi": [
    { description: "Registered the tablet's MAC address on the staff network.", status: "COMPLETED", assignee: "worawit", createdBy: "worawit", hoursAfter: 18,
      result: "The tablet connects and stays connected." },
  ],
  "LEB2 app crashes when opening the gradebook": [
    { description: "Installed this week's LEB2 update on the Requester's device.", status: "COMPLETED", assignee: "chanon", createdBy: "chanon", hoursAfter: 46,
      result: "The gradebook opens without crashing." },
  ],
  // REOPENED: earlier work completed, new work planned.
  "Laptop battery drains within an hour": [
    { description: "Recalibrated the battery.", status: "COMPLETED", assignee: "pimchanok", createdBy: "pimchanok", hoursAfter: 20,
      result: "The battery lasted three hours in testing." },
    { description: "Replace the battery with a new unit.", status: "PLANNED", assignee: "pimchanok", createdBy: "pimchanok", hoursAhead: 72 },
  ],
  // Assigned before Suda Kaewmanee was deactivated; the assignee stays (BR-08).
  "VPN asks for the authenticator code twice": [
    { description: "Reinstall the VPN client with the new profile.", status: "PLANNED", assignee: "suda", createdBy: "suda", hoursAhead: 24 },
  ],
};

// How many actions the most recent seed() run created (printed by main()).
let lastActionsCreated = 0;

export interface SeedSummary {
  createdAccounts: number;
  passwordsAssigned: number;
  createdTickets: number;
}

// Creates the account if it is missing; gives it the documented password only
// if it has none. Never changes an existing account's password, role, or
// activation state (BR-78).
async function ensureAccount(prisma: PrismaClient, account: SeedAccount, summary: SeedSummary): Promise<number> {
  const existing = await prisma.user.findUnique({ where: { email: account.email }, select: { id: true, passwordHash: true } });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        name: account.name,
        email: account.email,
        role: account.role,
        isActive: account.isActive,
        passwordHash: await hashPassword(SEED_PASSWORD),
        mustChangePassword: account.mustChangePassword,
      },
      select: { id: true },
    });
    summary.createdAccounts += 1;
    return created.id;
  }

  if (existing.passwordHash === null) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(SEED_PASSWORD), mustChangePassword: account.mustChangePassword },
    });
    summary.passwordsAssigned += 1;
  }
  return existing.id;
}

// A seeded ticket is identified by its Requester and summary. An existing one
// is left exactly as it is, so a demo's changes survive a re-run (BR-78).
async function ensureTicket(
  prisma: PrismaClient,
  seed: SeedTicket,
  ids: { users: Map<string, number>; categories: Map<string, number>; systems: Map<string, number> },
  summary: SeedSummary,
): Promise<void> {
  const requesterId = ids.users.get(seed.requester)!;
  const existing = await prisma.ticket.findFirst({ where: { requesterId, summary: seed.summary }, select: { id: true } });
  if (existing) return;

  const createdAt = new Date(Date.now() - seed.daysAgo * DAY);
  const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR);
  // "Last updated" is the ticket's last seeded activity, not the moment the
  // seed ran, so the queue's Last Updated column reads like real history.
  const lastActivity = Math.max(
    0,
    ...(seed.comments ?? []).map((c) => c.hoursAfter),
    ...(seed.notes ?? []).map((n) => n.hoursAfter),
    seed.requesterResolvedHoursAfter ?? 0,
    seed.resolvedHoursAfter ?? 0,
    // Finished actions are activity too (Lab 4 BR-21); planned ones may lie ahead.
    ...(ACTIONS[seed.summary] ?? []).map((a) => a.hoursAfter ?? 0),
  );

  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        // Replaced below once the id exists, exactly as the app does (Lab 2 BR-01).
        ticketNumber: `PENDING-${randomUUID()}`,
        requesterId,
        ownerId: seed.owner === null ? null : ids.users.get(seed.owner)!,
        categoryId: ids.categories.get(seed.category)!,
        relatedSystemId: ids.systems.get(seed.system)!,
        summary: seed.summary,
        description: seed.description,
        requestedPriority: seed.requestedPriority,
        itPriority: seed.itPriority,
        currentStatus: seed.status,
        resolutionSummary: seed.resolutionSummary ?? null,
        requesterResolvedAt: seed.requesterResolvedHoursAfter === undefined ? null : at(seed.requesterResolvedHoursAfter),
        resolvedAt: seed.resolvedHoursAfter === undefined ? null : at(seed.resolvedHoursAfter),
        createdAt,
        updatedAt: at(lastActivity),
      },
      select: { id: true },
    });
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { ticketNumber: formatTicketNumber(ticket.id), updatedAt: at(lastActivity) },
    });
    for (const c of seed.comments ?? []) {
      await tx.publicComment.create({
        data: { ticketId: ticket.id, authorId: ids.users.get(c.author)!, body: c.body, createdAt: at(c.hoursAfter) },
      });
    }
    for (const n of seed.notes ?? []) {
      await tx.internalNote.create({
        data: { ticketId: ticket.id, authorId: ids.users.get(n.author)!, body: n.body, createdAt: at(n.hoursAfter) },
      });
    }
  });
  summary.createdTickets += 1;
}

// BR-48 — a seed ticket's actions are added only while the ticket has none and
// is still in its seeded status. A re-run therefore adds nothing, an action a
// demo edited is never duplicated, and no planned work is added to a ticket a
// demo has since resolved (which would break BR-49).
async function ensureActions(prisma: PrismaClient, seed: SeedTicket, users: Map<string, number>): Promise<number> {
  const plan = ACTIONS[seed.summary];
  if (!plan) return 0;
  const ticket = await prisma.ticket.findFirst({
    where: { requesterId: users.get(seed.requester)!, summary: seed.summary },
    select: { id: true, createdAt: true, currentStatus: true, _count: { select: { actionsTaken: true } } },
  });
  if (!ticket || ticket.currentStatus !== seed.status || ticket._count.actionsTaken > 0) return 0;

  const at = (hours: number) => new Date(ticket.createdAt.getTime() + hours * HOUR);
  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    const ids: number[] = [];
    for (const a of plan) {
      // Planned work was planned an hour after the ticket arrived; finished work
      // was recorded when it happened.
      const createdAt = a.status === "PLANNED" ? at(1) : at(a.hoursAfter!);
      const actionAt = a.status === "PLANNED" ? new Date(now + a.hoursAhead! * HOUR) : at(a.hoursAfter!);
      const createdById = users.get(a.createdBy)!;
      const data = {
        ticketId: ticket.id,
        actionAt,
        description: a.description,
        result: a.result ?? null,
        status: a.status,
        assigneeId: users.get(a.assignee)!,
        createdById,
        performedById: a.status === "COMPLETED" ? createdById : null,
        completedAt: a.status === "COMPLETED" ? createdAt : null,
        cancelledById: a.status === "CANCELLED" ? createdById : null,
        cancelledAt: a.status === "CANCELLED" ? createdAt : null,
        cancelReason: a.cancelReason ?? null,
        followUpRequired: a.followUpNote !== undefined,
        followUpNote: a.followUpNote ?? null,
        attachmentNotes: a.attachmentNotes ?? null,
        followUpOfId: a.followUpOf === undefined ? null : ids[a.followUpOf],
        version: a.status === "CANCELLED" ? 2 : 1,
        createdAt,
      };
      const created = await tx.actionTaken.create({ data, select: { id: true } });
      ids.push(created.id);
      // The history the API would have written (BR-22): a cancelled action was
      // planned first, then cancelled; a completed one was recorded as done.
      const snapshot: Record<string, { from: null; to: unknown }> = {};
      for (const key of ["actionAt", "description", "assigneeId", "result", "followUpRequired", "followUpNote", "attachmentNotes", "followUpOfId"] as const) {
        const value = data[key];
        if (value !== null) snapshot[key] = { from: null, to: value instanceof Date ? value.toISOString() : value };
      }
      snapshot.status = { from: null, to: a.status === "CANCELLED" ? "PLANNED" : a.status };
      await tx.actionTakenEvent.create({ data: { actionTakenId: created.id, type: "CREATED", actorId: createdById, changes: snapshot as Prisma.InputJsonValue, createdAt } });
      if (a.status === "CANCELLED") {
        await tx.actionTakenEvent.create({
          data: { actionTakenId: created.id, type: "CANCELLED", actorId: createdById, createdAt, changes: { status: { from: "PLANNED", to: "CANCELLED" }, cancelReason: { from: null, to: a.cancelReason ?? null } } },
        });
      }
    }
  });
  return plan.length;
}

export async function seed(prisma: PrismaClient): Promise<SeedSummary> {
  const summary: SeedSummary = { createdAccounts: 0, passwordsAssigned: 0, createdTickets: 0 };

  const categories = new Map<string, number>();
  for (const name of CATEGORIES) {
    const row = await prisma.category.upsert({ where: { name }, update: {}, create: { name }, select: { id: true } });
    categories.set(name, row.id);
  }

  const systems = new Map<string, number>();
  for (const name of RELATED_SYSTEMS) {
    const row = await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
      select: { id: true },
    });
    systems.set(name, row.id);
  }

  const users = new Map<string, number>();
  for (const account of ACCOUNTS) {
    users.set(account.key, await ensureAccount(prisma, account, summary));
  }

  for (const ticket of TICKETS) {
    await ensureTicket(prisma, ticket, { users, categories, systems }, summary);
  }

  // Lab 4 — Actions Taken. Counted separately, so the Lab 3 summary keeps its shape.
  lastActionsCreated = 0;
  for (const ticket of TICKETS) lastActionsCreated += await ensureActions(prisma, ticket, users);

  return summary;
}

async function main() {
  const summary = await seed(getPrisma());
  console.log("Seeding complete.");
  console.log(`  Accounts created: ${summary.createdAccounts}; passwords assigned to existing accounts: ${summary.passwordsAssigned}`);
  console.log(`  Sample tickets created: ${summary.createdTickets}`);
  console.log(`  Actions Taken created: ${lastActionsCreated}`);
  console.log(`  Local-development password for every documented account: ${SEED_PASSWORD}`);
  console.log(`  ${FIRST_LOGIN_EMAIL} must change it at first sign-in.`);
}

// Only run when executed directly (`npm run prisma:seed`), never as a side
// effect of being imported by a test.
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
