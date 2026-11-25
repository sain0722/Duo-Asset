import { describe, expect, it } from "vitest";

import { startMonthChoice } from "./start-month";

describe("startMonthChoice", () => {
  it("이미 끝난 지난달을 기준 월로 권한다 (달이 끝나야 마감할 수 있다)", () => {
    expect(startMonthChoice(new Date("2026-11-09T05:00:00+09:00"))).toEqual({
      thisMonth: "2026-11",
      lastMonth: "2026-10",
      suggested: "2026-10",
    });
    expect(startMonthChoice(new Date("2026-11-25T12:00:00+09:00")).suggested).toBe("2026-10");
  });

  it("서울 기준으로 판단한다 (UTC 로는 아직 지난달 말)", () => {
    expect(startMonthChoice(new Date("2026-12-31T16:00:00Z"))).toEqual({
      thisMonth: "2027-01",
      lastMonth: "2026-12",
      suggested: "2026-12",
    });
  });
});
