import { FormEvent, useEffect, useId, useState } from "react";
import { ApiError, DiscussionEntry } from "../api.js";
import { Button } from "./Button.js";
import { RoleBadge } from "./Badge.js";
import { TextArea } from "./TextArea.js";
import { LoadingSpinner } from "./LoadingSpinner.js";

// Lab 3, Issue 6 — one thread of Public Comments or Internal Notes and its
// composer (docs/lab-03/ui-spec.md §5, §7.2). Used by the Requester Ticket
// Detail (comments only) and by DiscussionPanel (both kinds, IT Staff Ticket
// Detail in Issue 8).
//
// Bodies are rendered as React text with line breaks preserved — never as
// HTML — so whatever someone typed is shown exactly as typed (BR-51).

export const BODY_MAX = 2000;

export interface DiscussionThreadProps {
  load: () => Promise<DiscussionEntry[]>;
  /** Omit to show the thread read-only (an Administrator, BR-21). */
  post?: (body: string) => Promise<DiscussionEntry>;
  emptyText: string;
  composerLabel: string;
  submitLabel: string;
  /** When set, the composer is shown disabled with this note (BR-52). */
  closedNote?: string | null;
  /** The draft is owned by the caller when given, so it survives tab switches. */
  draft?: string;
  onDraftChange?: (draft: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DiscussionThread({
  load,
  post,
  emptyText,
  composerLabel,
  submitLabel,
  closedNote,
  draft: controlledDraft,
  onDraftChange,
}: DiscussionThreadProps) {
  const fieldId = useId();
  const [entries, setEntries] = useState<DiscussionEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ownDraft, setOwnDraft] = useState("");
  const draft = controlledDraft ?? ownDraft;
  const setDraft = onDraftChange ?? setOwnDraft;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setEntries(data))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
    // `load` is a fresh closure on each render; the ticket id inside it is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = draft.trim();
  const closed = Boolean(closedNote);
  const canSubmit = !closed && !busy && trimmed.length > 0 && trimmed.length <= BODY_MAX;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!post || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const created = await post(trimmed);
      setEntries((current) => [...(current ?? []), created]);
      setDraft("");
    } catch (failure) {
      const err = failure instanceof ApiError ? failure : null;
      if (err?.fields?.body) setError(err.fields.body);
      else if (err?.code === "TICKET_CLOSED") setError("This ticket is closed — new comments are not accepted.");
      else setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {entries === null && !loadFailed && <LoadingSpinner label="Loading…" />}
      {loadFailed && (
        <p className="zg-field-error" role="alert">
          Unable to load this thread. Please reload the page.
        </p>
      )}
      {entries?.length === 0 && <p style={{ color: "var(--zg-text-muted)" }}>{emptyText}</p>}
      {entries && entries.length > 0 && (
        <ol className="zg-thread">
          {entries.map((entry) => (
            <li key={entry.id} className="zg-thread-entry">
              <div className="zg-thread-meta">
                <strong>{entry.author.name}</strong>
                <RoleBadge role={entry.author.role} />
                <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
              </div>
              <p className="zg-thread-body mb-0" data-testid="entry-body" style={{ whiteSpace: "pre-wrap" }}>
                {entry.body}
              </p>
            </li>
          ))}
        </ol>
      )}

      {post && (
        <form onSubmit={handleSubmit} noValidate className="mt-3">
          <label htmlFor={fieldId} className="zg-label">
            {composerLabel}
          </label>
          <TextArea
            id={fieldId}
            value={draft}
            disabled={closed || busy}
            invalid={Boolean(error)}
            aria-describedby={`${fieldId}-count${error ? ` ${fieldId}-error` : ""}`}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            rows={3}
            style={{ minHeight: 0 }}
          />
          <div className="d-flex justify-content-between align-items-start mt-1 gap-2 flex-wrap">
            <div>
              {error && (
                <span id={`${fieldId}-error`} className="zg-field-error" role="alert">
                  {error}
                </span>
              )}
              {closedNote && <span style={{ color: "var(--zg-text-muted)" }}>{closedNote}</span>}
            </div>
            <span id={`${fieldId}-count`} className="small" style={{ color: trimmed.length > BODY_MAX ? "var(--zg-error-text)" : "var(--zg-text-muted)" }}>
              {draft.length}/{BODY_MAX}
            </span>
          </div>
          <Button type="submit" className="mt-2" disabled={!canSubmit} busy={busy} busyLabel="Posting…">
            {submitLabel}
          </Button>
        </form>
      )}
    </div>
  );
}
