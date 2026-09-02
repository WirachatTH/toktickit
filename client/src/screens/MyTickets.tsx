import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchCategories,
  fetchRelatedSystems,
  fetchTickets,
  Category,
  RelatedSystem,
  RequestedPriority,
  SortOrder,
  TicketListItem,
  TicketSortField,
} from "../api.js";
import { useRequester } from "../context/RequesterContext.js";
import { Select } from "../components/Select.js";
import { TextInput } from "../components/TextInput.js";
import { Button } from "../components/Button.js";
import { Badge } from "../components/Badge.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { EmptyState } from "../components/EmptyState.js";
import { ErrorState } from "../components/ErrorState.js";
import { ROUTES } from "../routes.js";

// My Tickets (ui-spec.md §6.4, specification.md BR-12/BR-14-19, api-spec.md
// §5, issues.md Issue 7). Search is debounced; every other control (filter,
// sort, page) refetches immediately. Changing search/filter/sort always
// resets to page 1 — staying on, say, page 3 of a filter that now has only
// one page of results would otherwise silently show "no results" instead of
// the results that do exist.

const SEARCH_DEBOUNCE_MS = 300;

type SortValue = `${TicketSortField}:${SortOrder}`;

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "updatedAt:asc", label: "Least recently updated" },
  { value: "ticketNumber:asc", label: "Ticket Number (A–Z)" },
  { value: "ticketNumber:desc", label: "Ticket Number (Z–A)" },
  { value: "summary:asc", label: "Summary (A–Z)" },
  { value: "summary:desc", label: "Summary (Z–A)" },
  { value: "requestedPriority:asc", label: "Priority (Low–High)" },
  { value: "requestedPriority:desc", label: "Priority (High–Low)" },
];
const DEFAULT_SORT: SortValue = "createdAt:desc";

type ListState = "loading" | "loaded" | "failure";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MyTickets() {
  const { requester } = useRequester();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [systems, setSystems] = useState<RelatedSystem[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [sortValue, setSortValue] = useState<SortValue>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [listState, setListState] = useState<ListState>("loading");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalItems: 0, totalPages: 0 });
  const [retryToken, setRetryToken] = useState(0);

  // Reference data for the filter dropdowns — failure here isn't fatal to
  // the screen (the list itself can still load), so it's tracked separately
  // from listState and just leaves those two dropdowns empty on failure.
  useEffect(() => {
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([cats, syss]) => {
        setCategories(cats);
        setSystems(syss);
      })
      .catch(() => {
        // Filters degrade to "All" only; the ticket list load below is
        // independent and still tried.
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!requester) return;
    let cancelled = false;
    setListState("loading");
    const [sort, order] = sortValue.split(":") as [TicketSortField, SortOrder];

    fetchTickets(requester.id, {
      search: debouncedSearch || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      relatedSystemId: relatedSystemId ? Number(relatedSystemId) : undefined,
      requestedPriority: (requestedPriority as RequestedPriority) || undefined,
      sort,
      order,
      page,
    })
      .then((res) => {
        if (cancelled) return;
        setTickets(res.data);
        setPagination(res.pagination);
        setListState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setListState("failure");
      });

    return () => {
      cancelled = true;
    };
    // requester?.id is the live-reload trigger for AC-10/BR-09 (switching the
    // selected Requester reloads this list — see UI-09).
  }, [requester?.id, debouncedSearch, categoryId, relatedSystemId, requestedPriority, sortValue, page, retryToken]);

  function resetToFirstPage() {
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    resetToFirstPage();
  }

  function handleClearFilters() {
    setSearchInput("");
    setDebouncedSearch("");
    setCategoryId("");
    setRelatedSystemId("");
    setRequestedPriority("");
    setSortValue(DEFAULT_SORT);
    setPage(1);
  }

  const hasActiveFilters = Boolean(
    debouncedSearch || categoryId || relatedSystemId || requestedPriority || sortValue !== DEFAULT_SORT
  );

  // A plain function, not a component — it's invoked inline as
  // `{renderFilterControls("mt")}` rather than used as JSX (`<X/>`), so
  // React reconciles the elements it returns as part of MyTickets' own
  // render output instead of treating them as a separate component
  // boundary that would remount on every render. Parameterized by
  // `idPrefix` because both the desktop toolbar's and the mobile panel's
  // copies can exist in the DOM at once (CSS `d-none` hides one, it
  // doesn't remove it) — one fixed set of ids would duplicate them the
  // moment the mobile panel is opened.
  function renderFilterControls(idPrefix: string) {
    return (
      <>
        <div className="mb-3 mb-md-0">
          <label htmlFor={`${idPrefix}-category`} className="zg-label">
            Category
          </label>
          <Select
            id={`${idPrefix}-category`}
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); resetToFirstPage(); }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="mb-3 mb-md-0">
          <label htmlFor={`${idPrefix}-system`} className="zg-label">
            Related System
          </label>
          <Select
            id={`${idPrefix}-system`}
            value={relatedSystemId}
            onChange={(e) => { setRelatedSystemId(e.target.value); resetToFirstPage(); }}
          >
            <option value="">All Systems</option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="mb-3 mb-md-0">
          <label htmlFor={`${idPrefix}-priority`} className="zg-label">
            Priority
          </label>
          <Select
            id={`${idPrefix}-priority`}
            value={requestedPriority}
            onChange={(e) => { setRequestedPriority(e.target.value); resetToFirstPage(); }}
          >
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </div>
        <div className="mb-3 mb-md-0">
          <label htmlFor={`${idPrefix}-sort`} className="zg-label">
            Sort
          </label>
          <Select
            id={`${idPrefix}-sort`}
            value={sortValue}
            onChange={(e) => { setSortValue(e.target.value as SortValue); resetToFirstPage(); }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <h1 className="h3 mb-0">My Tickets</h1>
        <Button variant="primary" onClick={() => navigate(ROUTES.create)}>
          Create Ticket
        </Button>
      </div>

      {/* Desktop/tablet toolbar */}
      <div className="d-none d-md-flex align-items-end gap-3 flex-wrap mb-4">
        <div style={{ minWidth: 220 }}>
          <label htmlFor="mt-search" className="zg-label">
            Search
          </label>
          <TextInput
            id="mt-search"
            placeholder="Ticket number or summary…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        {renderFilterControls("mt")}
        <Button variant="tertiary" onClick={handleClearFilters} disabled={!hasActiveFilters}>
          Clear filters
        </Button>
      </div>

      {/* Mobile toolbar: search bar + a toggle that reveals the same filter
          controls below it, standing in for a bottom sheet (no such
          component exists in the design system yet). */}
      <div className="d-md-none mb-4">
        <div className="d-flex gap-2 mb-2">
          <div className="flex-grow-1">
            <label htmlFor="mt-search-mobile" className="zg-label">
              Search
            </label>
            <TextInput
              id="mt-search-mobile"
              placeholder="Ticket number or summary…"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            className="align-self-end"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mt-mobile-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            Filters
          </Button>
        </div>
        {mobileFiltersOpen && (
          <div id="mt-mobile-filters" className="zg-mobile-filters">
            {renderFilterControls("mt-mobile")}
            <Button variant="tertiary" onClick={handleClearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {listState === "loading" && <LoadingSpinner label="Loading tickets…" />}

      {listState === "failure" && (
        <ErrorState
          message="Unable to load your tickets. Please try again."
          action={
            <Button variant="secondary" onClick={() => setRetryToken((t) => t + 1)}>
              Retry
            </Button>
          }
        />
      )}

      {listState === "loaded" && tickets.length === 0 && !hasActiveFilters && (
        <EmptyState
          message="You haven't created any tickets yet."
          action={
            <Button variant="primary" onClick={() => navigate(ROUTES.create)}>
              Create Ticket
            </Button>
          }
        />
      )}

      {listState === "loaded" && tickets.length === 0 && hasActiveFilters && (
        <EmptyState
          message="No tickets match your filters."
          action={
            <Button variant="tertiary" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          }
        />
      )}

      {listState === "loaded" && tickets.length > 0 && (
        <>
          {/* Desktop/tablet table */}
          <div className="d-none d-md-block table-responsive">
            <table className="table zg-ticket-table" data-testid="my-tickets-table">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Category
                  </th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Priority
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    role="link"
                    tabIndex={0}
                    className="zg-ticket-row"
                    onClick={() => navigate(ROUTES.detail(t.id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") navigate(ROUTES.detail(t.id));
                    }}
                  >
                    <td>{t.ticketNumber}</td>
                    <td>{t.summary}</td>
                    <td className="d-none d-lg-table-cell">{t.categoryName}</td>
                    <td className="d-none d-lg-table-cell">
                      <Badge kind="priority" value={t.requestedPriority} />
                    </td>
                    <td>
                      <Badge kind="status" value={t.currentStatus} />
                    </td>
                    <td>{formatDateTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none" data-testid="my-tickets-cards">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="zg-ticket-card"
                role="link"
                tabIndex={0}
                onClick={() => navigate(ROUTES.detail(t.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate(ROUTES.detail(t.id));
                }}
              >
                <div className="d-flex justify-content-between align-items-start">
                  <strong>{t.ticketNumber}</strong>
                  <Badge kind="status" value={t.currentStatus} />
                </div>
                <div className="zg-ticket-card__summary">{t.summary}</div>
                <div className="zg-ticket-card__meta">
                  <span>{t.categoryName}</span>
                  <Badge kind="priority" value={t.requestedPriority} />
                  <span>{formatDateTime(t.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>

          <nav className="zg-pagination" aria-label="Ticket list pagination">
            <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </Button>

            <span className="d-md-none">
              Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
            </span>

            <span className="d-none d-md-flex gap-1">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((n) => (
                <Button
                  key={n}
                  variant={n === pagination.page ? "primary" : "tertiary"}
                  onClick={() => setPage(n)}
                  aria-current={n === pagination.page || undefined}
                >
                  {n}
                </Button>
              ))}
            </span>

            <Button
              variant="secondary"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>

            <span className="d-none d-md-inline zg-pagination__count">
              {pagination.totalItems} ticket{pagination.totalItems === 1 ? "" : "s"} · {pagination.pageSize} per page
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
