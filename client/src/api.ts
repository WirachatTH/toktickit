// Lab 3 D-11 — the browser only ever talks to its own origin: every call is a
// relative /api/... URL, which the Vite dev server proxies to the API
// (API_PROXY_TARGET). The session cookie is therefore first-party in local
// development and in the Docker E2E setup alike. VITE_API_URL is retired.
const API_URL = "";

// Every request goes through apiFetch, which always sends the session cookie
// (credentials: "include"). Same-origin requests send it anyway, but the
// option makes that explicit and keeps every call working if the client is
// ever served from a different origin than the API (PR #55 review). The
// server's CORS config already allows credentials for CLIENT_ORIGINS.
function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
}

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
// Lab 3, Issue 5 — every Requester call below is made as the signed-in user:
// apiFetch sends the session cookie with it, and the server takes the
// Requester from that session (BR-03). Lab 2's Development Requester list and
// header are gone (FR-13), so no call names a Requester any more.

// ---------------------------------------------------------------------------
// Lab 2, Issue 5 — Create Ticket (api-spec.md §4, BR-38). Attachments ride
// along in the same multipart request as the ticket fields; the server
// treats ticket + initial attachments as one atomic operation.
// ---------------------------------------------------------------------------

export interface RelatedSystem {
  id: number;
  name: string;
}

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH";
// Lab 3 — all eight statuses (api-spec §0.6).
export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

export interface Attachment {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  isRemoved: boolean;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  currentStatus: TicketStatus;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
}

export interface NewTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority?: RequestedPriority;
  attachments?: File[];
}

// Carries the server's error envelope (api-spec.md §0) through to the UI so
// a field-level message can be shown next to its control, not just a single
// message at the top of the form.
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  /** Seconds from a Retry-After header (429 TOO_MANY_ATTEMPTS). */
  retryAfterSeconds?: number;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Set by the client, never sent by the API: a 5xx whose body is not the API's JSON. */
export const API_UNREACHABLE = "API_UNREACHABLE";

function retryAfterOf(res: Response): number | undefined {
  const raw = res.headers?.get?.("Retry-After");
  const seconds = raw === null || raw === undefined ? NaN : Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

// Lab 3, Issue 4 — a request answered 401 UNAUTHENTICATED means the server no
// longer knows this browser's session (expired, logged out elsewhere, user
// deactivated). AuthProvider listens and returns the user to Login with the
// session-ended message (ui-spec.md §2, AC-08). A failed sign-in is
// INVALID_CREDENTIALS, never this code, so it does not trigger it.
type SessionEndedListener = () => void;
const sessionEndedListeners = new Set<SessionEndedListener>();

export function onSessionEnded(listener: SessionEndedListener): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const error = new ApiError(
      res.status,
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? "Something went wrong. Please try again.",
      body?.error?.fields,
      retryAfterOf(res)
    );
    if (error.status === 401 && error.code === "UNAUTHENTICATED") {
      sessionEndedListeners.forEach((listener) => listener());
    }
    return error;
  } catch {
    // Response body wasn't JSON at all (e.g. a proxy/network-level failure) —
    // never surface that raw detail to the user (BR-28). The API always answers
    // JSON, so a 5xx without it came from whatever sits in front of an API that
    // is down: API_UNREACHABLE, a client-side code (Lab 4, Issue 7).
    return new ApiError(res.status, res.status >= 500 ? API_UNREACHABLE : "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiFetch("/api/categories");
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await apiFetch("/api/systems");
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function createTicket(input: NewTicketInput): Promise<Ticket> {
  const formData = new FormData();
  formData.append("categoryId", String(input.categoryId));
  formData.append("relatedSystemId", String(input.relatedSystemId));
  formData.append("summary", input.summary);
  formData.append("description", input.description);
  if (input.requestedPriority) {
    formData.append("requestedPriority", input.requestedPriority);
  }
  for (const file of input.attachments ?? []) {
    formData.append("attachments", file);
  }

  // No Content-Type header here on purpose — the browser sets the
  // multipart boundary itself; setting it manually breaks the request.
  const res = await apiFetch("/api/tickets", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw await toApiError(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Lab 2, Issue 7 — My Tickets list (api-spec.md §5, BR-12, BR-14-19). The
// server clamps invalid/out-of-range query params itself (Decision D-5), so
// this layer just forwards whatever the UI has and never pre-validates —
// duplicating that clamping logic here would only risk it drifting out of
// sync with the server's actual rules.
// ---------------------------------------------------------------------------

export type TicketSortField = "createdAt" | "updatedAt" | "ticketNumber" | "summary" | "requestedPriority";
export type SortOrder = "asc" | "desc";

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  relatedSystemName: string;
  requestedPriority: RequestedPriority;
  currentStatus: TicketStatus;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketListResponse {
  data: TicketListItem[];
  pagination: PaginationMeta;
}

export interface TicketListParams {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: RequestedPriority;
  sort?: TicketSortField;
  order?: SortOrder;
  page?: number;
  /** Lab 4 D-13 — "UNRESOLVED" or one status; omit for every ticket. */
  status?: "UNRESOLVED" | TicketStatus;
}

export async function fetchTickets(params: TicketListParams = {}): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.categoryId) query.set("categoryId", String(params.categoryId));
  if (params.relatedSystemId) query.set("relatedSystemId", String(params.relatedSystemId));
  if (params.requestedPriority) query.set("requestedPriority", params.requestedPriority);
  if (params.sort) query.set("sort", params.sort);
  if (params.order) query.set("order", params.order);
  if (params.page) query.set("page", String(params.page));
  if (params.status) query.set("status", params.status);

  const res = await apiFetch(`/api/tickets?${query.toString()}`);
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Lab 2, Issue 8 — Requester Ticket Detail (api-spec.md §6, BR-45). Reuses
// the Issue 6 attachment endpoints (§7-10) for add/download/soft-remove —
// this screen is a second consumer of that same API, not a new one.
// ---------------------------------------------------------------------------

export interface TicketDetailAttachment {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  isRemoved: boolean;
  removedAt: string | null;
  removedReason: string | null;
}

/** A person inside a ticket payload (api-spec §0.6). */
export interface PersonRef {
  id: number;
  name: string;
  role: Role;
  isActive: boolean;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  requester: { id: number; name: string; email: string };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  currentStatus: TicketStatus;
  // Lab 3, Issue 5 (api-spec §3.3). Never IT Priority or notes (BR-71).
  owner: PersonRef | null;
  resolutionSummary: string | null;
  requesterResolvedAt: string | null;
  /** Lab 3, Issue 6 — false on a CLOSED or CANCELLED ticket (BR-52). */
  canComment: boolean;
  /** Lab 4 BR-31 (api-spec §2.3) — when IT Staff resolved it. */
  resolvedAt?: string | null;
  /** Lab 3, Issue 8 — whether "Problem appears resolved" is offered (BR-47). */
  canMarkAppearsResolved: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: TicketDetailAttachment[];
}

export async function fetchTicket(ticketId: number): Promise<TicketDetail> {
  const res = await apiFetch(`/api/tickets/${ticketId}`);
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function addAttachmentToTicket(ticketId: number, file: File): Promise<TicketDetailAttachment> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export interface RemovedAttachment {
  id: number;
  isRemoved: boolean;
  removedAt: string;
  removedReason: string;
}

export async function removeAttachment(ticketId: number, attachmentId: number, reason: string): Promise<RemovedAttachment> {
  const res = await apiFetch(`/api/tickets/${ticketId}/attachments/${attachmentId}/remove`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

// Returns the raw bytes rather than parsing the server's Content-Disposition
// header back out — the caller already has the attachment's original
// filename from fetchTicket()'s response, and that header isn't readable
// from browser JS on a cross-origin response anyway unless the server opts
// in via Access-Control-Expose-Headers, which it doesn't.
export async function downloadAttachment(ticketId: number, attachmentId: number): Promise<Blob> {
  const res = await apiFetch(`/api/tickets/${ticketId}/attachments/${attachmentId}/download`);
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await apiFetch("/api/health");
  if (!healthRes.ok) {
    throw new Error("Unable to connect to TokTickIT API");
  }
  
  const categoriesRes = await apiFetch("/api/categories");
  if (!categoriesRes.ok) {
    throw new Error("Unable to fetch categories");
  }
  
  const categories: Category[] = await categoriesRes.json();
  
  return { online: true, categories };
}

// ---------------------------------------------------------------------------
// Lab 3, Issue 3 — authentication (api-spec.md §1). The session lives in an
// HttpOnly cookie the browser sends by itself; this code never sees the token.
// ---------------------------------------------------------------------------

export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).user;
}

export async function logout(): Promise<void> {
  const res = await apiFetch("/api/auth/logout", { method: "POST" });
  if (!res.ok) throw await toApiError(res);
}

/** The signed-in user, or null when there is no session.
 *  Lab 4, Issue 7 (D-20): asked through /api/auth/session, which answers a
 *  visitor with `user: null` and 200, so a signed-out page load logs no 401. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch("/api/auth/session");
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  const res = await apiFetch("/api/auth/change-password", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).user;
}

// ---------------------------------------------------------------------------
// Lab 3, Issue 6 — Public Comments and Internal Notes (api-spec.md §4). Two
// endpoints each, no edit or delete (BR-51). The server sets the author and
// the time; only the body is sent.
// ---------------------------------------------------------------------------

export interface DiscussionEntry {
  id: number;
  body: string;
  createdAt: string;
  author: PersonRef;
}

async function listEntries(path: string): Promise<DiscussionEntry[]> {
  const res = await apiFetch(path);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).data;
}

async function postEntry(path: string, body: string): Promise<DiscussionEntry> {
  const res = await apiFetch(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ body }) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export function fetchComments(ticketId: number): Promise<DiscussionEntry[]> {
  return listEntries(`/api/tickets/${ticketId}/comments`);
}

export function postComment(ticketId: number, body: string): Promise<DiscussionEntry> {
  return postEntry(`/api/tickets/${ticketId}/comments`, body);
}

export function fetchInternalNotes(ticketId: number): Promise<DiscussionEntry[]> {
  return listEntries(`/api/tickets/${ticketId}/internal-notes`);
}

export function postInternalNote(ticketId: number, body: string): Promise<DiscussionEntry> {
  return postEntry(`/api/tickets/${ticketId}/internal-notes`, body);
}

// ---------------------------------------------------------------------------
// Lab 3, Issue 7 — the IT Staff Ticket Queue and assignable users (api-spec.md
// §5.1, §5.3). Query values are sent as the URL has them; the server applies
// defaults and clamps, and echoes what it applied (BR-66).
// ---------------------------------------------------------------------------

export type Priority = RequestedPriority;

export interface QueueQuery {
  search: string;
  status: "ACTIVE" | "ALL" | "UNRESOLVED" | TicketStatus; // Lab 4 D-13 adds UNRESOLVED
  itPriority: Priority | null;
  categoryId: number | null;
  owner: "any" | "unassigned" | "me" | number;
  appearsResolved: boolean;
  sort: "itPriority" | "createdAt" | "updatedAt" | "ticketNumber" | "status";
  order: SortOrder;
  page: number;
  pageSize: number;
}

export interface QueueRow {
  id: number;
  ticketNumber: string;
  summary: string;
  requester: PersonRef;
  category: { id: number; name: string };
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  owner: PersonRef | null;
  requesterResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueueResponse {
  data: QueueRow[];
  pagination: PaginationMeta;
  appliedQuery: QueueQuery;
}

export async function fetchStaffQueue(params: Record<string, string> = {}): Promise<QueueResponse> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(query ? `/api/staff/tickets?${query}` : "/api/staff/tickets");
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function fetchAssignableUsers(): Promise<PersonRef[]> {
  const res = await apiFetch("/api/staff/assignable-users");
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// Lab 3, Issue 8 — IT Staff Ticket Detail, the workflow, and the Requester's
// "Problem appears resolved" (api-spec.md §3.7, §5.2, §5.4 to §5.6). Every
// change states what the screen showed (expectedStatus / expectedOwnerId), so
// a change made meanwhile by someone else is refused, not overwritten.
// ---------------------------------------------------------------------------

export interface StaffTicketDetail {
  id: number;
  ticketNumber: string;
  requester: { id: number; name: string; email: string; isActive: boolean };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  owner: PersonRef | null;
  resolutionSummary: string | null;
  requesterResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: TicketDetailAttachment[];
  /** Lab 4 BR-31 — when the ticket was last resolved; null unless RESOLVED or CLOSED. */
  resolvedAt: string | null;
  /** Lab 4 BR-30 — the resolution gate; `permittedTransitions` leaves out RESOLVED while it fails. */
  resolutionGate: { passes: boolean; completedCount: number; plannedCount: number; openFollowUpCount: number };
  permittedTransitions: TicketStatus[];
  capabilities: {
    canAssign: boolean;
    canChangePriority: boolean;
    canChangeStatus: boolean;
    canPostComment: boolean;
    canPostNote: boolean;
    /** Lab 4 BR-17, BR-20 — IT Staff and Administrators, while the ticket is being worked. */
    canWriteActions: boolean;
  };
}

async function patchStaffTicket(ticketId: number, what: string, body: object): Promise<StaffTicketDetail> {
  const res = await apiFetch(`/api/staff/tickets/${ticketId}/${what}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function fetchStaffTicket(ticketId: number): Promise<StaffTicketDetail> {
  const res = await apiFetch(`/api/staff/tickets/${ticketId}`);
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export function changeOwner(ticketId: number, body: { ownerId: number | null; expectedOwnerId: number | null; expectedStatus: TicketStatus }) {
  return patchStaffTicket(ticketId, "owner", body);
}

export function changeItPriority(ticketId: number, body: { itPriority: Priority; expectedStatus: TicketStatus }) {
  return patchStaffTicket(ticketId, "it-priority", body);
}

export function changeStatus(
  ticketId: number,
  body: { status: TicketStatus; expectedStatus: TicketStatus; expectedOwnerId: number | null; resolutionSummary?: string; reason?: string },
) {
  return patchStaffTicket(ticketId, "status", body);
}

export async function markAppearsResolved(ticketId: number, comment?: string): Promise<{ requesterResolvedAt: string; comment: DiscussionEntry | null }> {
  const res = await apiFetch(`/api/tickets/${ticketId}/appears-resolved`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(comment ? { comment } : {}),
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Lab 3, Issue 9 — Administrator user management (api-spec.md §6).
// ---------------------------------------------------------------------------

export interface AdminUser extends AuthUser {
  lastLoginAt: string | null;
  createdAt: string;
}

export interface NewUserInput {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  initialPassword: string;
}

// Lab 4 D-13 adds the optional activation filter.
export async function fetchAdminUsers(params: { search?: string; role?: Role; status?: "active" | "inactive" } = {}): Promise<AdminUser[]> {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  const res = await apiFetch(query ? `/api/admin/users?${query}` : "/api/admin/users");
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).data;
}

export async function createUser(input: NewUserInput): Promise<AdminUser> {
  const res = await apiFetch("/api/admin/users", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function updateUser(id: number, changes: Partial<Pick<AdminUser, "name" | "email" | "role" | "isActive">>): Promise<AdminUser> {
  const res = await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(changes) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function setInitialPassword(id: number, initialPassword: string): Promise<AdminUser> {
  const res = await apiFetch(`/api/admin/users/${id}/initial-password`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ initialPassword }) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Lab 4, Issue 3 — Actions Taken (docs/lab-04/api-spec.md §1). Every edit and
// status change states the version the screen showed, so a change made
// meanwhile by someone else is refused (409 STALE_STATE), not overwritten. A
// create carries the form's clientRequestId, so a retry never makes a second action.
// ---------------------------------------------------------------------------

export type ActionTakenStatus = "PLANNED" | "COMPLETED" | "CANCELLED";

export interface ActionTaken {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionTakenStatus;
  assignee: PersonRef;
  createdBy: PersonRef;
  performedBy: PersonRef | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  /** Whether a completed follow-up links to this action; null without the flag (BR-14). */
  followUpHandled: boolean | null;
  followUpOfId: number | null;
  attachmentNotes: string | null;
  cancelReason: string | null;
  cancelledBy: PersonRef | null;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionTakenEvent {
  id: number;
  type: "CREATED" | "UPDATED" | "COMPLETED" | "CANCELLED";
  actor: PersonRef;
  createdAt: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export interface NewActionTaken {
  status: "PLANNED" | "COMPLETED";
  actionAt: string;
  description: string;
  assigneeId: number;
  result?: string | null;
  followUpRequired?: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
  followUpOfId?: number | null;
  clientRequestId?: string;
}

export interface ActionTakenChanges {
  expectedVersion: number;
  actionAt?: string;
  description?: string;
  assigneeId?: number;
  result?: string | null;
  followUpRequired?: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
}

export type ActionTakenStatusChange =
  | { status: "COMPLETED"; expectedVersion: number; result?: string; followUpRequired?: boolean; followUpNote?: string | null; actionAt?: string }
  | { status: "CANCELLED"; expectedVersion: number; reason: string };

const actionsPath = (ticketId: number) => `/api/tickets/${ticketId}/actions-taken`;

async function sendAction(path: string, method: "POST" | "PATCH", body: object): Promise<ActionTaken> {
  const res = await apiFetch(path, { method, headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function fetchActionsTaken(ticketId: number): Promise<ActionTaken[]> {
  const res = await apiFetch(actionsPath(ticketId));
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).data;
}

export function createActionTaken(ticketId: number, body: NewActionTaken): Promise<ActionTaken> {
  return sendAction(actionsPath(ticketId), "POST", body);
}

export function updateActionTaken(ticketId: number, actionId: number, body: ActionTakenChanges): Promise<ActionTaken> {
  return sendAction(`${actionsPath(ticketId)}/${actionId}`, "PATCH", body);
}

export function changeActionStatus(ticketId: number, actionId: number, body: ActionTakenStatusChange): Promise<ActionTaken> {
  return sendAction(`${actionsPath(ticketId)}/${actionId}/status`, "PATCH", body);
}

export async function fetchActionHistory(ticketId: number, actionId: number): Promise<ActionTakenEvent[]> {
  const res = await apiFetch(`${actionsPath(ticketId)}/${actionId}/history`);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// Lab 4, Issue 6 — the dashboards (docs/lab-04/api-spec.md §3). Every value is
// counted by the server (BR-34); the screen only shows what arrives.
// ---------------------------------------------------------------------------

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
  /** A client route that lists what the metric counts (BR-38). */
  href: string;
}

export interface DashboardTicket {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: TicketStatus;
  updatedAt: string;
  href: string;
  /** IT Staff and Administrator lists only; never in a Requester's (BR-36). */
  itPriority?: Priority;
  owner?: PersonRef | null;
  resolvedAt?: string | null;
}

export interface DashboardPlannedAction {
  actionId: number;
  actionAt: string;
  description: string;
  ticket: { id: number; ticketNumber: string; summary: string; currentStatus: TicketStatus };
  href: string;
}

interface DashboardEnvelope {
  generatedAt: string;
  timeZone: string;
  today: { start: string; end: string };
  metrics: DashboardMetric[];
}

export interface RequesterDashboard extends DashboardEnvelope {
  lists: { needsAttention: DashboardTicket[]; recentlyUpdated: DashboardTicket[]; recentlyResolved: DashboardTicket[] };
}

export interface StaffDashboard extends DashboardEnvelope {
  byStatus: DashboardMetric[];
  byItPriority: DashboardMetric[];
  lists: { myPlannedActions: DashboardPlannedAction[]; urgent: DashboardTicket[]; recentlyUpdated: DashboardTicket[] };
}

export interface AdminDashboard extends StaffDashboard {
  users: DashboardMetric[];
}

async function getDashboard<T>(which: "requester" | "staff" | "admin"): Promise<T> {
  const res = await apiFetch(`/api/dashboard/${which}`);
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export function fetchRequesterDashboard(): Promise<RequesterDashboard> {
  return getDashboard("requester");
}

export function fetchStaffDashboard(): Promise<StaffDashboard> {
  return getDashboard("staff");
}

export function fetchAdminDashboard(): Promise<AdminDashboard> {
  return getDashboard("admin");
}
