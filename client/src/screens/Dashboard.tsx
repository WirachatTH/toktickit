import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AdminDashboard,
  DashboardMetric,
  DashboardPlannedAction,
  DashboardTicket,
  fetchAdminDashboard,
  fetchRequesterDashboard,
  fetchStaffDashboard,
  Priority,
  RequesterDashboard,
  StaffDashboard,
  TicketStatus,
} from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { EmptyState } from "../components/EmptyState.js";
import { ErrorState } from "../components/ErrorState.js";
import { formatBangkok } from "../components/ActionsTaken.js";
import { ROUTES } from "../routes.js";

// Lab 4, Issue 6 — the Dashboard, every role's home (docs/lab-04/ui-spec.md §1.3,
// §1.4, §3; specification.md FR-10 to FR-15, BR-34 to BR-41, D-08).
//
// The screen shows exactly what the server counted (BR-34): every number on it
// comes from the API, and nothing is counted, filtered, or added here. Each card
// and row links to the list or ticket it summarises (BR-38).

type Data = { kind: "requester"; data: RequesterDashboard } | { kind: "staff"; data: StaffDashboard } | { kind: "admin"; data: AdminDashboard };
type State = "loading" | "loaded" | "refreshing" | "failure";

const TIME_ZONE = "Asia/Bangkok";
const updatedAt = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

async function load(role: string): Promise<Data> {
  if (role === "REQUESTER") return { kind: "requester", data: await fetchRequesterDashboard() };
  if (role === "ADMINISTRATOR") return { kind: "admin", data: await fetchAdminDashboard() };
  return { kind: "staff", data: await fetchStaffDashboard() };
}

export function Dashboard() {
  const { user } = useAuth();
  const [state, setState] = useState<State>("loading");
  const [data, setData] = useState<Data | null>(null);
  const [announce, setAnnounce] = useState("");
  const role = user?.role ?? "REQUESTER";

  const fetchData = useCallback(
    async (refreshing: boolean) => {
      setState(refreshing ? "refreshing" : "loading");
      setAnnounce("");
      try {
        setData(await load(role));
        setState("loaded");
        if (refreshing) setAnnounce("Dashboard updated");
      } catch {
        // Values from an earlier load are not shown as if current (ui-spec §3.5).
        setData(null);
        setState("failure");
      }
    },
    [role],
  );

  useEffect(() => {
    void fetchData(false);
  }, [fetchData]);

  // A link to a list on this screen (#my-planned-actions) only changes the hash;
  // the router does not scroll, and the list exists only once the data has come.
  // Scroll to it and move focus there then (ui-spec §3.2; PR #79 review).
  const { hash, key } = useLocation();
  useEffect(() => {
    if (state !== "loaded" || !hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    target.scrollIntoView?.({ block: "start" });
    target.focus({ preventScroll: true });
  }, [state, hash, key]);

  if (!user) return null;
  const firstName = user.name.split(" ")[0];
  const greeting = user.role === "REQUESTER" ? `Welcome, ${firstName}` : `Welcome back, ${firstName}`;

  return (
    <div className="zg-dashboard">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">{greeting}</h1>
          {data && <p className="small mb-0" style={{ color: "var(--zg-text-muted)" }}>Updated {updatedAt(data.data.generatedAt)} (Bangkok time)</p>}
        </div>
        {state !== "failure" && (
          <Button variant="secondary" onClick={() => void fetchData(true)} disabled={state === "loading"} busy={state === "refreshing"} busyLabel="Refreshing…">
            Refresh
          </Button>
        )}
      </div>
      <div className="zg-visually-hidden" role="status" aria-live="polite" aria-label="Dashboard updates">{announce}</div>

      {state === "loading" && <Skeleton cards={role === "REQUESTER" ? 4 : 6} />}
      {state === "failure" && (
        <ErrorState message="We couldn't load your dashboard." action={<Button variant="secondary" onClick={() => void fetchData(false)}>Retry</Button>} />
      )}
      {data && state !== "loading" && state !== "failure" && (
        data.kind === "requester" ? <RequesterView data={data.data} /> : <StaffView data={data.data} admin={data.kind === "admin"} />
      )}
    </div>
  );
}

// One placeholder per card the role will see: 4 for a Requester, 6 otherwise.
function Skeleton({ cards }: { cards: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading dashboard">
      <div className="zg-dashboard-cards mb-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="zg-metric-card zg-metric-card--skeleton" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="zg-skeleton-row" />
      ))}
    </div>
  );
}

// ui-spec §1.3 — one link per card, named with the label and value.
function MetricCard({ metric, helper, attention }: { metric: DashboardMetric; helper?: string; attention?: string }) {
  const flagged = Boolean(attention) && metric.value > 0;
  return (
    <div role="group" aria-label={metric.label} className={"zg-metric-card" + (flagged ? " zg-metric-card--attention" : "")}>
      <div className="zg-metric-card__label">{metric.label}</div>
      <div className="zg-metric-card__value">{metric.value}</div>
      {flagged && <div className="zg-metric-card__note">{attention}</div>}
      {helper && <div className="zg-metric-card__helper">{helper}</div>}
      <Link to={metric.href} className="zg-btn-tertiary btn px-0" aria-label={`View ${metric.label} (${metric.value})`}>
        View
      </Link>
    </div>
  );
}

// ui-spec §1.4 — a wrapping row of badge-plus-count links.
function CountStrip({ label, metrics, badge }: { label: string; metrics: DashboardMetric[]; badge: (m: DashboardMetric) => ReactNode }) {
  return (
    <div className="mb-3">
      <div className="zg-label">{label}</div>
      <ul className="zg-count-strip" aria-label={label}>
        {metrics.map((m) => (
          <li key={m.key}>
            <Link to={m.href} className="zg-count-strip__link" aria-label={`${m.label}: ${m.value} tickets`}>
              {badge(m)} <span className="zg-count-strip__value">{m.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListCard({ id, title, empty, viewAll, children, count }: { id: string; title: string; empty: string; viewAll?: { label: string; to: string }; children: ReactNode; count: number }) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="zg-card mb-3" aria-labelledby={headingId} tabIndex={-1}>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
        <h2 id={headingId} className="h6 mb-0">{title}</h2>
        {viewAll && (
          <Link to={viewAll.to} className="zg-btn-tertiary btn px-0" aria-label={viewAll.label}>
            View all
          </Link>
        )}
      </div>
      {count === 0 ? <p className="mb-0 small" style={{ color: "var(--zg-text-muted)" }}>{empty}</p> : <ul className="zg-dashboard-list">{children}</ul>}
    </section>
  );
}

function TicketRow({ ticket }: { ticket: DashboardTicket }) {
  return (
    <li>
      <Link to={ticket.href} className="zg-dashboard-row" aria-label={`${ticket.ticketNumber}: ${ticket.summary}`}>
        <span className="zg-dashboard-row__number">{ticket.ticketNumber}</span>
        <span className="zg-dashboard-row__summary" title={ticket.summary}>{ticket.summary}</span>
        <Badge kind="status" value={ticket.currentStatus as TicketStatus} />
        <span className="zg-dashboard-row__time">{formatBangkok(ticket.resolvedAt ?? ticket.updatedAt)}</span>
      </Link>
    </li>
  );
}

function PlannedRow({ action }: { action: DashboardPlannedAction }) {
  const when = formatBangkok(action.actionAt);
  return (
    <li>
      <Link to={action.href} className="zg-dashboard-row" aria-label={`${when}: ${action.description} (${action.ticket.ticketNumber})`}>
        <span className="zg-dashboard-row__time">{when}</span>
        <span className="zg-dashboard-row__summary" title={action.description}>{action.description}</span>
        <span className="zg-dashboard-row__number">{action.ticket.ticketNumber}</span>
      </Link>
    </li>
  );
}

function QuickActions({ links }: { links: { to: string; label: string; note?: string }[] }) {
  return (
    <section className="zg-card mb-3" aria-label="Quick actions">
      <h2 className="h6 mb-2">Quick actions</h2>
      <ul className="zg-dashboard-list">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="zg-quick-action">
              <span className="zg-quick-action__label">{l.label}</span>
              {l.note && <span className="zg-quick-action__note">{l.note}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SUPERSET_HELP = "Bangkok day; the queue opens newest first";

function StaffView({ data, admin }: { data: StaffDashboard | AdminDashboard; admin: boolean }) {
  const users = admin ? (data as AdminDashboard).users : [];
  return (
    <>
      {admin && <p className="mb-3"><span className="zg-pill zg-pill--readonly">Ticket metrics are read-only for Administrators</span></p>}
      <div className="zg-dashboard-cards mb-4">
        {data.metrics.map((m) => (
          <MetricCard key={m.key} metric={m} helper={m.key === "createdToday" || m.key === "resolvedToday" ? SUPERSET_HELP : undefined} />
        ))}
      </div>
      <CountStrip label="By status" metrics={data.byStatus} badge={(m) => <Badge kind="status" value={m.key as TicketStatus} />} />
      <CountStrip label="Unresolved by IT Priority" metrics={data.byItPriority} badge={(m) => <Badge kind="priority" value={m.key as Priority} />} />
      <div className="zg-dashboard-layout">
        <div className="zg-dashboard-main">
          <ListCard id="my-planned-actions" title="My planned actions" empty="No planned actions assigned to you." count={data.lists.myPlannedActions.length}>
            {data.lists.myPlannedActions.map((a) => <PlannedRow key={a.actionId} action={a} />)}
          </ListCard>
          <ListCard
            id="urgent-tickets"
            title="Urgent tickets"
            empty="No urgent tickets right now."
            viewAll={{ label: "View all urgent tickets", to: `${ROUTES.staffQueue}?status=UNRESOLVED&itPriority=HIGH&sort=createdAt&order=asc` }}
            count={data.lists.urgent.length}
          >
            {data.lists.urgent.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ListCard>
          <ListCard
            id="recently-updated"
            title="Recently updated"
            empty="No tickets were updated recently."
            viewAll={{ label: "View all recently updated tickets", to: `${ROUTES.staffQueue}?sort=updatedAt&order=desc` }}
            count={data.lists.recentlyUpdated.length}
          >
            {data.lists.recentlyUpdated.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ListCard>
        </div>
        <div className="zg-dashboard-side">
          {admin && (
            <section className="zg-card mb-3" aria-label="User accounts">
              <h2 className="h6 mb-2">User accounts</h2>
              <dl className="zg-user-counts">
                {users.map((u) => (
                  <div key={u.key} className="zg-user-counts__row">
                    <dt>{u.label}</dt>
                    <dd>
                      <span className="zg-user-counts__value">{u.value}</span>
                      <Link to={u.href} className="zg-btn-tertiary btn px-0 ms-2" aria-label={`View ${u.label} (${u.value})`}>View</Link>
                    </dd>
                  </div>
                ))}
              </dl>
              <Link to={ROUTES.adminUsers} className="zg-btn-tertiary btn px-0">Manage users</Link>
            </section>
          )}
          <QuickActions
            links={
              admin
                ? [{ to: ROUTES.adminUsers, label: "User Management" }, { to: ROUTES.staffQueue, label: "Ticket Queue" }]
                : [
                    { to: ROUTES.staffQueue, label: "Ticket Queue" },
                    { to: `${ROUTES.staffQueue}?owner=unassigned`, label: "Unassigned tickets" },
                    { to: `${ROUTES.staffQueue}?owner=me`, label: "My tickets" },
                  ]
            }
          />
        </div>
      </div>
    </>
  );
}

function RequesterView({ data }: { data: RequesterDashboard }) {
  const brandNew = data.metrics.every((m) => m.value === 0) && data.lists.recentlyUpdated.length === 0;
  return (
    <>
      {brandNew && (
        <section className="mb-4" aria-label="Getting started">
          <EmptyState message="You haven't submitted any requests yet." action={<Link to={ROUTES.create} className="btn zg-btn-primary">Create Ticket</Link>} />
        </section>
      )}
      <div className="zg-dashboard-cards mb-4">
        {data.metrics.map((m) => (
          <MetricCard key={m.key} metric={m} attention={m.key === "waitingForMe" ? "Needs your reply" : undefined} />
        ))}
      </div>
      <div className="zg-dashboard-layout">
        <div className="zg-dashboard-main">
          <ListCard
            id="needs-attention"
            title="Needs your attention"
            empty="Nothing needs your reply right now."
            viewAll={{ label: "View all tickets waiting for you", to: `${ROUTES.list}?status=WAITING_FOR_REQUESTER` }}
            count={data.lists.needsAttention.length}
          >
            {data.lists.needsAttention.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ListCard>
          <ListCard
            id="recently-updated"
            title="Recently updated"
            empty="No tickets were updated recently."
            viewAll={{ label: "View all recently updated tickets", to: `${ROUTES.list}?sort=updatedAt&order=desc` }}
            count={data.lists.recentlyUpdated.length}
          >
            {data.lists.recentlyUpdated.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ListCard>
          <ListCard
            id="recently-resolved"
            title="Recently resolved (last 7 days)"
            empty="No tickets were resolved in the last 7 days."
            viewAll={{ label: "View all resolved tickets", to: `${ROUTES.list}?status=RESOLVED` }}
            count={data.lists.recentlyResolved.length}
          >
            {data.lists.recentlyResolved.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ListCard>
        </div>
        <div className="zg-dashboard-side">
          <QuickActions
            links={[
              { to: ROUTES.create, label: "Create Ticket", note: "Submit a new request" },
              { to: ROUTES.list, label: "My Tickets", note: "Track your requests" },
            ]}
          />
        </div>
      </div>
    </>
  );
}
