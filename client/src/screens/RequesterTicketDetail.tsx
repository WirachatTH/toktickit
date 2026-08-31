import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, fetchTicket, TicketDetail, TicketDetailAttachment } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { AttachmentSection } from "../components/AttachmentSection.js";
import { ROUTES } from "../routes.js";

// Requester Ticket Detail (ui-spec.md §6.5, specification.md BR-45/BR-46,
// AC-03). Deliberately does NOT render Public Comments, Internal Notes,
// Actions Taken, or any status-change control — those features don't exist
// in Lab 2's data model, and BR-46 requires this screen never imply
// otherwise, regardless of what a Ticket's data looks like (UI-10).

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
  const { requester } = useRequester();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!requester || !id) return;
    let cancelled = false;
    setState("loading");
    fetchTicket(requester.id, Number(id))
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
  }, [requester?.id, id, retryToken]);

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

  if (!ticket || !requester) return null;

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
        requesterId={requester.id}
        ticketId={ticket.id}
        attachments={ticket.attachments}
        onAttachmentsChange={handleAttachmentsChange}
      />
    </div>
  );
}
