import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionTaken,
  ActionTakenEvent,
  ApiError,
  changeActionStatus,
  createActionTaken,
  fetchActionHistory,
  fetchActionsTaken,
  PersonRef,
  TicketStatus,
  updateActionTaken,
} from "../api.js";
import { ActionStatusBadge, FollowUpPill } from "./Badge.js";
import { Button } from "./Button.js";
import { ErrorState } from "./ErrorState.js";
import { FormField } from "./FormField.js";
import { Modal } from "./Modal.js";
import { Select } from "./Select.js";
import { TextArea } from "./TextArea.js";
import { TextInput } from "./TextInput.js";

// Lab 4, Issue 3 — Actions Taken (docs/lab-04/ui-spec.md §1.5, §4, §6;
// specification.md FR-01 to FR-06, BR-04 to BR-25, BR-43, BR-44).
//
// One component for both screens. On IT Staff Ticket Detail ("staff") it lists,
// creates, edits, completes, and cancels actions, and shows each one's history;
// on Requester Ticket Detail ("requester") it is a read-only list with every
// field (BR-19). The server re-checks every change (BR-15), so a control shown
// here is feedback, never the boundary. Every edit and status change sends the
// version this screen shows (BR-25), and a create carries one clientRequestId
// for the whole life of its form, so a retry never makes a second action (BR-43).

const TIME_ZONE = "Asia/Bangkok"; // D-19 — the same clock as the dashboards
const STALE_MESSAGE = "This action was changed by someone else. It has been reloaded.";
const SAVE_FAILED = "We couldn't save the action. Your input is still here.";
const LIMITS = { description: 2000, result: 2000, followUpNote: 1000, attachmentNotes: 1000, reasonMin: 10, reasonMax: 1000 };
const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  actionAt: "Date & time",
  description: "Description",
  assigneeId: "Assigned to",
  result: "Result",
  followUpRequired: "Follow-up required",
  followUpNote: "Follow-up note",
  attachmentNotes: "Attachment notes",
  followUpOfId: "Follow-up of",
  cancelReason: "Reason",
};
const EVENT_LABELS: Record<ActionTakenEvent["type"], string> = { CREATED: "Created", UPDATED: "Edited", COMPLETED: "Completed", CANCELLED: "Cancelled" };

export function formatBangkok(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// The value of a datetime-local input, read as Bangkok time (BR-07, api-spec §0.3).
function toBangkokInput(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
const fromBangkokInput = (value: string) => `${value}:00+07:00`;

const newRequestId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const dash = (value: string | null | undefined) => (value ? value : "—");
const trimmed = (value: string) => value.trim();

interface Form {
  status: "PLANNED" | "COMPLETED";
  actionAt: string;
  description: string;
  assigneeId: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
  followUpOfId: string;
}

type Editor = { mode: "create"; requestId: string } | { mode: "edit"; action: ActionTaken };
// The Modal returns focus to the button that opened it (Lab 3 ui-spec §10).
type Confirm = { kind: "complete" | "cancel"; action: ActionTaken };

function formFor(action: ActionTaken | null, currentUserId: number): Form {
  if (!action) {
    return { status: "PLANNED", actionAt: toBangkokInput(new Date()), description: "", assigneeId: String(currentUserId), result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "", followUpOfId: "" };
  }
  return {
    status: "PLANNED",
    actionAt: toBangkokInput(new Date(action.actionAt)),
    description: action.description,
    assigneeId: String(action.assignee.id),
    result: action.result ?? "",
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote ?? "",
    attachmentNotes: action.attachmentNotes ?? "",
    followUpOfId: action.followUpOfId ? String(action.followUpOfId) : "",
  };
}

// The checks the server makes on the body (BR-04, BR-06), shown before sending.
function checkForm(form: Form, creating: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.actionAt) errors.actionAt = "Enter the date and time.";
  if (!trimmed(form.description)) errors.description = "Enter a description.";
  else if (trimmed(form.description).length > LIMITS.description) errors.description = `Keep the description to ${LIMITS.description} characters or fewer.`;
  if (creating && form.status === "COMPLETED" && !trimmed(form.result)) errors.result = "Enter the result.";
  if (trimmed(form.result).length > LIMITS.result) errors.result = `Keep the result to ${LIMITS.result} characters or fewer.`;
  if (form.followUpRequired && !trimmed(form.followUpNote)) errors.followUpNote = "Enter a follow-up note.";
  if (trimmed(form.followUpNote).length > LIMITS.followUpNote) errors.followUpNote = `Keep the note to ${LIMITS.followUpNote} characters or fewer.`;
  if (trimmed(form.attachmentNotes).length > LIMITS.attachmentNotes) errors.attachmentNotes = `Keep attachment notes to ${LIMITS.attachmentNotes} characters or fewer.`;
  if (!form.assigneeId) errors.assigneeId = "Choose who the action is assigned to.";
  return errors;
}

export interface ActionsTakenProps {
  ticketId: number;
  mode: "staff" | "requester";
  /** capabilities.canWriteActions (BR-17, BR-20); always false for a Requester. */
  canWrite: boolean;
  ticketStatus: TicketStatus;
  /** Active IT Staff and Administrators (GET /api/staff/assignable-users). */
  people: PersonRef[];
  currentUserId: number;
  /** A change was saved, or the ticket changed under us: reload the ticket (FR-09). */
  onChanged: () => void;
  /** Bumped by the screen to reload the list (Lab 4, Issue 4: after RESOLUTION_BLOCKED). */
  reloadSignal?: number;
}

export function ActionsTaken({ ticketId, mode, canWrite, ticketStatus, people, currentUserId, onChanged, reloadSignal = 0 }: ActionsTakenProps) {
  const staff = mode === "staff";
  const [actions, setActions] = useState<ActionTaken[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState<Form>(() => formFor(null, currentUserId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [panelBanner, setPanelBanner] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Record<number, ActionTakenEvent[] | "loading" | "failed">>({});

  const load = useCallback(async () => {
    try {
      const data = await fetchActionsTaken(ticketId);
      setActions(data);
      setFailed(false);
      return data;
    } catch {
      setFailed(true);
      return null;
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load, reload, reloadSignal]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // After a save, focus moves to the card it changed (ui-spec §4.6).
  useEffect(() => {
    if (focusId === null || !actions || editor || confirm) return;
    // A new card appears only once the list has reloaded, so the request waits
    // for it rather than being used up on the list before (PR #76 review).
    const card = document.getElementById(`action-${focusId}`);
    if (!card) return;
    card.focus();
    setFocusId(null);
  }, [focusId, actions, editor, confirm]);

  // #action-<id> from the Dashboard scrolls to the card and focuses it (ui-spec §7).
  // Once per anchor: the list reloads after every save, and honouring the anchor
  // again would pull focus back from the card the save moved it to (Issue 8).
  const anchorDone = useRef<string | null>(null);
  useEffect(() => {
    if (!actions) return;
    const hash = window.location.hash;
    if (anchorDone.current === hash) return;
    anchorDone.current = hash;
    const match = hash.match(/^#action-(\d+)$/);
    if (match) document.getElementById(`action-${match[1]}`)?.focus();
  }, [actions]);

  const names = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of people) map.set(p.id, p.name);
    for (const a of actions ?? []) for (const p of [a.assignee, a.createdBy, a.performedBy, a.cancelledBy]) if (p) map.set(p.id, p.name);
    return map;
  }, [people, actions]);
  const nameOf = (id: unknown) => (typeof id === "number" ? names.get(id) ?? `user #${id}` : "—");

  // BR-14 — the completed actions whose follow-up is still open.
  const followUpTargets = (actions ?? []).filter((a) => a.status === "COMPLETED" && a.followUpRequired && !a.followUpHandled);

  function openCreate() {
    setForm(formFor(null, currentUserId));
    setErrors({});
    setPanelBanner(null);
    setUnsaved(null);
    setEditor({ mode: "create", requestId: newRequestId() });
  }

  function openEdit(action: ActionTaken) {
    setForm(formFor(action, currentUserId));
    setErrors({});
    setPanelBanner(null);
    setUnsaved(null);
    setEditor({ mode: "edit", action });
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _gone, ...rest } = e;
      return rest;
    });
  };

  // What every failed save does with the error (ui-spec §4.6).
  async function handleFailure(error: unknown, action: ActionTaken | null): Promise<"stay" | "close"> {
    const err = error instanceof ApiError ? error : null;
    if (err?.status === 400 && err.fields) {
      setErrors(err.fields);
      return "stay";
    }
    if (err?.code === "STALE_STATE" && action) {
      const fresh = await load();
      const latest = fresh?.find((a) => a.id === action.id);
      if (latest && latest.status === "PLANNED") {
        if (editor?.mode === "edit") {
          // Keep what the user typed beside the reloaded values (BR-44).
          const kept: Record<string, string> = {};
          for (const key of ["description", "result", "followUpNote", "attachmentNotes"] as const) {
            if (trimmed(form[key]) && trimmed(form[key]) !== (latest[key] ?? "")) kept[key] = form[key];
          }
          setUnsaved(Object.keys(kept).length ? kept : null);
          setForm(formFor(latest, currentUserId));
          setEditor({ mode: "edit", action: latest });
        } else if (confirm) {
          setConfirm({ ...confirm, action: latest });
        }
        setPanelBanner(STALE_MESSAGE);
        return "stay";
      }
      setToast("This action was already completed or cancelled.");
      return "close";
    }
    if (err?.code === "ACTION_NOT_PLANNED") {
      await load();
      setToast("This action was already completed or cancelled.");
      return "close";
    }
    if (err?.code === "TICKET_RESOLVED" || err?.code === "TICKET_CLOSED") {
      setBanner(err.message);
      await load();
      onChanged();
      return "close";
    }
    setPanelBanner(SAVE_FAILED);
    return "stay";
  }

  async function submitEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    const creating = editor.mode === "create";
    const found = checkForm(form, creating);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setPanelBanner(null);
    try {
      let saved: ActionTaken;
      if (editor.mode === "create") {
        saved = await createActionTaken(ticketId, {
          status: form.status,
          actionAt: fromBangkokInput(form.actionAt),
          description: trimmed(form.description),
          assigneeId: Number(form.assigneeId),
          result: trimmed(form.result) || null,
          followUpRequired: form.followUpRequired,
          followUpNote: form.followUpRequired ? trimmed(form.followUpNote) : null,
          attachmentNotes: trimmed(form.attachmentNotes) || null,
          followUpOfId: form.followUpOfId ? Number(form.followUpOfId) : null,
          clientRequestId: editor.requestId,
        });
      } else {
        // The date field shows minutes only; sending it back unchanged would cut
        // the seconds off a stored time and record an edit nobody made.
        const dateChanged = form.actionAt !== toBangkokInput(new Date(editor.action.actionAt));
        saved = await updateActionTaken(ticketId, editor.action.id, {
          expectedVersion: editor.action.version,
          ...(dateChanged ? { actionAt: fromBangkokInput(form.actionAt) } : {}),
          description: trimmed(form.description),
          assigneeId: Number(form.assigneeId),
          result: trimmed(form.result) || null,
          followUpRequired: form.followUpRequired,
          followUpNote: form.followUpRequired ? trimmed(form.followUpNote) : null,
          attachmentNotes: trimmed(form.attachmentNotes) || null,
        });
        if (saved.version === editor.action.version) {
          setToast("No changes to save.");
          setEditor(null);
          return;
        }
      }
      setEditor(null);
      setToast(creating ? "Action added" : "Action updated");
      setFocusId(saved.id);
      await load();
      onChanged();
    } catch (error) {
      if ((await handleFailure(error, editor.mode === "edit" ? editor.action : null)) === "close") setEditor(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="zg-card mb-4" aria-labelledby="actions-heading">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-1">
        <h2 id="actions-heading" className="h5 mb-0">
          {staff ? "Actions taken" : "Work on your request"}
          {/* A count only once it is known: "(0)" while loading would be a claim. */}
          {actions && ` (${actions.length})`}
        </h2>
        {staff && canWrite && (
          <Button onClick={openCreate}>Add action</Button>
        )}
      </div>
      {staff && (
        <p className="small mb-2" style={{ color: "var(--zg-text-muted)" }}>
          <span aria-hidden="true">👥 </span>Visible to the Requester
        </p>
      )}
      {staff && !canWrite && ticketStatus === "RESOLVED" && <p className="small mb-2">Reopen the ticket to add or change actions.</p>}
      {staff && !canWrite && (ticketStatus === "CLOSED" || ticketStatus === "CANCELLED") && <p className="small mb-2">This ticket is closed.</p>}

      <div aria-live="polite">
        {banner && <div className="zg-banner zg-banner--warning mb-3" role="alert">{banner}</div>}
        {toast && <div className="zg-banner zg-banner--info mb-3" role="status">{toast}</div>}
      </div>

      {failed && !actions ? (
        <ErrorState message="We couldn't load the actions." action={<Button variant="secondary" onClick={() => setReload((n) => n + 1)}>Retry</Button>} />
      ) : !actions ? (
        <div aria-busy="true" role="status" aria-label="Loading actions">
          <div className="zg-skeleton-row" />
          <div className="zg-skeleton-row" />
          <div className="zg-skeleton-row" />
        </div>
      ) : actions.length === 0 ? (
        <p className="mb-0" style={{ color: "var(--zg-text-muted)" }}>
          {staff ? "No actions yet. Add the first action to plan or record work on this ticket." : "IT Staff haven't recorded any work on this request yet."}
        </p>
      ) : (
        <ol className="zg-action-list">
          {actions.map((a) => (
            <li key={a.id}>
              <ActionCard
                action={a}
                ticketId={ticketId}
                staff={staff}
                editable={staff && canWrite && a.status === "PLANNED"}
                currentUserId={currentUserId}
                followUpOf={a.followUpOfId ? actions.find((x) => x.id === a.followUpOfId) ?? null : null}
                history={historyOpen[a.id]}
                nameOf={nameOf}
                onEdit={() => openEdit(a)}
                onComplete={() => setConfirm({ kind: "complete", action: a })}
                onCancel={() => setConfirm({ kind: "cancel", action: a })}
                onToggleHistory={async () => {
                  if (historyOpen[a.id]) {
                    const { [a.id]: _closed, ...rest } = historyOpen;
                    setHistoryOpen(rest);
                    return;
                  }
                  setHistoryOpen((h) => ({ ...h, [a.id]: "loading" }));
                  try {
                    const events = await fetchActionHistory(ticketId, a.id);
                    setHistoryOpen((h) => ({ ...h, [a.id]: events }));
                  } catch {
                    setHistoryOpen((h) => ({ ...h, [a.id]: "failed" }));
                  }
                }}
              />
            </li>
          ))}
        </ol>
      )}

      {editor && (
        <Modal titleId="action-panel-title" variant="panel" onClose={() => !busy && setEditor(null)}>
          <form onSubmit={submitEditor} noValidate className="d-flex flex-column h-100">
            <div className="d-flex justify-content-between align-items-start mb-3">
              <h2 id="action-panel-title" className="h5 mb-0">{editor.mode === "create" ? "Add action" : "Edit action"}</h2>
              <Button variant="tertiary" aria-label="Close" onClick={() => setEditor(null)} disabled={busy}>✕</Button>
            </div>
            {panelBanner && <div className="zg-banner zg-banner--warning mb-3" role="alert">{panelBanner}</div>}
            {unsaved && (
              <div className="zg-unsaved">
                <div className="zg-label">Your unsaved text</div>
                {Object.entries(unsaved).map(([key, value]) => (
                  <div key={key} className="mb-1">
                    <div className="small" style={{ color: "var(--zg-text-muted)" }}>{FIELD_LABELS[key]}</div>
                    <pre>{value}</pre>
                  </div>
                ))}
              </div>
            )}
            <p className="small" style={{ color: "var(--zg-text-muted)" }}>Everything here is visible to the Requester.</p>

            {editor.mode === "create" && (
              <fieldset className="mb-3">
                <legend className="zg-label">Status<span className="zg-required" aria-hidden="true">*</span></legend>
                {(["PLANNED", "COMPLETED"] as const).map((value) => (
                  <div className="form-check" key={value}>
                    <input
                      className="form-check-input"
                      type="radio"
                      name="action-status"
                      id={`action-status-${value}`}
                      checked={form.status === value}
                      onChange={() => set("status", value)}
                    />
                    <label className="form-check-label" htmlFor={`action-status-${value}`}>
                      {value === "PLANNED" ? "Plan this work" : "Record work already done"}
                    </label>
                  </div>
                ))}
              </fieldset>
            )}

            <FormField htmlFor="action-at" label="Action date & time (Bangkok)" required error={errors.actionAt}>
              <TextInput type="datetime-local" value={form.actionAt} onChange={(e) => set("actionAt", e.target.value)} />
            </FormField>
            <FormField htmlFor="action-description" label="Action description" required error={errors.description}>
              <TextArea rows={3} value={form.description} maxLength={LIMITS.description} onChange={(e) => set("description", e.target.value)} />
            </FormField>
            <div className="small text-end mb-2" style={{ color: "var(--zg-text-muted)", marginTop: "-0.75rem" }}>{form.description.length}/{LIMITS.description}</div>
            <FormField htmlFor="action-assignee" label="Assigned to" required error={errors.assigneeId}>
              <Select value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
                {editor.mode === "edit" && !people.some((p) => p.id === editor.action.assignee.id) && (
                  <option value={String(editor.action.assignee.id)}>{editor.action.assignee.name} (inactive)</option>
                )}
              </Select>
            </FormField>
            <FormField htmlFor="action-result" label="Result" required={editor.mode === "create" && form.status === "COMPLETED"} error={errors.result}>
              <TextArea rows={3} value={form.result} maxLength={LIMITS.result} onChange={(e) => set("result", e.target.value)} />
            </FormField>
            <div className="form-check mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="action-followup"
                checked={form.followUpRequired}
                onChange={(e) => {
                  set("followUpRequired", e.target.checked);
                  if (!e.target.checked) set("followUpNote", "");
                }}
              />
              <label className="form-check-label" htmlFor="action-followup">Follow-up required?</label>
            </div>
            {form.followUpRequired && (
              <FormField htmlFor="action-followup-note" label="Follow-up note" required error={errors.followUpNote}>
                <TextArea rows={2} value={form.followUpNote} maxLength={LIMITS.followUpNote} onChange={(e) => set("followUpNote", e.target.value)} />
              </FormField>
            )}
            <FormField htmlFor="action-attachment-notes" label="Attachment notes" error={errors.attachmentNotes}>
              <TextArea rows={2} value={form.attachmentNotes} maxLength={LIMITS.attachmentNotes} aria-describedby="action-attachment-help" onChange={(e) => set("attachmentNotes", e.target.value)} />
            </FormField>
            <div id="action-attachment-help" className="small mb-3" style={{ color: "var(--zg-text-muted)", marginTop: "-0.75rem" }}>
              Where to find related images or files, e.g. an attachment name on this ticket.
            </div>
            {editor.mode === "create" && followUpTargets.length > 0 && (
              <FormField htmlFor="action-followup-of" label="Follow-up of" error={errors.followUpOfId}>
                <Select value={form.followUpOfId} onChange={(e) => set("followUpOfId", e.target.value)}>
                  <option value="">None</option>
                  {followUpTargets.map((a) => (
                    <option key={a.id} value={String(a.id)}>#{a.id} {a.description}</option>
                  ))}
                </Select>
              </FormField>
            )}
            {errors.clientRequestId && <span className="zg-field-error d-block mb-2" role="alert">{errors.clientRequestId}</span>}

            <div className="zg-side-panel__footer d-flex gap-2 justify-content-end flex-wrap">
              <Button variant="secondary" onClick={() => setEditor(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" busy={busy} busyLabel="Saving…">{editor.mode === "create" ? "Save action" : "Save changes"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          key={`${confirm.kind}-${confirm.action.id}`}
          confirm={confirm}
          banner={panelBanner}
          busy={busy}
          onClose={() => {
            setConfirm(null);
            setPanelBanner(null);
          }}
          onSubmit={async (body) => {
            setBusy(true);
            setPanelBanner(null);
            try {
              const saved = await changeActionStatus(ticketId, confirm.action.id, { ...body, expectedVersion: confirm.action.version } as never);
              setConfirm(null);
              setToast(body.status === "COMPLETED" ? "Action completed" : "Action cancelled");
              setFocusId(saved.id);
              await load();
              onChanged();
              return null;
            } catch (error) {
              const err = error instanceof ApiError ? error : null;
              if (err?.status === 400 && err.fields) return err.fields;
              if ((await handleFailure(error, confirm.action)) === "close") setConfirm(null);
              return null;
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}

interface CardProps {
  action: ActionTaken;
  ticketId: number;
  staff: boolean;
  editable: boolean;
  currentUserId: number;
  followUpOf: ActionTaken | null;
  history: ActionTakenEvent[] | "loading" | "failed" | undefined;
  nameOf: (id: unknown) => string;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onToggleHistory: () => void;
}

function ActionCard({ action: a, staff, editable, currentUserId, followUpOf, history, nameOf, onEdit, onComplete, onCancel, onToggleHistory }: CardProps) {
  const headingId = `action-${a.id}-heading`;
  const historyId = `action-${a.id}-history`;
  const person = (p: PersonRef | null) =>
    p ? (
      <>
        {p.name}
        {p.id === currentUserId && <span className="zg-pill zg-pill--you ms-1">You</span>}
        {!p.isActive && <span className="zg-pill zg-pill--inactive ms-1">Inactive</span>}
      </>
    ) : (
      "—"
    );

  return (
    <article id={`action-${a.id}`} tabIndex={-1} aria-labelledby={headingId} className={"zg-action-card" + (a.status === "CANCELLED" ? " zg-action-card--cancelled" : "")}>
      <div className="zg-action-card__head">
        <ActionStatusBadge status={a.status} />
        <span id={headingId} className="fw-semibold">{formatBangkok(a.actionAt)}</span>
        <span className="small">Assigned to {person(a.assignee)}</span>
      </div>
      <p className="zg-action-card__desc">{a.description}</p>
      <dl className="zg-action-card__fields">
        <dt>Result</dt>
        <dd>{dash(a.result)}</dd>
        {a.followUpRequired && (
          <>
            <dt>Follow-up</dt>
            <dd>
              <FollowUpPill handled={Boolean(a.followUpHandled)} /> <span>{a.followUpNote}</span>
            </dd>
          </>
        )}
        <dt>Attachment notes</dt>
        <dd>{dash(a.attachmentNotes)}</dd>
        <dt>Created by</dt>
        <dd>{person(a.createdBy)}</dd>
        <dt>Performed by</dt>
        <dd>{person(a.performedBy)}</dd>
        {followUpOf && (
          <>
            <dt>Follow-up of</dt>
            <dd><a href={`#action-${followUpOf.id}`}>#{followUpOf.id} {followUpOf.description}</a></dd>
          </>
        )}
        {a.status === "CANCELLED" && (
          <>
            <dt>Reason</dt>
            <dd>{a.cancelReason}</dd>
          </>
        )}
      </dl>
      {a.status === "COMPLETED" && a.performedBy && a.completedAt && (
        <p className="zg-action-card__meta">Completed by {a.performedBy.name} on {formatBangkok(a.completedAt)}</p>
      )}
      {a.status === "CANCELLED" && a.cancelledBy && a.cancelledAt && (
        <p className="zg-action-card__meta">Cancelled by {a.cancelledBy.name} on {formatBangkok(a.cancelledAt)}</p>
      )}
      {staff && (
        <div className="zg-action-card__buttons">
          <Button variant="tertiary" aria-expanded={Boolean(history)} aria-controls={historyId} onClick={onToggleHistory}>History</Button>
          {editable && (
            <>
              <Button variant="secondary" onClick={onEdit}>Edit</Button>
              <Button variant="secondary" onClick={onComplete}>Complete</Button>
              <Button variant="destructive" onClick={onCancel}>Cancel action</Button>
            </>
          )}
        </div>
      )}
      {staff && history && (
        <div id={historyId}>
          {history === "loading" ? (
            <p className="small mb-0 mt-2" role="status">Loading history…</p>
          ) : history === "failed" ? (
            <p className="small mb-0 mt-2" role="alert">We couldn't load the history.</p>
          ) : (
            <ol className="zg-action-history">
              {history.map((e) => (
                <li key={e.id}>
                  <strong>{e.actor.name}</strong> · {formatBangkok(e.createdAt)} · {EVENT_LABELS[e.type]}
                  {e.type !== "CREATED" && Object.keys(e.changes).length > 0 && (
                    <>
                      {": "}
                      {Object.entries(e.changes)
                        .map(([field, { from, to }]) => {
                          const show = (v: unknown) =>
                            field === "assigneeId" ? nameOf(v) : field === "actionAt" && typeof v === "string" ? formatBangkok(v) : v === null || v === undefined || v === "" ? "—" : String(v);
                          return `${FIELD_LABELS[field] ?? field} ${show(from)} → ${show(to)}`;
                        })
                        .join("; ")}
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

type StatusBody = { status: "COMPLETED"; result: string; followUpRequired: boolean; followUpNote: string | null; actionAt?: string } | { status: "CANCELLED"; reason: string };

function ConfirmDialog({
  confirm,
  banner,
  busy,
  onClose,
  onSubmit,
}: {
  confirm: Confirm;
  banner: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: StatusBody) => Promise<Record<string, string> | null>;
}) {
  const a = confirm.action;
  const completing = confirm.kind === "complete";
  const [result, setResult] = useState(a.result ?? "");
  const [followUp, setFollowUp] = useState(a.followUpRequired);
  const [note, setNote] = useState(a.followUpNote ?? "");
  // Completed work can't be dated ahead (BR-07): planned work dated in the
  // future starts from now, so completing it needs no date edit.
  const [initialAt, setInitialAt] = useState(() => toBangkokInput(new Date(Math.min(Date.parse(a.actionAt), Date.now()))));
  const [at, setAt] = useState(initialAt);
  // PR #76 follow-up: after a stale reload the dialog shows the reloaded action
  // for every field the user has not touched, and keeps the ones they changed,
  // so a retry neither loses their text nor quietly undoes a colleague's edit.
  const touched = useRef(new Set<string>());
  const touch = (field: string) => touched.current.add(field);
  const version = a.version;
  const firstVersion = useRef(version);
  useEffect(() => {
    if (version === firstVersion.current) return;
    const fresh = toBangkokInput(new Date(Math.min(Date.parse(a.actionAt), Date.now())));
    if (!touched.current.has("result")) setResult(a.result ?? "");
    if (!touched.current.has("followUp")) setFollowUp(a.followUpRequired);
    if (!touched.current.has("note")) setNote(a.followUpNote ?? "");
    if (!touched.current.has("at")) {
      setAt(fresh);
      setInitialAt(fresh);
    }
    // Only a new version of the action triggers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  // A date is sent only when it differs from the stored one: when the user
  // changed it, or when planned work dated ahead has to be completed as of now.
  const sendDate = at !== initialAt || Date.parse(a.actionAt) > Date.now();
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const titleId = completing ? "complete-dialog-title" : "cancel-dialog-title";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (completing) {
      if (!result.trim()) found.result = "Enter the result.";
      if (followUp && !note.trim()) found.followUpNote = "Enter a follow-up note.";
      if (!at) found.actionAt = "Enter the date and time.";
    } else if (reason.trim().length < LIMITS.reasonMin || reason.trim().length > LIMITS.reasonMax) {
      found.reason = `Give a reason of ${LIMITS.reasonMin} to ${LIMITS.reasonMax} characters.`;
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    const body: StatusBody = completing
      ? { status: "COMPLETED", result: result.trim(), followUpRequired: followUp, followUpNote: followUp ? note.trim() : null, ...(sendDate ? { actionAt: fromBangkokInput(at) } : {}) }
      : { status: "CANCELLED", reason: reason.trim() };
    const fields = await onSubmit(body);
    if (fields) setErrors(fields);
  }

  return (
    <Modal titleId={titleId} onClose={() => !busy && onClose()}>
      <form onSubmit={submit} noValidate>
        <h2 id={titleId} className="h5">{completing ? "Complete this action?" : "Cancel this action?"}</h2>
        <p className="small" style={{ color: "var(--zg-text-muted)" }}>{a.description}</p>
        {banner && <div className="zg-banner zg-banner--warning mb-3" role="alert">{banner}</div>}
        {completing ? (
          <>
            <FormField htmlFor="complete-result" label="Result" required error={errors.result}>
              <TextArea rows={3} value={result} maxLength={LIMITS.result} onChange={(e) => { touch("result"); setResult(e.target.value); }} />
            </FormField>
            <div className="form-check mb-3">
              <input className="form-check-input" type="checkbox" id="complete-followup" checked={followUp} onChange={(e) => { touch("followUp"); setFollowUp(e.target.checked); }} />
              <label className="form-check-label" htmlFor="complete-followup">Follow-up required?</label>
            </div>
            {followUp && (
              <FormField htmlFor="complete-followup-note" label="Follow-up note" required error={errors.followUpNote}>
                <TextArea rows={2} value={note} maxLength={LIMITS.followUpNote} onChange={(e) => { touch("note"); setNote(e.target.value); }} />
              </FormField>
            )}
            <FormField htmlFor="complete-at" label="Action date & time (Bangkok)" required error={errors.actionAt}>
              <TextInput type="datetime-local" value={at} onChange={(e) => { touch("at"); setAt(e.target.value); }} />
            </FormField>
          </>
        ) : (
          <>
            <FormField htmlFor="cancel-reason" label="Reason" required error={errors.reason}>
              <TextArea rows={3} value={reason} maxLength={LIMITS.reasonMax} aria-describedby="cancel-reason-help" onChange={(e) => setReason(e.target.value)} />
            </FormField>
            <div id="cancel-reason-help" className="small mb-3" style={{ color: "var(--zg-text-muted)", marginTop: "-0.75rem" }}>The reason stays on the action's record.</div>
          </>
        )}
        <div className="d-flex gap-2 justify-content-end flex-wrap">
          <Button variant="secondary" onClick={onClose} disabled={busy}>{completing ? "Back" : "Keep action"}</Button>
          <Button type="submit" variant={completing ? "primary" : "destructive"} busy={busy} busyLabel="Saving…">
            {completing ? "Mark as completed" : "Cancel action"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
