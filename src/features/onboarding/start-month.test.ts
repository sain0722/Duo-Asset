import { describe, expect, it } from "vitest";

import { startMonthChoice } from "./start-month";

describe("startMonthChoice", () => {
  it("10일 전이면 지난달을 권한다", () => {
    expect(startMonthChoice(new Date("2026-11-09T05:00:00+09:00"))).toEqual({
      thisMonth: "2026-11",
      lastMonth: "2026-10",
      suggested: "2026-10",
    });
  });

  it("10일부터는 이번 달을 권한다", () => {
    expect(startMonthChoice(new Date("2026-11-10T00:00:00+09:00")).suggested).toBe("2026-11");
  });

  it("서울 기준으로 판단한다 (UTC 로는 아직 지난달 말)", () => {
    expect(startMonthChoice(new Date("2026-12-31T16:00:00Z"))).toEqual({
      thisMonth: "2027-01",
      lastMonth: "2026-12",
      suggested: "2026-12",
    });
  });
});
