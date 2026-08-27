const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

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
// ---------------------------------------------------------------------------
// Lab 2, Issue 4 — Development Requester reference data (api-spec.md §3,
// BR-06/BR-07). The header helper here establishes the one place every
// later Requester-scoped call (Create Ticket, My Tickets, Ticket Detail,
// Attachments) builds its X-Dev-Requester-Id header from.
// ---------------------------------------------------------------------------

export interface Requester {
  id: number;
  name: string;
  email: string;
}

/** Testing-only identity header (BR-07) — never a substitute for real auth. */
export function requesterHeaders(requesterId: number): Record<string, string> {
  return { "X-Dev-Requester-Id": String(requesterId) };
}

export async function fetchActiveRequesters(): Promise<Requester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) {
    throw new Error("Unable to load Development Requesters");
  }
  return res.json();
}

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
export type TicketStatus = "NEW";

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

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError(
      res.status,
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? "Something went wrong. Please try again.",
      body?.error?.fields
    );
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

export async function createTicket(requesterId: number, input: NewTicketInput): Promise<Ticket> {
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
    headers: requesterHeaders(requesterId),
    body: formData,
  });

  if (!res.ok) throw await toApiError(res);
  return res.json();
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
