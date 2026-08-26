import { useState } from "react";
import { RequesterProvider, useRequester } from "./contexts/RequesterContext.js";
import { MockLogin } from "./components/MockLogin.js";
import { Navbar } from "./components/Navbar.js";
import { CreateTicket } from "./components/CreateTicket.js";

type View = "dashboard" | "create-ticket";

import { checkSystem, Category } from "./api.js";

type UiState = "idle" | "loading" | "success" | "error";

function Dashboard({ setView }: { setView: (v: View) => void }) {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);

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
      
      <div className="d-flex gap-3 mb-4">
        <button className="btn btn-success" onClick={() => setView("create-ticket")}>
          Create New Ticket
        </button>
        <button className="btn btn-outline-success" onClick={handleCheck} disabled={state === "loading"}>
          {state === "loading" ? "Loading…" : "Check System"}
        </button>
      </div>

      {state === "success" && (
        <div className="mt-4 border-top pt-4">
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
        <div className="mt-4 border-top pt-4">
          <p className="mb-1">System Status: <span className="text-danger fw-bold">Offline</span></p>
          <p className="text-danger">Unable to connect to TokTickIT API</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <RequesterProvider>
      <Navbar />
      <MainContent />
    </RequesterProvider>
  );
}

function MainContent() {
  const { currentRequester } = useRequester();
  const [view, setView] = useState<View>("dashboard");
  
  if (!currentRequester) {
    return <MockLogin />;
  }
  
  if (view === "create-ticket") {
    return (
      <div>
        <div className="container mt-3">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setView("dashboard")}>
            &larr; Back to Dashboard
          </button>
        </div>
        <CreateTicket />
      </div>
    );
  }

  return <Dashboard setView={setView} />;
}
