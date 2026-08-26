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
