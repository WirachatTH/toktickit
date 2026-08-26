import React, { useEffect, useState } from "react";
import { getRequesters, RequesterUser } from "../api.js";
import { useRequester } from "../contexts/RequesterContext.js";

type UiState = "idle" | "loading" | "success" | "error" | "empty";

export function MockLogin() {
  const { setCurrentRequester } = useRequester();
  const [state, setState] = useState<UiState>("loading");
  const [requesters, setRequesters] = useState<RequesterUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    async function fetchRequesters() {
      try {
        const data = await getRequesters();
        if (data.length === 0) {
          setState("empty");
        } else {
          setRequesters(data);
          setSelectedId(data[0].id.toString());
          setState("success");
        }
      } catch (err) {
        setState("error");
      }
    }
    fetchRequesters();
  }, []);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const user = requesters.find((r) => r.id.toString() === selectedId);
    if (user) {
      setCurrentRequester(user);
    }
  }

  return (
    <div className="container py-5 d-flex justify-content-center">
      <div className="card shadow-sm" style={{ width: "100%", maxWidth: "450px" }}>
        <div className="card-body p-4">
          <h2 className="h4 mb-4 text-center">Development Mock Login</h2>
          
          {state === "loading" && (
            <div className="text-center py-4" data-testid="loading-state">
              <div className="spinner-border text-success" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="alert alert-danger" data-testid="error-state">
              Unable to load requesters from API. Please ensure the backend is running.
            </div>
          )}

          {state === "empty" && (
            <div className="alert alert-warning" data-testid="empty-state">
              No active requesters found in the database. Did you run the seed script?
            </div>
          )}

          {state === "success" && (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label htmlFor="requesterSelect" className="form-label text-muted">
                  Select a Development Requester
                </label>
                <select 
                  id="requesterSelect" 
                  className="form-select bg-pale-green"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {requesters.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.name} ({req.email})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-success w-100 py-2">
                Simulate Login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
