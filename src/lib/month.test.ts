import { describe, expect, it } from "vitest";
import {
  addMonths,
  compareYm,
  currentYm,
  diffMonths,
  isYm,
  monthEndDate,
  todayInSeoul,
  ymOf,
  ymOfDateString,
  ymParts,
  ymRange,
} from "./month";

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

describe("월 연산: 연말과 윤년", () => {
  it("12월 다음은 다음 해 1월, 1월 이전은 전 해 12월이다", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-12", 12)).toBe("2027-12");
    expect(addMonths("2026-12", 13)).toBe("2028-01");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
    expect(addMonths("2026-01", -12)).toBe("2025-01");
    expect(addMonths("2026-07", 0)).toBe("2026-07");
  });

  it("해를 넘는 월 차이와 비교", () => {
    expect(diffMonths("2026-12", "2027-01")).toBe(1);
    expect(diffMonths("2027-01", "2026-12")).toBe(-1);
    expect(diffMonths("2025-05", "2030-04")).toBe(59);
    expect(compareYm("2026-12", "2027-01")).toBeLessThan(0);
    expect(compareYm("2027-01", "2026-12")).toBeGreaterThan(0);
    expect(compareYm("2026-12", "2026-12")).toBe(0);
    // 문자열 비교가 아니라 월 단위 비교다: 차이가 그대로 나온다
    expect(compareYm("2027-02", "2026-11")).toBe(3);
  });

  it("월 범위는 양 끝을 포함하고, 끝이 시작보다 앞서면 비어 있다", () => {
    expect(ymRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(ymRange("2026-12", "2026-12")).toEqual(["2026-12"]);
    expect(ymRange("2027-01", "2026-12")).toEqual([]);
  });

  it("말일: 윤년 2월은 29일, 100으로 나누어지는 해는 400으로도 나누어져야 윤년이다", () => {
    expect(monthEndDate("2024-02")).toBe("2024-02-29");
    expect(monthEndDate("2025-02")).toBe("2025-02-28");
    expect(monthEndDate("2000-02")).toBe("2000-02-29");
    expect(monthEndDate("2100-02")).toBe("2100-02-28");
    expect(monthEndDate("2026-12")).toBe("2026-12-31");
    expect(monthEndDate("2026-11")).toBe("2026-11-30");
    expect(monthEndDate("2026-01")).toBe("2026-01-31");
  });

  it("형식 검사: 4자리 연도와 01–12 월만 받는다", () => {
    expect(isYm("2026-12")).toBe(true);
    expect(isYm("2026-01")).toBe(true);
    expect(isYm("2026-00")).toBe(false);
    expect(isYm("26-12")).toBe(false);
    expect(isYm("2026-12-01")).toBe(false);
    expect(isYm("2026/12")).toBe(false);
    expect(isYm("")).toBe(false);
  });

  it("월 분해와 날짜 문자열의 월", () => {
    expect(ymParts("2026-12")).toEqual({ year: 2026, month: 12 });
    expect(ymParts("2027-01")).toEqual({ year: 2027, month: 1 });
    expect(ymOfDateString("2026-12-31")).toBe("2026-12");
    expect(ymOfDateString("2027-01-01")).toBe("2027-01");
  });

  it("연말·윤일에도 Asia/Seoul 기준으로 달과 날짜를 정한다", () => {
    // UTC 12월 31일 15:00 = 서울 1월 1일 00:00
    expect(ymOf(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01");
    expect(ymOf(new Date("2026-12-31T14:59:59Z"))).toBe("2026-12");
    expect(todayInSeoul(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    // UTC 2월 28일 15:00 = 서울 2월 29일 00:00 (2028년은 윤년)
    expect(todayInSeoul(new Date("2028-02-28T15:00:00Z"))).toBe("2028-02-29");
    expect(todayInSeoul(new Date("2028-02-29T15:00:00Z"))).toBe("2028-03-01");
    expect(currentYm(new Date("2028-02-29T15:00:00Z"))).toBe("2028-03");
  });
});
