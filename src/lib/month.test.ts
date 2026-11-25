import { describe, expect, it } from "vitest";
import { addMonths, compareYm, currentYm, diffMonths, isYm, monthEndDate, todayInSeoul, ymRange } from "./month";

describe("월 연산", () => {
  it("월을 더하고 뺀다", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-05", 60)).toBe("2031-05");
  });

  it("월 차이와 비교", () => {
    expect(diffMonths("2026-11", "2027-02")).toBe(3);
    expect(diffMonths("2026-11", "2026-11")).toBe(0);
    expect(compareYm("2026-11", "2027-01")).toBeLessThan(0);
    expect(ymRange("2026-11", "2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("형식 검사와 말일", () => {
    expect(isYm("2026-11")).toBe(true);
    expect(isYm("2026-13")).toBe(false);
    expect(isYm("2026-1")).toBe(false);
    expect(monthEndDate("2026-02")).toBe("2026-02-28");
    expect(monthEndDate("2028-02")).toBe("2028-02-29");
  });

  it("이번 달은 기기 시간대가 아니라 Asia/Seoul 기준이다", () => {
    // UTC 로는 11월 30일 15:30 이지만 서울은 12월 1일 00:30
    const instant = new Date("2026-11-30T15:30:00Z");
    expect(currentYm(instant)).toBe("2026-12");
    expect(todayInSeoul(instant)).toBe("2026-12-01");
    expect(currentYm(new Date("2026-11-30T14:59:00Z"))).toBe("2026-11");
  });
});
