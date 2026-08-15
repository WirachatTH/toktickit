import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states you must handle for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  void categories;

  async function handleCheck() {
    setState("loading");
    try {
      const res = await checkSystem();
      setCategories(res.categories);
      setState("success");
    } catch (err) {
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "success" && (
        <div className="mt-4">
          <p>System Status: <span className="text-success fw-bold">Online</span></p>
        </div>
      )}

      {state === "error" && (
        <div className="mt-4">
          <p className="mb-1">System Status: <span className="text-danger fw-bold">Offline</span></p>
          <p className="text-danger">Unable to connect to TokTickIT API</p>
        </div>
      )}
    </div>
  );
}
