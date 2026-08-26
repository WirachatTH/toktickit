import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateTicket } from "../../src/components/CreateTicket.js";
import { RequesterContext } from "../../src/contexts/RequesterContext.js";
import * as api from "../../src/api.js";

// Mock the API calls
vi.mock("../../src/api.js", () => ({
  getCategories: vi.fn(),
  getSystems: vi.fn(),
}));

describe("CreateTicket Component", () => {
  const mockRequester = { id: 1, name: "Test User", email: "test@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getCategories as any).mockResolvedValue([
      { id: 1, name: "Hardware" }
    ]);
    (api.getSystems as any).mockResolvedValue([
      { id: 1, name: "Email" }
    ]);
    global.fetch = vi.fn() as any;
  });

  const renderComponent = () => {
    return render(
      <RequesterContext.Provider value={{ currentRequester: mockRequester, setCurrentRequester: vi.fn() }}>
        <CreateTicket />
      </RequesterContext.Provider>
    );
  };

  it("renders the form after loading options", async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Create New IT Request/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Summary/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
  });

  it("shows validation errors when submitting an empty form", async () => {
    const user = userEvent.setup();
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText(/Create New IT Request/)).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /Create Ticket/ });
    await user.click(submitBtn);

    const form = document.querySelector("form");
    expect(form?.className).toContain("was-validated");
  });

  it("preserves form data if API submission fails", async () => {
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server rejected request" })
    });

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Create New IT Request/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Summary/), "My test summary");
    await user.type(screen.getByLabelText(/Description/), "My description");
    await user.selectOptions(screen.getByLabelText(/Category/), "1");
    await user.selectOptions(screen.getByLabelText(/Related System/), "1");

    const submitBtn = screen.getByRole("button", { name: /Create Ticket/ });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Server rejected request")).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Summary/)).toHaveValue("My test summary");
  });

  it("disables button and shows loading state during submission", async () => {
    const user = userEvent.setup();
    
    // Create a delayed promise to keep it in submitting state
    let resolveApi: (value: any) => void;
    const fetchPromise = new Promise(resolve => {
      resolveApi = resolve;
    });
    
    (global.fetch as any).mockReturnValue(fetchPromise);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Create New IT Request/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Summary/), "My test summary");
    await user.type(screen.getByLabelText(/Description/), "My description");
    await user.selectOptions(screen.getByLabelText(/Category/), "1");
    await user.selectOptions(screen.getByLabelText(/Related System/), "1");

    const submitBtn = screen.getByRole("button", { name: /Create Ticket/ });
    await user.click(submitBtn);

    expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled();

    // Resolve the promise to clean up
    resolveApi!({ ok: true, json: async () => ({ id: 1, ticketNumber: "TICK-1001" }) });
  });

  it("shows file size rejection without hitting API", async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Create New IT Request/)).toBeInTheDocument();
    });

    const file = new File(["dummy content"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 }); // 10MB

    const input = screen.getByLabelText(/Attachments/) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/File too large/)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("resets the form on successful submission", async () => {
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, ticketNumber: "TICK-9999" })
    });

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Create New IT Request/)).toBeInTheDocument();
    });

    const summaryInput = screen.getByLabelText(/Summary/) as HTMLInputElement;
    const descInput = screen.getByLabelText(/Description/) as HTMLInputElement;
    const categorySelect = screen.getByLabelText(/Category/) as HTMLSelectElement;
    const systemSelect = screen.getByLabelText(/Related System/) as HTMLSelectElement;

    await user.type(summaryInput, "Successful Summary");
    await user.type(descInput, "Successful Description");
    await user.selectOptions(categorySelect, "1");
    await user.selectOptions(systemSelect, "1");

    const submitBtn = screen.getByRole("button", { name: /Create Ticket/ });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ticket Created Successfully!/)).toBeInTheDocument();
    });

    const resetBtn = screen.getByRole("button", { name: /Create Another Ticket/ });
    await user.click(resetBtn);

    const newSummaryInput = screen.getByLabelText(/Summary/) as HTMLInputElement;
    const newDescInput = screen.getByLabelText(/Description/) as HTMLInputElement;
    const newCategorySelect = screen.getByLabelText(/Category/) as HTMLSelectElement;
    const newSystemSelect = screen.getByLabelText(/Related System/) as HTMLSelectElement;

    expect(newSummaryInput.value).toBe("");
    expect(newDescInput.value).toBe("");
    expect(newCategorySelect.value).toBe("");
    expect(newSystemSelect.value).toBe("");
  });
});
