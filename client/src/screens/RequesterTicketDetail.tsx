import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, DiscussionEntry, fetchComments, fetchTicket, markAppearsResolved, postComment, TicketDetail, TicketDetailAttachment } from "../api.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Modal } from "../components/Modal.js";
import { TextArea } from "../components/TextArea.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { DiscussionThread } from "../components/DiscussionThread.js";
import { CLOSED_COMMENT_NOTE } from "../components/DiscussionPanel.js";
import { ROUTES } from "../routes.js";

// Requester Ticket Detail (Lab 2 ui-spec.md §6.5, extended by Lab 3 ui-spec.md
// §5). It never renders Internal Notes, IT Priority, Actions Taken, or any
// status-change control, whatever a ticket's data looks like (Lab 3 BR-71; Lab
// 2 BR-46 also kept out Public Comments, which Lab 3 adds below — BR-68).
//
// Lab 3, Issue 5: the ticket is fetched as the signed-in Requester (the server
// scopes it to them), the header band shows the owner or "Not yet assigned"
// (BR-71), and a CLOSED or CANCELLED ticket's attachments are download-only
// (BR-70). Every field is still picked by name, so IT Priority or Internal
// Notes in a payload could never be rendered (UI-16).
//
// Lab 3, Issue 6: a Comments card below Attachments — the ticket's Public
// Comments and a composer, disabled on a closed ticket (FR-14, FR-15, BR-52).
// Internal Notes have no place on this screen at all (BR-04).

const CLOSED_STATUSES = new Set(["CLOSED", "CANCELLED"]);

type LoadState = "loading" | "loaded" | "not-found" | "failure";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RequesterTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // Lab 3, Issue 8 — "Problem appears resolved" (BR-47, ui-spec §5).
  const [marking, setMarking] = useState(false);
  const [markComment, setMarkComment] = useState("");
  const [markBusy, setMarkBusy] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [postedComments, setPostedComments] = useState<DiscussionEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState("loading");
    fetchTicket(Number(id))
      .then((data) => {
        if (cancelled) return;
        setTicket(data);
        setState("loaded");
      })
      .catch((error) => {
        if (cancelled) return;
        // A ticket that doesn't exist and one that isn't owned by this
        // Requester are the same 404 from the server (Decision D-2) — the
        // UI shows the same safe not-found state for both (BR-45, UI-11),
        // never leaking which case it actually was.
        if (error instanceof ApiError && error.status === 404) {
          setState("not-found");
        } else {
          setState("failure");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, retryToken]);

  function handleAttachmentsChange(attachments: TicketDetailAttachment[]) {
    setTicket((current) => (current ? { ...current, attachments } : current));
  }

  if (state === "loading") {
    return <LoadingSpinner label="Loading ticket…" />;
  }

  if (state === "not-found") {
    return (
      <ErrorState
        message="This ticket could not be found."
        action={
          <Button variant="secondary" onClick={() => navigate(ROUTES.list)}>
            Back to My Tickets
          </Button>
        }
      />
    );
  }

  if (state === "failure") {
    return (
      <ErrorState
        message="Unable to load this ticket. Please try again."
        action={
          <Button variant="secondary" onClick={() => setRetryToken((t) => t + 1)}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!ticket) return null;
  const current = ticket;

  function openMarkDialog() {
    setMarkComment("");
    setMarkError(null);
    setMarking(true);
  }

  async function confirmMark() {
    setMarkBusy(true);
    setMarkError(null);
    try {
      const result = await markAppearsResolved(current.id, markComment.trim() || undefined);
      setTicket({ ...current, requesterResolvedAt: result.requesterResolvedAt, canMarkAppearsResolved: false });
      if (result.comment) setPostedComments((posted) => [...posted, result.comment as DiscussionEntry]);
      setMarking(false);
    } catch (error) {
      const err = error instanceof ApiError ? error : null;
      if (err?.fields?.comment) setMarkError(err.fields.comment);
      else if (err?.code === "ALREADY_MARKED") setMarkError("This ticket can no longer be marked. Reload to see its latest state.");
      else setMarkError("Something went wrong. Please try again.");
    } finally {
      setMarkBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link to={ROUTES.list} className="zg-btn-tertiary btn px-0 mb-2">
          ← Back to My Tickets
        </Link>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <h1 className="h3 mb-0">{ticket.ticketNumber}</h1>
          <Badge kind="status" value={ticket.currentStatus} />
          <Badge kind="priority" value={ticket.requestedPriority} />
          {ticket.requesterResolvedAt && (
            <span className="zg-pill zg-pill--resolved"><span aria-hidden="true">✓ </span>Requester: appears resolved</span>
          )}
          {ticket.canMarkAppearsResolved && !ticket.requesterResolvedAt && (
            <Button variant="secondary" onClick={openMarkDialog}>
              Problem appears resolved
            </Button>
          )}
        </div>
        {ticket.requesterResolvedAt && (
          <p className="small mb-0 mt-2" style={{ color: "var(--zg-text-muted)" }}>
            You told IT Staff this appears resolved on {formatDate(ticket.requesterResolvedAt)}.
          </p>
        )}
        <p className="mb-0 mt-2" data-testid="ticket-owner">
          <span className="zg-label d-inline me-1">Owner:</span>
          {ticket.owner ? ticket.owner.name : <em style={{ color: "var(--zg-text-muted)" }}>Not yet assigned</em>}
        </p>
      </div>

      <div className="zg-card mb-4">
        <h2 className="h5 mb-3">Ticket Information</h2>
        <div className="row">
          <div className="col-md-6 mb-3">
            <div className="zg-label">Category</div>
            <div>{ticket.category.name}</div>
          </div>
          <div className="col-md-6 mb-3">
            <div className="zg-label">Related System</div>
            <div>{ticket.relatedSystem.name}</div>
          </div>
          <div className="col-md-6 mb-3">
            <div className="zg-label">Requester</div>
            <div>{ticket.requester.name}</div>
          </div>
          <div className="col-md-6 mb-3">
            <div className="zg-label">Ticket Date</div>
            <div>{formatDate(ticket.createdAt)}</div>
          </div>
          <div className="col-12 mb-3">
            <div className="zg-label">Summary</div>
            <div>{ticket.summary}</div>
          </div>
          <div className="col-12">
            <div className="zg-label">Description</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</div>
          </div>
        </div>
      </div>

      {ticket.resolutionSummary && (
        <section className="zg-card mb-4" aria-label="Resolution">
          <h2 className="h5 mb-2">Resolution</h2>
          <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{ticket.resolutionSummary}</p>
        </section>
      )}

      <AttachmentSection
        locked={CLOSED_STATUSES.has(ticket.currentStatus)}
        ticketId={ticket.id}
        attachments={ticket.attachments}
        onAttachmentsChange={handleAttachmentsChange}
      />

      <section className="zg-card mt-4" aria-labelledby="comments-heading">
        <h2 id="comments-heading" className="h5 mb-1">
          Comments
        </h2>
        <p className="small mb-3" style={{ color: "var(--zg-text-muted)" }}>
          Visible to you and IT Staff
        </p>
        <DiscussionThread
          key={ticket.id}
          load={() => fetchComments(ticket.id)}
          post={(body) => postComment(ticket.id, body)}
          emptyText="No comments yet."
          composerLabel="Add a comment"
          submitLabel="Post comment"
          closedNote={ticket.canComment ? null : CLOSED_COMMENT_NOTE}
          appended={postedComments}
        />
      </section>

      {marking && (
        <Modal titleId="appears-resolved-title" onClose={() => setMarking(false)}>
          <h2 id="appears-resolved-title" className="h5">Problem appears resolved</h2>
          <p>Let IT Staff know the problem appears to be resolved? They will confirm and close the ticket.</p>
          <label htmlFor="appears-resolved-comment" className="zg-label">Comment (optional)</label>
          <TextArea id="appears-resolved-comment" rows={3} value={markComment} invalid={Boolean(markError)} onChange={(e) => setMarkComment(e.target.value)} />
          <div className="d-flex justify-content-between small mt-1">
            <span>{markError && <span className="zg-field-error" role="alert">{markError}</span>}</span>
            <span style={{ color: "var(--zg-text-muted)" }}>{markComment.length}/2000</span>
          </div>
          <div className="d-flex gap-2 justify-content-end mt-3 flex-wrap">
            <Button variant="secondary" onClick={() => setMarking(false)} disabled={markBusy}>Cancel</Button>
            <Button busy={markBusy} busyLabel="Sending…" disabled={markComment.trim().length > 2000} onClick={() => void confirmMark()}>
              Confirm
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
