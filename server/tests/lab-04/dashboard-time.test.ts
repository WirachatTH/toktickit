import { describe, it, expect } from "vitest";
import { bangkokToday, lastSevenDaysStart } from "../../src/dashboardTime.js";

// UNIT-06 — the Asia/Bangkok day boundaries the dashboards count by
// (docs/lab-04/specification.md BR-33, D-19). Bangkok is UTC+07:00 with no
// daylight saving, so a Bangkok day runs from 17:00 UTC to 17:00 UTC.

const at = (iso: string) => new Date(iso);

describe("UNIT-06 Bangkok days (BR-33)", () => {
  it("puts 16:59:59.999Z in the earlier Bangkok day and 17:00:00.000Z in the next", () => {
    expect(bangkokToday(at("2026-10-05T16:59:59.999Z"))).toEqual({ start: at("2026-10-04T17:00:00.000Z"), end: at("2026-10-05T17:00:00.000Z") });
    expect(bangkokToday(at("2026-10-05T17:00:00.000Z"))).toEqual({ start: at("2026-10-05T17:00:00.000Z"), end: at("2026-10-06T17:00:00.000Z") });
  });

  it("is the same whole day from its first to its last millisecond", () => {
    const day = { start: at("2026-10-05T17:00:00.000Z"), end: at("2026-10-06T17:00:00.000Z") };
    for (const instant of ["2026-10-05T17:00:00.000Z", "2026-10-06T00:00:00.000Z", "2026-10-06T16:59:59.999Z"]) {
      expect(bangkokToday(at(instant)), instant).toEqual(day);
    }
  });

  it("crosses a month end and a year end correctly", () => {
    // 1 November 2026, 06:00 in Bangkok is still 31 October in UTC.
    expect(bangkokToday(at("2026-10-31T23:00:00.000Z"))).toEqual({ start: at("2026-10-31T17:00:00.000Z"), end: at("2026-11-01T17:00:00.000Z") });
    // 1 January 2027, 01:00 in Bangkok.
    expect(bangkokToday(at("2026-12-31T18:00:00.000Z"))).toEqual({ start: at("2026-12-31T17:00:00.000Z"), end: at("2027-01-01T17:00:00.000Z") });
    // A leap day, in Bangkok terms.
    expect(bangkokToday(at("2028-02-29T12:00:00.000Z"))).toEqual({ start: at("2028-02-28T17:00:00.000Z"), end: at("2028-02-29T17:00:00.000Z") });
  });

  it("starts the 7-day window at 00:00 Bangkok six days back", () => {
    expect(lastSevenDaysStart(at("2026-10-05T09:00:00.000Z"))).toEqual(at("2026-09-28T17:00:00.000Z"));
    expect(lastSevenDaysStart(at("2026-10-05T17:00:00.000Z"))).toEqual(at("2026-09-29T17:00:00.000Z"));
  });
});
