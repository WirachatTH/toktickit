// Lab 3 D-11 — the browser only ever talks to its own origin: every call is a
// relative /api/... URL, which the Vite dev server proxies to the API
// (API_PROXY_TARGET). The session cookie is therefore first-party in local
// development and in the Docker E2E setup alike. VITE_API_URL is retired.
const API_URL = "";

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
// the session cookie travels with the same-origin request, and the server
// takes the Requester from it (BR-03). Lab 2's Development Requester list and
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
    // never surface that raw detail to the user (BR-28).
    return new ApiError(res.status, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories`);
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_URL}/api/systems`);
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
  const res = await fetch(`${API_URL}/api/tickets`, {
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

  const res = await fetch(`${API_URL}/api/tickets?${query.toString()}`);
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
  createdAt: string;
  updatedAt: string;
  attachments: TicketDetailAttachment[];
}

export async function fetchTicket(ticketId: number): Promise<TicketDetail> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}`);
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function addAttachmentToTicket(ticketId: number, file: File): Promise<TicketDetailAttachment> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
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
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments/${attachmentId}/remove`, {
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
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments/${attachmentId}/download`);
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) {
    throw new Error("Unable to connect to TokTickIT API");
  }
  
  const categoriesRes = await fetch(`${API_URL}/api/categories`);
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
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).user;
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
  if (!res.ok) throw await toApiError(res);
}

/** The signed-in user, or null when there is no session (401). */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/change-password`, {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).user;
}
