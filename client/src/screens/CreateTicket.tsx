import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchCategories,
  fetchRelatedSystems,
  createTicket,
  ApiError,
  Category,
  RelatedSystem,
  RequestedPriority,
  Ticket,
} from "../api.js";
import { useRequester } from "../context/RequesterContext.js";
import { checkFileBeforeUpload, formatFileSize, MAX_ACTIVE_ATTACHMENTS } from "../attachmentRules.js";
import { FormField } from "../components/FormField.js";
import { TextInput } from "../components/TextInput.js";
import { TextArea } from "../components/TextArea.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { ROUTES } from "../routes.js";

// Create Ticket (ui-spec.md §6.3, specification.md FR-03/FR-04/FR-05, BR-38).
// Attachment upload is wired for real here — see issues.md's Issue 5 scope
// note: an independent Lab 2 build shipped a Create Ticket screen whose
// attachment picker looked complete but was never actually connected to a
// working upload until a later audit caught it. This form's picker calls
// the real POST /api/tickets from the start.

const SUMMARY_MIN = 5;
const SUMMARY_MAX = 120;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;

interface PendingFile {
  file: File;
  error: string | null;
}

type Screen = "form" | "success";

export function CreateTicket() {
  const { requester } = useRequester();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [systems, setSystems] = useState<RelatedSystem[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [referenceError, setReferenceError] = useState(false);
  const [referenceRetryToken, setReferenceRetryToken] = useState(0);

  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState<RequestedPriority>("MEDIUM");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [screen, setScreen] = useState<Screen>("form");
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReferenceLoading(true);
    setReferenceError(false);
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([cats, syss]) => {
        if (cancelled) return;
        setCategories(cats);
        setSystems(syss);
        setReferenceLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setReferenceError(true);
        setReferenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [referenceRetryToken]);

  function handleFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-choosing a file with the same name
    if (chosen.length === 0) return;

    setPendingFiles((current) => {
      const room = Math.max(MAX_ACTIVE_ATTACHMENTS - current.length, 0);
      const accepted = chosen.slice(0, room).map((file) => ({ file, error: checkFileBeforeUpload(file) }));
      const overflow = chosen.slice(room).map((file) => ({
        file,
        error: `A ticket may have at most ${MAX_ACTIVE_ATTACHMENTS} attachments.`,
      }));
      return [...current, ...accepted, ...overflow];
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((current) => current.filter((_, i) => i !== index));
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!categoryId) errors.categoryId = "Category is required.";
    if (!relatedSystemId) errors.relatedSystemId = "Related System is required.";

    const trimmedSummary = summary.trim();
    if (trimmedSummary.length < SUMMARY_MIN || trimmedSummary.length > SUMMARY_MAX) {
      errors.summary = `Summary must be between ${SUMMARY_MIN} and ${SUMMARY_MAX} characters.`;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length < DESCRIPTION_MIN || trimmedDescription.length > DESCRIPTION_MAX) {
      errors.description = `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`;
    }

    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !requester) return;

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Some fields need attention before this ticket can be created.");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const validFiles = pendingFiles.filter((f) => !f.error).map((f) => f.file);
      const ticket = await createTicket(requester.id, {
        categoryId: Number(categoryId),
        relatedSystemId: Number(relatedSystemId),
        summary: summary.trim(),
        description: description.trim(),
        requestedPriority,
        attachments: validFiles,
      });
      setCreatedTicket(ticket);
      setScreen("success");
    } catch (error) {
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR" && error.fields) {
        setFieldErrors(error.fields);
        setFormError(error.message);
      } else {
        // Safe message only (BR-28). Every value the Requester typed and every
        // still-valid attachment selection stays in state — nothing is cleared
        // on failure (BR-27).
        setFormError(
          "Cannot reach the TokTickIT API. Your ticket has not been created, and nothing you entered has been lost — try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCategoryId("");
    setRelatedSystemId("");
    setRequestedPriority("MEDIUM");
    setSummary("");
    setDescription("");
    setPendingFiles([]);
    setFieldErrors({});
    setFormError(null);
    setScreen("form");
    setCreatedTicket(null);
  }

  if (screen === "success" && createdTicket) {
    return (
      <div style={{ maxWidth: 640 }} role="status">
        <div className="zg-empty-state" style={{ background: "var(--zg-pale)", borderColor: "var(--zg-secondary)" }}>
          <h2 className="h4 mb-2">✓ Ticket created</h2>
          <p className="mb-1">
            Ticket <strong data-testid="created-ticket-number">{createdTicket.ticketNumber}</strong> was created
            successfully.
          </p>
          <p className="mb-3">Requester: {requester?.name}</p>
          <div className="d-flex gap-2 justify-content-center">
            <Button variant="primary" onClick={() => navigate(ROUTES.detail(createdTicket.id))}>
              View Ticket
            </Button>
            <Button variant="secondary" onClick={resetForm}>
              Create Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (referenceError) {
    return (
      <ErrorState
        message="Unable to load Categories and Related Systems. Please try again."
        action={
          <Button variant="secondary" onClick={() => setReferenceRetryToken((t) => t + 1)}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ maxWidth: 720 }}>
      <h1 className="h3 mb-4">Create Ticket</h1>

      {formError && (
        <div className="zg-error-state mb-3" role="alert">
          {formError}
        </div>
      )}

      <div className="row">
        <div className="col-md-4 mb-3">
          <label className="zg-label" htmlFor="ticketNumber">
            Ticket Number
          </label>
          <TextInput id="ticketNumber" readOnly value="Generated after submission" />
        </div>
        <div className="col-md-4 mb-3">
          <label className="zg-label" htmlFor="ticketDate">
            Ticket Date
          </label>
          <TextInput id="ticketDate" readOnly value="—" />
        </div>
        <div className="col-md-4 mb-3">
          <label className="zg-label" htmlFor="ticketRequester">
            Requester
          </label>
          <TextInput id="ticketRequester" readOnly value={requester?.name ?? ""} />
        </div>
      </div>

      {referenceLoading && <LoadingSpinner label="Loading Categories and Related Systems…" />}

      <div className="row">
        <div className="col-md-6">
          <FormField htmlFor="categoryId" label="Category" required error={fieldErrors.categoryId}>
            <Select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={submitting || referenceLoading}
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="col-md-6">
          <FormField htmlFor="relatedSystemId" label="Related System" required error={fieldErrors.relatedSystemId}>
            <Select
              id="relatedSystemId"
              value={relatedSystemId}
              onChange={(e) => setRelatedSystemId(e.target.value)}
              disabled={submitting || referenceLoading}
            >
              <option value="">Choose a system…</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </div>

      <FormField htmlFor="requestedPriority" label="Requested Priority" required>
        <Select
          id="requestedPriority"
          value={requestedPriority}
          onChange={(e) => setRequestedPriority(e.target.value as RequestedPriority)}
          disabled={submitting}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </Select>
      </FormField>

      <FormField htmlFor="summary" label="Ticket Summary" required error={fieldErrors.summary}>
        <TextInput id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} disabled={submitting} />
        <div className="form-text">
          {summary.trim().length}/{SUMMARY_MAX}
        </div>
      </FormField>

      <FormField htmlFor="description" label="Description" required error={fieldErrors.description}>
        <TextArea
          id="description"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
        <div className="form-text">
          {description.trim().length}/{DESCRIPTION_MAX}
        </div>
      </FormField>

      <div className="mb-4">
        <label className="zg-label" htmlFor="attachmentPicker">
          Attachments
        </label>
        <input
          id="attachmentPicker"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={handleFilesChosen}
          disabled={submitting || pendingFiles.length >= MAX_ACTIVE_ATTACHMENTS}
        />
        <div className="form-text">
          JPG, JPEG, PNG, WEBP, or PDF · max 5 MB each · up to {MAX_ACTIVE_ATTACHMENTS} files
        </div>

        {pendingFiles.length > 0 && (
          <ul className="list-group mt-2">
            {pendingFiles.map((pending, index) => (
              <li
                key={`${pending.file.name}-${index}`}
                className="list-group-item d-flex justify-content-between align-items-start"
              >
                <span>
                  {pending.file.name} ({formatFileSize(pending.file.size)})
                  {pending.error && (
                    <span className="zg-field-error d-block" role="alert">
                      {pending.error}
                    </span>
                  )}
                </span>
                <Button variant="tertiary" type="button" onClick={() => removePendingFile(index)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="d-flex gap-2">
        <Button type="submit" variant="primary" busy={submitting} busyLabel="Submitting…">
          Submit Ticket
        </Button>
        <Button type="button" variant="secondary" disabled={submitting} onClick={() => navigate(ROUTES.list)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
