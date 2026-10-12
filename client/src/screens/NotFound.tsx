import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState.js";
import { ROUTES } from "../routes.js";

// Lab 4, Issue 7 — an address no screen answers (docs/lab-04/ui-spec.md §8,
// FR-16, FR-19). It used to render an empty page; now it says so inside the
// shell, with the way back to the Dashboard, every role's home (D-08).
export function NotFound() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-3">Page not found</h1>
      <EmptyState
        message="We can't find that page. The link may be out of date."
        action={
          <Link to={ROUTES.dashboard} className="btn zg-btn-primary">
            Go to your Dashboard
          </Link>
        }
      />
    </div>
  );
}
