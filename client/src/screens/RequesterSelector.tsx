import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchActiveRequesters, Requester } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";
import { ROUTES } from "../routes.js";
import { Button } from "../components/Button.js";
import { Select } from "../components/Select.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { EmptyState } from "../components/EmptyState.js";
import { ErrorState } from "../components/ErrorState.js";

type LoadState = "loading" | "empty" | "error" | "loaded";

// Development Requester Selection screen (ui-spec.md §6.2, BR-03, BR-06,
// AC-14). A testing mechanism, not authentication — see the explanatory
// copy below, which must stay on screen exactly as the labsheet requires it.
export function RequesterSelector() {
  const [state, setState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [retryToken, setRetryToken] = useState(0);
  const { selectRequester } = useRequester();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchActiveRequesters()
      .then((data) => {
        if (cancelled) return;
        setRequesters(data);
        setState(data.length === 0 ? "empty" : "loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  function handleContinue() {
    const chosen = requesters.find((r) => String(r.id) === selectedId);
    if (!chosen) return;
    selectRequester(chosen);
    navigate(ROUTES.list, { replace: true });
  }

  return (
    <div className="container py-5" style={{ maxWidth: 480 }}>
      <h1 className="h3 mb-3">TokTickIT</h1>
      <p className="mb-4" style={{ color: "var(--zg-text-muted)" }}>
        Select a Development Requester to test requester-specific ticket
        behavior. This is not a login screen. Authentication and role-based
        access will be introduced in Lab 3.
      </p>

      {state === "loading" && <LoadingSpinner label="Loading Development Requesters…" />}

      {state === "empty" && (
        <EmptyState message="No active Requesters are available. Contact an administrator." />
      )}

      {state === "error" && (
        <ErrorState
          message="Unable to load Development Requesters. Please try again."
          action={
            <Button variant="secondary" onClick={() => setRetryToken((t) => t + 1)}>
              Retry
            </Button>
          }
        />
      )}

      {state === "loaded" && (
        <div>
          <label htmlFor="requester-select" className="zg-label">
            Development Requester
          </label>
          <Select
            id="requester-select"
            className="mb-3"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="" disabled>
              Select a Requester…
            </option>
            {requesters.map((requester) => (
              <option key={requester.id} value={requester.id}>
                {requester.name}
              </option>
            ))}
          </Select>

          <div className="zg-actions-stack">
            <Button variant="primary" disabled={!selectedId} onClick={handleContinue}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
