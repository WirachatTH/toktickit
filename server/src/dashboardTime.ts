// Lab 4, Issue 5 — the day boundaries the dashboards count by
// (docs/lab-04/specification.md BR-33, D-19). Asia/Bangkok is UTC+07:00 and has
// no daylight saving, so a fixed offset is exact and no date library is needed
// (§7.7): a Bangkok day runs from 17:00 UTC to 17:00 UTC.

const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DASHBOARD_TIME_ZONE = "Asia/Bangkok";

/** The Bangkok calendar day containing `now`, as a half-open UTC interval [start, end). */
export function bangkokToday(now: Date): { start: Date; end: Date } {
  const local = now.getTime() + OFFSET_MS;
  const start = Math.floor(local / DAY_MS) * DAY_MS - OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

/** 00:00 Bangkok time six days before today: "the last 7 days" includes today (BR-33). */
export function lastSevenDaysStart(now: Date): Date {
  return new Date(bangkokToday(now).start.getTime() - 6 * DAY_MS);
}
