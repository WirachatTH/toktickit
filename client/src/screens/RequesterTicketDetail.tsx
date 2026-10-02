import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, fetchComments, fetchTicket, postComment, TicketDetail, TicketDetailAttachment } from "../api.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { DiscussionThread } from "../components/DiscussionThread.js";
import { CLOSED_COMMENT_NOTE } from "../components/DiscussionPanel.js";
import { ROUTES } from "../routes.js";

// Requester Ticket Detail (ui-spec.md §6.5, specification.md BR-45/BR-46,
// AC-03). Deliberately does NOT render Public Comments, Internal Notes,
// Actions Taken, or any status-change control — those features don't exist
// in Lab 2's data model, and BR-46 requires this screen never imply
// otherwise, regardless of what a Ticket's data looks like (UI-10).
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
        </div>
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
        />
      </section>
    </div>
  );
}
