// Lab 3 — the two terminal statuses. A CLOSED or CANCELLED ticket takes no new
// Public Comment (BR-52) and no attachment change (BR-70).
export const CLOSED_STATUSES: ReadonlySet<string> = new Set(["CLOSED", "CANCELLED"]);

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}
