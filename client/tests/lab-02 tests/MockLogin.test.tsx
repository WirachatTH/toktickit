import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockLogin } from "../../src/components/MockLogin.js";
import { RequesterProvider, useRequester } from "../../src/contexts/RequesterContext.js";
import * as api from "../../src/api.js";

// Mock the API module
vi.mock("../../src/api.js", () => ({
  getRequesters: vi.fn(),
}));

describe("MockLogin Component", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the loading state initially", () => {
    // Return a promise that doesn't resolve immediately
    (api.getRequesters as any).mockImplementation(() => new Promise(() => {}));
    
    render(
      <RequesterProvider>
        <MockLogin />
      </RequesterProvider>
    );

    expect(screen.getByTestId("loading-state")).toBeInTheDocument();
  });

  it("renders an error message on API failure", async () => {
    (api.getRequesters as any).mockRejectedValue(new Error("Network Error"));
    
    render(
      <RequesterProvider>
        <MockLogin />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
  });

  it("renders a dropdown with requesters and verifies Zen Green Theme classes", async () => {
    const mockRequesters = [
      { id: 1, name: "John Doe", email: "john@example.com" },
      { id: 2, name: "Jane Smith", email: "jane@example.com" },
    ];
    (api.getRequesters as any).mockResolvedValue(mockRequesters);
    
    render(
      <RequesterProvider>
        <MockLogin />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    });

    // Check dropdown CSS
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(select.className).toContain("bg-pale-green");

    // Check button CSS
    const button = screen.getByRole("button", { name: /Simulate Login/i });
    expect(button.className).toContain("btn-success");
  });

  it("renders empty state when no active requesters exist", async () => {
    (api.getRequesters as any).mockResolvedValue([]);
    
    render(
      <RequesterProvider>
        <MockLogin />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("updates global context when a requester is selected and submitted", async () => {
    const user = userEvent.setup();
    const mockRequesters = [
      { id: 1, name: "John Doe", email: "john@example.com" },
      { id: 2, name: "Jane Smith", email: "jane@example.com" },
    ];
    (api.getRequesters as any).mockResolvedValue(mockRequesters);
    
    const ContextObserver = () => {
      const { currentRequester } = useRequester();
      return <div data-testid="context-value">{currentRequester?.name || "None"}</div>;
    };

    render(
      <RequesterProvider>
        <MockLogin />
        <ContextObserver />
      </RequesterProvider>
    );

    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "2");
    
    const button = screen.getByRole("button", { name: /Simulate Login/i });
    await user.click(button);
    
    expect(screen.getByTestId("context-value")).toHaveTextContent("Jane Smith");
  });
});
