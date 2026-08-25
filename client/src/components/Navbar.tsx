import React from "react";
import { useRequester } from "../contexts/RequesterContext.js";

export function Navbar() {
  const { currentRequester, setCurrentRequester } = useRequester();

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
      <div className="container">
        <span className="navbar-brand">
          TokTickIT <span className="text-success fw-bold">Service Desk</span>
        </span>
        
        {currentRequester && (
          <div className="d-flex align-items-center text-white">
            <span className="me-3">Logged in as <strong>{currentRequester.name}</strong></span>
            <button 
              className="btn btn-outline-light btn-sm"
              onClick={() => setCurrentRequester(null)}
            >
              Change Requester
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
