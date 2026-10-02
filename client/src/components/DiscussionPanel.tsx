import { KeyboardEvent, ReactNode, useId, useRef, useState } from "react";
import { fetchComments, fetchInternalNotes, postComment, postInternalNote } from "../api.js";
import { DiscussionThread } from "./DiscussionThread.js";

// Lab 3, Issue 6 — Public comments and Internal notes side by side for IT Staff
// and Administrators (docs/lab-03/ui-spec.md §1.6, §7.2; AC-24, FR-20).
// Issue 8 mounts it on IT Staff Ticket Detail.
//
// The two can never be confused (the labsheet's reason for the rule):
// - separate tabs, each with its own draft, so text typed as a note is still a
//   note after switching tabs and can't be posted publicly by accident;
// - the note thread and its composer sit inside the Internal region, with its
//   own colours, dashed edge, and a caption that says so in words;
// - the buttons say "Post public comment" and "Add internal note".

export const CLOSED_COMMENT_NOTE = "This ticket is closed — new comments are not accepted.";

export function InternalRegion({ children }: { children: ReactNode }) {
  return (
    <div className="zg-internal-region">
      <p className="zg-internal-caption">
        <span aria-hidden="true">🔒 </span>
        Internal — not visible to the Requester
      </p>
      {children}
    </div>
  );
}

type Tab = "public" | "internal";
const TABS: { id: Tab; label: string }[] = [
  { id: "public", label: "Public comments" },
  { id: "internal", label: "Internal notes" },
];

export interface DiscussionPanelProps {
  ticketId: number;
  /** False on a CLOSED or CANCELLED ticket: notes only (BR-52). */
  canComment: boolean;
  /** False for an Administrator, who reads both but posts neither (BR-21). */
  canPost: boolean;
}

export function DiscussionPanel({ ticketId, canComment, canPost }: DiscussionPanelProps) {
  const baseId = useId();
  const [active, setActive] = useState<Tab>("public");
  const [drafts, setDrafts] = useState<Record<Tab, string>>({ public: "", internal: "" });
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ public: null, internal: null });
  const setDraft = (tab: Tab) => (value: string) => setDrafts((current) => ({ ...current, [tab]: value }));

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Tab = active === "public" ? "internal" : "public";
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="zg-card">
      <div role="tablist" aria-label="Ticket discussion" className="zg-tabs mb-3">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-${id}-tab`}
            aria-selected={active === id}
            aria-controls={`${baseId}-${id}-panel`}
            tabIndex={active === id ? 0 : -1}
            className={"zg-tab" + (active === id ? " zg-tab--active" : "")}
            onClick={() => setActive(id)}
            onKeyDown={handleKeyDown}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Both panels stay mounted (hidden when inactive), so each keeps its thread and draft. */}
      <div role="tabpanel" id={`${baseId}-public-panel`} aria-labelledby={`${baseId}-public-tab`} hidden={active !== "public"}>
        <p className="small" style={{ color: "var(--zg-text-muted)" }}>
          Visible to the Requester
        </p>
        <DiscussionThread
          load={() => fetchComments(ticketId)}
          post={canPost ? (body) => postComment(ticketId, body) : undefined}
          emptyText="No comments yet."
          composerLabel="Add a public comment"
          submitLabel="Post public comment"
          closedNote={canComment ? null : CLOSED_COMMENT_NOTE}
          draft={drafts.public}
          onDraftChange={setDraft("public")}
        />
      </div>

      <div role="tabpanel" id={`${baseId}-internal-panel`} aria-labelledby={`${baseId}-internal-tab`} hidden={active !== "internal"}>
        <InternalRegion>
          <DiscussionThread
            load={() => fetchInternalNotes(ticketId)}
            post={canPost ? (body) => postInternalNote(ticketId, body) : undefined}
            emptyText="No internal notes yet."
            composerLabel="Add an internal note"
            submitLabel="Add internal note"
            draft={drafts.internal}
            onDraftChange={setDraft("internal")}
          />
        </InternalRegion>
      </div>
    </section>
  );
}
