import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  changeItPriority,
  changeOwner,
  changeStatus,
  fetchAssignableUsers,
  fetchStaffTicket,
  PersonRef,
  Priority,
  StaffTicketDetail as Detail,
  TicketDetailAttachment,
  TicketStatus,
} from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Select } from "../components/Select.js";
import { TextInput } from "../components/TextInput.js";
import { TextArea } from "../components/TextArea.js";
import { Modal } from "../components/Modal.js";
import { ErrorState } from "../components/ErrorState.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { DiscussionPanel } from "../components/DiscussionPanel.js";
import { ActionsTaken } from "../components/ActionsTaken.js";
import { ROUTES } from "../routes.js";

// Lab 3, Issue 8 — IT Staff Ticket Detail (docs/lab-03/ui-spec.md §7, FR-25 to
// FR-30, BR-29 to BR-48).
//
// The screen renders from what the server says the caller may do
// (`capabilities`, `permittedTransitions`), and every save sends the owner and
// status it is showing, so a change someone else made meanwhile is refused
// (409 STALE_STATE) and the screen reloads instead of overwriting it. The
// server re-checks everything; nothing here is the boundary (BR-27).

const STALE_MESSAGE = "This ticket was changed by someone else. It has been reloaded.";
const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
const fullDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// BR-46 — these targets are confirmed in a dialog; the text each needs (BR-44, BR-45).
const CONFIRM: Partial<Record<TicketStatus, { title: string; button: string; text?: { field: "resolutionSummary" | "reason"; label: string; min: number; max: number } }>> = {
  RESOLVED: { title: "Resolve this ticket?", button: "Resolve ticket", text: { field: "resolutionSummary", label: "Resolution summary", min: 10, max: 2000 } },
  CLOSED: { title: "Close this ticket?", button: "Close ticket" },
  CANCELLED: { title: "Cancel this ticket?", button: "Cancel ticket", text: { field: "reason", label: "Reason", min: 10, max: 1000 } },
  REOPENED: { title: "Reopen this ticket?", button: "Reopen ticket", text: { field: "reason", label: "Reason", min: 10, max: 1000 } },
};

type LoadState = "loading" | "loaded" | "not-found" | "failure";

function ReadOnly({ id, label, value, multiline = false }: { id: string; label: string; value: string; multiline?: boolean }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="zg-label">{label}</label>
      {multiline ? <TextArea id={id} readOnly value={value} rows={4} /> : <TextInput id={id} readOnly value={value} />}
    </div>
  );
}

export function StaffTicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { user } = useAuth();
  const isStaff = user?.role === "IT_STAFF";

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<Detail | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [people, setPeople] = useState<PersonRef[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Bumped when a status change posts a reason as a Public Comment, so the
  // conversation shows it (BR-45); otherwise the panel keeps its drafts.
  const [threadVersion, setThreadVersion] = useState(0);

  const [ownerChoice, setOwnerChoice] = useState("");
  const [priorityChoice, setPriorityChoice] = useState<Priority>("MEDIUM");
  const [statusChoice, setStatusChoice] = useState<TicketStatus | "">("");
  const [controlError, setControlError] = useState<{ control: "owner" | "priority" | "status"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<TicketStatus | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStaffTicket(ticketId)
      .then((data) => {
        if (cancelled) return;
        setTicket(data);
        setState("loaded");
      })
      .catch((error) => !cancelled && setState(error instanceof ApiError && error.status === 404 ? "not-found" : "failure"));
    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadToken]);

  // The owner select (IT Staff) and the Actions Taken assignee select (IT Staff
  // and Administrators, Lab 4 BR-08) both choose from the assignable users.
  useEffect(() => {
    fetchAssignableUsers().then(setPeople).catch(() => setPeople([]));
  }, []);

  // The controls start from the ticket as shown.
  useEffect(() => {
    if (!ticket) return;
    setOwnerChoice(ticket.owner ? String(ticket.owner.id) : "");
    setPriorityChoice(ticket.itPriority);
    setStatusChoice("");
  }, [ticket]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (state === "loading") {
    return (
      <div aria-busy="true" role="status" aria-label="Loading ticket">
        <div className="zg-skeleton-row" />
        <div className="zg-skeleton-row" />
      </div>
    );
  }
  if (state === "not-found") {
    return <ErrorState message="This ticket doesn't exist." action={<Link to={ROUTES.staffQueue}>Back to queue</Link>} />;
  }
  if (state === "failure" || !ticket || !user) {
    return <ErrorState message="Unable to load this ticket. Please try again." action={<Button variant="secondary" onClick={() => setReloadToken((t) => t + 1)}>Retry</Button>} />;
  }

  const t = ticket;
  const caps = t.capabilities;
  const terminal = t.currentStatus === "CLOSED" || t.currentStatus === "CANCELLED";
  const expected = { expectedStatus: t.currentStatus, expectedOwnerId: t.owner?.id ?? null };
  // BR-42 — without an owner the only way forward is a cancellation.
  const statusOptions = t.owner ? t.permittedTransitions : t.permittedTransitions.filter((s) => s === "CANCELLED");

  async function save(control: "owner" | "priority" | "status", action: () => Promise<Detail>, success: string) {
    setBusy(true);
    setControlError(null);
    setBanner(null);
    try {
      const updated = await action();
      setTicket(updated);
      setToast(success);
      return true;
    } catch (error) {
      const err = error instanceof ApiError ? error : null;
      if (err?.code === "STALE_STATE") {
        setBanner(STALE_MESSAGE);
        setConfirming(null);
        setReloadToken((n) => n + 1);
      } else if (err && err.status === 400 && err.fields) {
        const message = Object.values(err.fields)[0];
        if (control === "status" && confirming) setConfirmError(message);
        else setControlError({ control, message });
      } else {
        setControlError({ control, message: err?.message && err.status < 500 ? err.message : "Something went wrong. Please try again." });
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const saveOwner = (ownerId: number | null) =>
    save("owner", () => changeOwner(t.id, { ownerId, expectedOwnerId: expected.expectedOwnerId, expectedStatus: expected.expectedStatus }), "Owner updated");

  function startStatusChange() {
    if (!statusChoice) return;
    if (CONFIRM[statusChoice]) {
      setConfirming(statusChoice);
      setConfirmText("");
      setConfirmError(null);
      return;
    }
    void save("status", () => changeStatus(t.id, { status: statusChoice, ...expected }), `Status changed to ${statusLabel(statusChoice)}`);
  }

  async function confirmStatusChange(event: FormEvent) {
    event.preventDefault();
    if (!confirming) return;
    const text = CONFIRM[confirming]?.text;
    const body = { status: confirming, ...expected, ...(text ? { [text.field]: confirmText.trim() } : {}) };
    const ok = await save("status", () => changeStatus(t.id, body), `Status changed to ${statusLabel(confirming)}`);
    if (ok) {
      if (text?.field === "reason") setThreadVersion((v) => v + 1);
      setConfirming(null);
    }
  }

  const dialog = confirming ? CONFIRM[confirming] : null;
  const dialogText = dialog?.text;
  const trimmedLength = confirmText.trim().length;
  const dialogReady = !dialogText || (trimmedLength >= dialogText.min && trimmedLength <= dialogText.max);

  return (
    <div>
      <div className="mb-3">
        <Link to={ROUTES.staffQueue} className="zg-btn-tertiary btn px-0 mb-2">← Back to queue</Link>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <h1 className="h3 mb-0">{t.ticketNumber}</h1>
          <Badge kind="status" value={t.currentStatus} />
          <Badge kind="priority" value={t.itPriority} />
          {t.requesterResolvedAt && (
            <span className="zg-pill zg-pill--resolved"><span aria-hidden="true">✓ </span>Requester: appears resolved</span>
          )}
        </div>
      </div>

      <div aria-live="polite">
        {banner && <div className="zg-banner zg-banner--warning mb-3" role="alert">{banner}</div>}
        {toast && <div className="zg-banner zg-banner--info mb-3" role="status">{toast}</div>}
      </div>

      <div className="zg-detail-layout">
        <section className="zg-card zg-detail-controls" aria-label="Ticket controls">
          <h2 className="h5 mb-3">Ticket controls</h2>
          {!isStaff ? (
            <>
              <p className="small" style={{ color: "var(--zg-text-muted)" }}>Administrators can view this ticket and manage its actions, but not change its owner, priority, or status.</p>
              <dl className="mb-0">
                <dt className="zg-label">Owner</dt>
                <dd>{t.owner ? t.owner.name : <em style={{ color: "var(--zg-text-muted)" }}>Unassigned</em>}</dd>
                <dt className="zg-label">IT Priority</dt>
                <dd><Badge kind="priority" value={t.itPriority} /></dd>
                <dt className="zg-label">Status</dt>
                <dd><Badge kind="status" value={t.currentStatus} /></dd>
              </dl>
            </>
          ) : terminal ? (
            <>
              <p className="small mb-2" style={{ color: "var(--zg-text-muted)" }}>This ticket is closed.</p>
              <dl className="mb-0">
                <dt className="zg-label">Owner</dt>
                <dd>{t.owner ? t.owner.name : <em style={{ color: "var(--zg-text-muted)" }}>Unassigned</em>}</dd>
                <dt className="zg-label">IT Priority</dt>
                <dd><Badge kind="priority" value={t.itPriority} /></dd>
              </dl>
            </>
          ) : (
            <>
              <div className="mb-3">
                <label htmlFor="ctl-owner" className="zg-label">Owner</label>
                <Select id="ctl-owner" value={ownerChoice} disabled={busy || !caps.canAssign} onChange={(e) => setOwnerChoice(e.target.value)}>
                  {/* BR-36 — a ticket may be left without an owner only while NEW or OPEN. */}
                  {(t.currentStatus === "NEW" || t.currentStatus === "OPEN" || !t.owner) && <option value="">Unassigned</option>}
                  {people.map((p) => (
                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                  ))}
                  {t.owner && !people.some((p) => p.id === t.owner!.id) && <option value={String(t.owner.id)}>{t.owner.name}</option>}
                </Select>
                <div className="d-flex gap-2 mt-2 flex-wrap">
                  <Button
                    variant="secondary"
                    disabled={busy || ownerChoice === (t.owner ? String(t.owner.id) : "")}
                    onClick={() => void saveOwner(ownerChoice ? Number(ownerChoice) : null)}
                  >
                    Save owner
                  </Button>
                  {t.owner?.id !== user.id && (
                    <Button variant="secondary" disabled={busy} onClick={() => void saveOwner(user.id)}>Assign to me</Button>
                  )}
                </div>
                {controlError?.control === "owner" && <span className="zg-field-error" role="alert">{controlError.message}</span>}
              </div>

              <div className="mb-3">
                <label htmlFor="ctl-priority" className="zg-label">IT Priority</label>
                <Select id="ctl-priority" value={priorityChoice} disabled={busy || !caps.canChangePriority} onChange={(e) => setPriorityChoice(e.target.value as Priority)}>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </Select>
                <div className="small mt-1" style={{ color: "var(--zg-text-muted)" }}>Requested: {t.requestedPriority}</div>
                <Button
                  variant="secondary"
                  className="mt-2"
                  disabled={busy || priorityChoice === t.itPriority}
                  onClick={() => void save("priority", () => changeItPriority(t.id, { itPriority: priorityChoice, expectedStatus: t.currentStatus }), "IT Priority updated")}
                >
                  Save priority
                </Button>
                {controlError?.control === "priority" && <span className="zg-field-error d-block" role="alert">{controlError.message}</span>}
              </div>

              <div>
                <div className="zg-label">Status</div>
                <div className="mb-2"><Badge kind="status" value={t.currentStatus} /></div>
                <label htmlFor="ctl-status" className="zg-label">New status</label>
                <Select id="ctl-status" value={statusChoice} disabled={busy || statusOptions.length === 0} onChange={(e) => setStatusChoice(e.target.value as TicketStatus)}>
                  <option value="">Choose…</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </Select>
                {!t.owner && <div className="small mt-1" style={{ color: "var(--zg-text-muted)" }}>Assign an owner to move this ticket forward.</div>}
                <Button className="mt-2" disabled={busy || !statusChoice} onClick={startStatusChange}>Update status</Button>
                {controlError?.control === "status" && <span className="zg-field-error d-block" role="alert">{controlError.message}</span>}
              </div>
            </>
          )}
        </section>

        <div className="zg-detail-main">
          <section className="zg-card mb-4" aria-label="Ticket information">
            <h2 className="h5 mb-3">Ticket information</h2>
            <div className="row">
              <div className="col-md-6"><ReadOnly id="info-requester" label="Requester" value={t.requester.name} /></div>
              <div className="col-md-6"><ReadOnly id="info-email" label="Requester email" value={t.requester.email} /></div>
              <div className="col-md-6"><ReadOnly id="info-category" label="Category" value={t.category.name} /></div>
              <div className="col-md-6"><ReadOnly id="info-system" label="Related System" value={t.relatedSystem.name} /></div>
              <div className="col-md-6 mb-3">
                <div className="zg-label">Requested</div>
                <Badge kind="priority" value={t.requestedPriority} />
              </div>
              <div className="col-md-6"><ReadOnly id="info-created" label="Created" value={fullDate(t.createdAt)} /></div>
              <div className="col-md-6"><ReadOnly id="info-updated" label="Last updated" value={fullDate(t.updatedAt)} /></div>
              <div className="col-12"><ReadOnly id="info-summary" label="Summary" value={t.summary} /></div>
              <div className="col-12"><ReadOnly id="info-description" label="Description" value={t.description} multiline /></div>
            </div>
          </section>

          {t.resolutionSummary && (
            <section className="zg-card mb-4" aria-label="Resolution">
              <h2 className="h5 mb-2">Resolution</h2>
              <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{t.resolutionSummary}</p>
            </section>
          )}

          <section className="mb-4" aria-label="Attachments">
            <AttachmentSection
              downloadOnly
              ticketId={t.id}
              attachments={t.attachments}
              onAttachmentsChange={(attachments: TicketDetailAttachment[]) => setTicket({ ...t, attachments })}
            />
          </section>

          {/* Lab 4, Issue 3 — between Attachments and the conversation (ui-spec §4.1). */}
          <ActionsTaken
            key={t.id}
            ticketId={t.id}
            mode="staff"
            canWrite={caps.canWriteActions}
            ticketStatus={t.currentStatus}
            people={people}
            currentUserId={user.id}
            onChanged={() => setReloadToken((n) => n + 1)}
          />

          <DiscussionPanel key={`${t.id}-${threadVersion}`} ticketId={t.id} canComment={caps.canPostComment} canPost={isStaff} />
        </div>
      </div>

      {confirming && dialog && (
        <Modal titleId="status-dialog-title" onClose={() => setConfirming(null)}>
          <form onSubmit={confirmStatusChange} noValidate>
            <h2 id="status-dialog-title" className="h5">{dialog.title}</h2>
            {dialogText && (
              <div className="mb-3">
                <label htmlFor="status-text" className="zg-label">{dialogText.label}</label>
                <TextArea
                  id="status-text"
                  rows={4}
                  value={confirmText}
                  invalid={Boolean(confirmError)}
                  onChange={(e) => {
                    setConfirmText(e.target.value);
                    setConfirmError(null);
                  }}
                />
                <div className="d-flex justify-content-between small mt-1">
                  <span style={{ color: "var(--zg-text-muted)" }}>
                    {dialogText.field === "reason" ? "This reason will be posted as a public comment." : `${dialogText.min}–${dialogText.max} characters, shown to the Requester.`}
                  </span>
                  <span style={{ color: "var(--zg-text-muted)" }}>{confirmText.length}/{dialogText.max}</span>
                </div>
                {confirmError && <span className="zg-field-error" role="alert">{confirmError}</span>}
              </div>
            )}
            <div className="d-flex gap-2 justify-content-end flex-wrap">
              <Button variant="secondary" type="button" onClick={() => setConfirming(null)} disabled={busy}>Keep as is</Button>
              <Button type="submit" variant={confirming === "CANCELLED" ? "destructive" : "primary"} disabled={!dialogReady || busy} busy={busy} busyLabel="Saving…">
                {dialog.button}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
