// BR-01 — derived from the database identity column, not a hand-rolled
// counter, so it stays unique even under concurrent ticket creation.
export function formatTicketNumber(id: number): string {
  return `TCK-${String(id).padStart(6, "0")}`;
}
