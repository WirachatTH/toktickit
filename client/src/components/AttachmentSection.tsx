import { ChangeEvent, useRef, useState } from "react";
import {
  addAttachmentToTicket,
  ApiError,
  downloadAttachment,
  removeAttachment,
  TicketDetailAttachment,
} from "../api.js";
import { checkFileBeforeUpload, formatFileSize, MAX_ACTIVE_ATTACHMENTS } from "../attachmentRules.js";
import { Button } from "./Button.js";
import { FormField } from "./FormField.js";
import { TextArea } from "./TextArea.js";
import { Modal } from "./Modal.js";

export interface AttachmentSectionProps {
  requesterId: number;
  ticketId: number;
  attachments: TicketDetailAttachment[];
  onAttachmentsChange: (attachments: TicketDetailAttachment[]) => void;
}

const REASON_MIN = 3;
const REASON_MAX = 200;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

// Attachment list, add, and soft-remove for Requester Ticket Detail
// (ui-spec.md §6.5, specification.md BR-30-39, BR-46). A separate component
// from RequesterTicketDetail per the planned test file split
// (`AttachmentSection.test.tsx` — UI-12/UI-13/UI-14) — this owns everything
// attachment-shaped; the screen owns only the read-only ticket info.
export function AttachmentSection({ requesterId, ticketId, attachments, onAttachmentsChange }: AttachmentSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [removeTarget, setRemoveTarget] = useState<TicketDetailAttachment | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeFieldError, setRemoveFieldError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const activeAttachments = attachments.filter((a) => !a.isRemoved);
  const removedAttachments = attachments.filter((a) => a.isRemoved);
  const atLimit = activeAttachments.length >= MAX_ACTIVE_ATTACHMENTS;

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-choosing the same file name
    if (!file) return;

    const clientError = checkFileBeforeUpload(file);
    if (clientError) {
      setUploadError(clientError);
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const created = await addAttachmentToTicket(requesterId, ticketId, file);
      // Updates in place — no full page reload (issues.md Issue 8 "To test").
      onAttachmentsChange([...attachments, created]);
    } catch (error) {
      setUploadError(safeMessage(error, "Unable to add this attachment. Please try again."));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: TicketDetailAttachment) {
    setDownloadError(null);
    setDownloadingId(attachment.id);
    try {
      const blob = await downloadAttachment(requesterId, ticketId, attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.originalFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(safeMessage(error, "Unable to download this attachment. Please try again."));
    } finally {
      setDownloadingId(null);
    }
  }

  function openRemoveModal(attachment: TicketDetailAttachment, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setRemoveTarget(attachment);
    setRemoveReason("");
    setRemoveFieldError(null);
  }

  function closeRemoveModal() {
    setRemoveTarget(null);
    triggerRef.current?.focus();
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const trimmed = removeReason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      setRemoveFieldError(`Reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`);
      return;
    }

    setRemoveFieldError(null);
    setRemoving(true);
    try {
      const result = await removeAttachment(requesterId, ticketId, removeTarget.id, trimmed);
      onAttachmentsChange(
        attachments.map((a) =>
          a.id === result.id
            ? { ...a, isRemoved: result.isRemoved, removedAt: result.removedAt, removedReason: result.removedReason }
            : a
        )
      );
      closeRemoveModal();
    } catch (error) {
      setRemoveFieldError(safeMessage(error, "Unable to remove this attachment. Please try again."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="zg-card">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h2 className="h5 mb-0">Attachments</h2>
        <span title={atLimit ? `A Ticket may have at most ${MAX_ACTIVE_ATTACHMENTS} active attachments.` : undefined}>
          <Button
            variant="secondary"
            disabled={atLimit || uploading}
            busy={uploading}
            busyLabel="Uploading…"
            onClick={() => fileInputRef.current?.click()}
          >
            Add Attachment
          </Button>
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="zg-visually-hidden"
          onChange={handleFileChosen}
          aria-label="Add Attachment"
        />
      </div>

      {uploadError && (
        <div className="zg-field-error mb-3" role="alert">
          {uploadError}
        </div>
      )}
      {downloadError && (
        <div className="zg-field-error mb-3" role="alert">
          {downloadError}
        </div>
      )}

      {attachments.length === 0 && <p className="mb-0" style={{ color: "var(--zg-text-muted)" }}>No attachments yet.</p>}

      {activeAttachments.length > 0 && (
        <ul className="list-group mb-3">
          {activeAttachments.map((a) => (
            <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div className="zg-attachment-meta">
                <div className="zg-attachment-name" title={a.originalFilename}>
                  {a.originalFilename}
                </div>
                <div className="small" style={{ color: "var(--zg-text-muted)" }}>
                  {formatFileSize(a.sizeBytes)} · uploaded {formatDate(a.uploadedAt)}
                </div>
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="secondary"
                  busy={downloadingId === a.id}
                  busyLabel="Downloading…"
                  onClick={() => handleDownload(a)}
                >
                  Download
                </Button>
                <Button variant="destructive" onClick={(e) => openRemoveModal(a, e.currentTarget)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {removedAttachments.length > 0 && (
        <>
          <hr />
          <ul className="list-group">
            {removedAttachments.map((a) => (
              <li key={a.id} className="list-group-item zg-attachment-removed">
                <div className="zg-attachment-name" title={a.originalFilename}>
                  {a.originalFilename}
                </div>
                <div className="small" style={{ color: "var(--zg-text-muted)" }}>
                  {formatFileSize(a.sizeBytes)} · removed {a.removedAt && formatDate(a.removedAt)}
                </div>
                <div className="small">Reason: {a.removedReason}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      {removeTarget && (
        <Modal titleId="remove-attachment-title" onClose={closeRemoveModal}>
          <h2 id="remove-attachment-title" className="h5">
            Remove Attachment
          </h2>
          <p>
            Remove <strong>{removeTarget.originalFilename}</strong>? This cannot be undone from this screen.
          </p>
          <FormField htmlFor="remove-reason" label="Reason for removal" required error={removeFieldError ?? undefined}>
            <TextArea
              id="remove-reason"
              rows={3}
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              disabled={removing}
            />
          </FormField>
          <div className="d-flex gap-2 justify-content-end zg-actions-stack">
            <Button variant="secondary" onClick={closeRemoveModal} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" busy={removing} busyLabel="Removing…" onClick={confirmRemove}>
              Remove Attachment
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
