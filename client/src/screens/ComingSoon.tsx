import { EmptyState } from "../components/EmptyState.js";

// Lab 3, Issue 4 — the IT Staff and Administrator home routes exist from now
// on, so navigation, sign-in, and the forbidden redirect have somewhere real to
// land. Their screens replace this: the Ticket Queue in Issue 7, User
// Management in Issue 9.
export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <h1 className="h3 mb-3">{title}</h1>
      <EmptyState message="This screen is not available yet." />
    </>
  );
}
