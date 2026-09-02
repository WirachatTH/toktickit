import { useState } from "react";
import { checkSystem, Category } from "../api.js";

// Lab 1 — unchanged. Kept reachable at "/" as an internal status check;
// superseded as the app's entry point by the Development Requester Selector
// (Lab 2), not deleted, so client/tests/lab-01/App.test.tsx still exercises
// exactly the same behavior it always has.
type UiState = "idle" | "loading" | "success" | "error";

export default function SystemStatus() {
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
          <h2 className="h4 mt-4 mb-3">IT Request Categories</h2>
          {categories.length > 0 ? (
            <ul className="list-group">
              {categories.map((category) => (
                <li key={category.id} className="list-group-item">
                  {category.name}
                </li>
              ))}
            </ul>
          ) : (
            <p>No categories found.</p>
          )}
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
