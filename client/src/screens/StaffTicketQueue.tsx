import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Category,
  fetchAssignableUsers,
  fetchCategories,
  fetchStaffQueue,
  PersonRef,
  QueueQuery,
  QueueResponse,
  QueueRow,
  TicketStatus,
} from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Select } from "../components/Select.js";
import { TextInput } from "../components/TextInput.js";
import { EmptyState } from "../components/EmptyState.js";
import { ErrorState } from "../components/ErrorState.js";
import { staffTicketPath } from "../routes.js";

// Lab 3, Issue 7 — the IT Staff Ticket Queue (docs/lab-03/ui-spec.md §6,
// FR-21 to FR-24, BR-61 to BR-67).
//
// The filter state lives in the URL query, so Back and a refresh restore it.
// Every change rewrites the URL; the URL drives the request; the response's
// `appliedQuery` (the server's own reading after defaults and clamping, BR-66)
// is written back, so what the controls show is always what was applied.
//
// Hiding nothing here protects anything: the server refuses Requesters and
// re-checks every action (BR-27). The Administrator view is the same table with
// a Read-only pill (BR-21); acting on tickets happens on the detail screen.

const SEARCH_DEBOUNCE_MS = 300;
const STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

// ui-spec §6.1 — each option is exactly one sort + order pair (BR-64).
const SORT_PRESETS: { value: string; label: string }[] = [
  { value: "itPriority:desc", label: "Priority (default)" },
  { value: "createdAt:desc", label: "Newest" },
  { value: "createdAt:asc", label: "Oldest" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "ticketNumber:asc", label: "Ticket number" },
  { value: "status:asc", label: "Status" },
];
const DEFAULT_SORT = "itPriority:desc";

// The URL keys the server reads, and the value each one has when it is absent.
const DEFAULTS: Record<string, string> = {
  search: "", status: "ACTIVE", itPriority: "", categoryId: "", owner: "any", appearsResolved: "", sort: "itPriority", order: "desc", page: "1", pageSize: "10",
};
const FILTER_KEYS = ["search", "status", "itPriority", "categoryId", "owner", "appearsResolved"] as const;

// The applied query as URL parameters, leaving out every default.
function toParams(applied: QueueQuery): Record<string, string> {
  const raw: Record<string, string> = {
    search: applied.search,
    status: applied.status,
    itPriority: applied.itPriority ?? "",
    categoryId: applied.categoryId === null ? "" : String(applied.categoryId),
    owner: String(applied.owner),
    appearsResolved: applied.appearsResolved ? "true" : "",
    sort: applied.sort,
    order: applied.order,
    page: String(applied.page),
    pageSize: String(applied.pageSize),
  };
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) => value !== DEFAULTS[key]));
}

function readParams(searchParams: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(DEFAULTS)) {
    const value = searchParams.get(key);
    if (value !== null && value !== "" && value !== DEFAULTS[key]) out[key] = value;
  }
  return out;
}

// The page numbers to show (PR #57 review): every page up to seven; beyond
// that the first, the last, and the pages either side of the current one,
// with "gap" where pages are skipped — unless the gap is a single page, which
// is shown instead, since a marker would take the same room.
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [...new Set([1, current - 1, current, current + 1, total])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const n of pages) {
    if (n - previous === 2) out.push(previous + 1);
    else if (n - previous > 2) out.push("gap");
    out.push(n);
    previous = n;
  }
  return out;
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
const fullDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type LoadState = "loading" | "loaded" | "failure";

export function StaffTicketQueue() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMINISTRATOR";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => readParams(searchParams), [searchParams]);
  const paramsKey = new URLSearchParams(params).toString();
  // The URL as of the latest render. The router applies URL changes as a
  // transition, so a callback that runs later (the delayed search) must read
  // this, never a copy captured earlier — that stale copy is what put the old
  // filters back after Clear filters (PR #57 review).
  const latestParams = useRef(params);
  latestParams.current = params;

  const [state, setState] = useState<LoadState>("loading");
  const [result, setResult] = useState<QueueResponse | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [people, setPeople] = useState<PersonRef[]>([]);
  const [searchInput, setSearchInput] = useState(params.search ?? "");
  // Open from the start when the URL already filters or sorts the queue, so a
  // dashboard drill-down shows its filter on mobile too (Lab 4, Issue 8).
  const [filtersOpen, setFiltersOpen] = useState(() => [...FILTER_KEYS, "sort"].some((key) => key !== "search" && searchParams.has(key)));

  // Reference data for the filters; a failure only leaves those lists short.
  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
    fetchAssignableUsers().then(setPeople).catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchStaffQueue(params)
      .then((res) => {
        if (cancelled) return;
        // BR-67: a page past the last is empty although tickets exist. Go to
        // the last page rather than calling that "no tickets" (PR #57 review).
        if (res.data.length === 0 && res.pagination.totalItems > 0) {
          const lastPage = toParams(res.appliedQuery);
          delete lastPage.page;
          if (res.pagination.totalPages > 1) lastPage.page = String(res.pagination.totalPages);
          // Already there: the rows and the count disagreed (tickets changed
          // between the two queries). Navigating would change nothing and leave
          // the skeleton up for good, so show the page with a Retry instead.
          if (new URLSearchParams(lastPage).toString() !== paramsKey) {
            setSearchParams(lastPage, { replace: true });
            return;
          }
        }
        setResult(res);
        setState("loaded");
        // Show what the server applied (BR-66); replace, so Back still works.
        const applied = new URLSearchParams(toParams(res.appliedQuery)).toString();
        if (applied !== paramsKey) setSearchParams(toParams(res.appliedQuery), { replace: true });
      })
      .catch(() => !cancelled && setState("failure"));
    return () => {
      cancelled = true;
    };
    // paramsKey captures every value in params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, retryToken]);

  // The box follows the URL (Clear filters, Back, the server trimming it).
  useEffect(() => setSearchInput(params.search ?? ""), [params.search]);

  // Debounced search; it starts over at page 1 like every other filter.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === (params.search ?? "")) return;
    const timer = setTimeout(() => {
      // Clear filters empties this box too, which starts this timer. By the
      // time it fires the URL already has no search, and pushing it again would
      // add a second history entry for one click (PR #57 review 2).
      if (trimmed === (latestParams.current.search ?? "")) return;
      update({ search: trimmed });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function update(changes: Record<string, string>, keepPage = false) {
    const next: Record<string, string> = { ...latestParams.current, ...changes };
    if (!keepPage) delete next.page;
    for (const [key, value] of Object.entries(next)) if (value === "" || value === DEFAULTS[key]) delete next[key];
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchInput("");
    setSearchParams({});
  }

  const applied = result?.appliedQuery;
  const hasFilters = applied ? FILTER_KEYS.some((k) => String(toParams(applied)[k] ?? "") !== "") : Object.keys(params).some((k) => (FILTER_KEYS as readonly string[]).includes(k));
  const sortValue = `${params.sort ?? DEFAULTS.sort}:${params.order ?? DEFAULTS.order}`;
  // What is on screen: the latest answer, kept — dimmed — while the next one
  // loads (PR #57 review), so a filter change doesn't flash a skeleton. The
  // skeleton is only for the first load, when there is nothing to keep.
  const shown = state === "failure" ? null : result;
  const reloading = state === "loading" && shown !== null;
  const rows = shown?.data ?? [];
  const pagination = shown?.pagination;
  // Empty and no-results are about the whole queue, not this page (BR-67): an
  // empty page while tickets exist is either a jump to the last page or, if the
  // rows and the count disagreed, the "changed while loading" notice below.
  const nothingMatches = shown !== null && (pagination?.totalItems ?? 0) === 0;

  function filterControls(prefix: string) {
    return (
      <>
        <div>
          <label htmlFor={`${prefix}-status`} className="zg-label">Status</label>
          <Select id={`${prefix}-status`} value={params.status ?? "ACTIVE"} onChange={(e) => update({ status: e.target.value })}>
            <option value="ACTIVE">Active</option>
            {/* Lab 4 D-13 — the Unresolved group the dashboard drills down to. */}
            <option value="UNRESOLVED">Unresolved</option>
            <option value="ALL">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${prefix}-priority`} className="zg-label">IT Priority</label>
          <Select id={`${prefix}-priority`} value={params.itPriority ?? ""} onChange={(e) => update({ itPriority: e.target.value })}>
            <option value="">Any</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </div>
        <div>
          <label htmlFor={`${prefix}-category`} className="zg-label">Category</label>
          <Select id={`${prefix}-category`} value={params.categoryId ?? ""} onChange={(e) => update({ categoryId: e.target.value })}>
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${prefix}-owner`} className="zg-label">Owner</label>
          <Select id={`${prefix}-owner`} value={params.owner ?? "any"} onChange={(e) => update({ owner: e.target.value })}>
            <option value="any">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {/* An Administrator cannot claim tickets, so "Me" is not offered (ui-spec §6.1). */}
            {!isAdmin && <option value="me">Me</option>}
            {people.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="d-flex align-items-center gap-2 zg-queue-check">
          <input
            id={`${prefix}-resolved`}
            type="checkbox"
            checked={params.appearsResolved === "true"}
            onChange={(e) => update({ appearsResolved: e.target.checked ? "true" : "" })}
          />
          <label htmlFor={`${prefix}-resolved`} className="mb-0">Requester says resolved</label>
        </div>
        <div>
          <label htmlFor={`${prefix}-sort`} className="zg-label">Sort</label>
          <Select
            id={`${prefix}-sort`}
            value={sortValue}
            onChange={(e) => {
              const [sort, order] = e.target.value.split(":");
              update(e.target.value === DEFAULT_SORT ? { sort: "", order: "" } : { sort, order });
            }}
          >
            {SORT_PRESETS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <Button variant="tertiary" onClick={clearFilters} disabled={!hasFilters && Object.keys(params).length === 0}>
          Clear filters
        </Button>
      </>
    );
  }

  function ownerCell(owner: PersonRef | null) {
    if (!owner) return <em style={{ color: "var(--zg-text-muted)" }}>Unassigned</em>;
    return (
      <span className="d-inline-flex align-items-center gap-1 flex-wrap">
        <span>{owner.name}</span>
        {owner.id === user?.id && <span className="zg-pill zg-pill--you">You</span>}
        {!owner.isActive && <span className="zg-pill zg-pill--inactive">Inactive</span>}
      </span>
    );
  }

  function priorityCell(t: QueueRow) {
    return (
      <>
        <Badge kind="priority" value={t.itPriority} />
        {t.requestedPriority !== t.itPriority && (
          <div className="small" style={{ color: "var(--zg-text-muted)" }}>Requested: {t.requestedPriority}</div>
        )}
      </>
    );
  }

  const resolvedPill = (t: QueueRow) =>
    t.requesterResolvedAt && (
      <div>
        <span className="zg-pill zg-pill--resolved"><span aria-hidden="true">✓ </span>Requester: appears resolved</span>
      </div>
    );

  const open = (t: QueueRow) => navigate(staffTicketPath(t.id));
  const first = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const last = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.totalItems) : 0;

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <h1 className="h3 mb-0">Ticket Queue</h1>
        {isAdmin && <span className="zg-pill zg-pill--readonly"><span aria-hidden="true">🔒 </span>Read-only</span>}
      </div>

      {/* Desktop and tablet toolbar */}
      <div className="d-none d-md-flex align-items-end gap-3 flex-wrap mb-4">
        <div style={{ minWidth: 260 }}>
          <label htmlFor="queue-search" className="zg-label">Search</label>
          <TextInput id="queue-search" placeholder="Search ticket number, summary, or requester" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        {filterControls("queue")}
      </div>

      {/* Mobile: search, and the same filters behind a toggle (Lab 2 pattern). */}
      <div className="d-md-none mb-4">
        <div className="d-flex gap-2 mb-2">
          <div className="flex-grow-1">
            <label htmlFor="queue-search-mobile" className="zg-label">Search</label>
            <TextInput id="queue-search-mobile" placeholder="Search ticket number, summary, or requester" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <Button variant="secondary" className="align-self-end" aria-expanded={filtersOpen} aria-controls="queue-mobile-filters" onClick={() => setFiltersOpen((o) => !o)}>
            Filters
          </Button>
        </div>
        {filtersOpen && (
          <div id="queue-mobile-filters" className="zg-mobile-filters">
            {filterControls("queue-mobile")}
          </div>
        )}
      </div>

      {state === "loading" && !shown && (
        <div aria-busy="true" role="status" aria-label="Loading tickets">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="zg-skeleton-row" />
          ))}
        </div>
      )}

      {state === "failure" && (
        <ErrorState
          message="Unable to load the queue. Please try again."
          action={<Button variant="secondary" onClick={() => setRetryToken((t) => t + 1)}>Retry</Button>}
        />
      )}

      {shown && (
      <div data-testid="queue-results" aria-busy={reloading} className={reloading ? "zg-queue-results--reloading" : undefined}>
      {nothingMatches && !hasFilters && (
        <EmptyState message="The queue is clear — there are no active tickets." />
      )}

      {nothingMatches && hasFilters && (
        <div data-testid="queue-no-results">
          <EmptyState
            message="No tickets match your search or filters."
            action={<Button variant="tertiary" onClick={clearFilters}>Clear filters</Button>}
          />
        </div>
      )}

      {rows.length === 0 && !nothingMatches && (
        <ErrorState
          message="The queue changed while it was loading."
          action={<Button variant="secondary" onClick={() => setRetryToken((t) => t + 1)}>Retry</Button>}
        />
      )}

      {rows.length > 0 && (
        <>
          <div className="d-none d-md-block table-responsive">
            <table className="table zg-ticket-table zg-queue-table" data-testid="queue-table">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Summary</th>
                  <th scope="col" className="d-none d-lg-table-cell">Category</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="zg-ticket-row" onClick={() => open(t)}>
                    <td>
                      <Link to={staffTicketPath(t.id)} onClick={(e) => e.stopPropagation()}>{t.ticketNumber}</Link>
                    </td>
                    <td className="zg-queue-summary">
                      <div className="text-truncate" title={t.summary}>{t.summary}</div>
                      <div className="small" style={{ color: "var(--zg-text-muted)" }}>
                        {t.requester.name}
                        <span className="d-lg-none"> · {t.category.name}</span>
                      </div>
                    </td>
                    <td className="d-none d-lg-table-cell">{t.category.name}</td>
                    <td>{priorityCell(t)}</td>
                    <td>
                      <Badge kind="status" value={t.currentStatus} />
                      {resolvedPill(t)}
                    </td>
                    <td>{ownerCell(t.owner)}</td>
                    <td>
                      <span title={fullDate(t.updatedAt)}>{relativeTime(t.updatedAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none" data-testid="queue-cards">
            {rows.map((t) => (
              // A real link (PR #57 review): Enter opens it, and it can be opened
              // in a new tab like any link. (Space scrolls, as it does for links.)
              <Link key={t.id} to={staffTicketPath(t.id)} className="zg-ticket-card zg-ticket-card--link">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <strong>{t.ticketNumber}</strong>
                  <Badge kind="status" value={t.currentStatus} />
                </div>
                <div className="zg-ticket-card__summary">{t.summary}</div>
                <div className="zg-ticket-card__meta">
                  <Badge kind="priority" value={t.itPriority} />
                  <span>{ownerCell(t.owner)}</span>
                  <span title={fullDate(t.updatedAt)}>{relativeTime(t.updatedAt)}</span>
                </div>
                {resolvedPill(t)}
              </Link>
            ))}
          </div>

          {pagination && (
            <nav className="zg-pagination" aria-label="Queue pagination">
              <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => update({ page: String(pagination.page - 1) }, true)}>
                Prev
              </Button>
              <span className="d-md-none">Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span>
              <span className="d-none d-md-flex gap-1" data-testid="page-numbers">
                {pageWindow(pagination.page, pagination.totalPages).map((n, i) =>
                  n === "gap" ? (
                    <span key={`gap-${i}`} className="zg-pagination__gap" aria-hidden="true">…</span>
                  ) : (
                    <Button key={n} variant={n === pagination.page ? "primary" : "tertiary"} aria-current={n === pagination.page || undefined} onClick={() => update({ page: String(n) }, true)}>
                      {n}
                    </Button>
                  ),
                )}
              </span>
              <Button variant="secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => update({ page: String(pagination.page + 1) }, true)}>
                Next
              </Button>
              <span className="d-none d-md-inline zg-pagination__count">
                Showing {first}–{last} of {pagination.totalItems}
              </span>
            </nav>
          )}
        </>
      )}
      </div>
      )}
    </div>
  );
}
