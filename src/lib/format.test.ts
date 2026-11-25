import { describe, expect, it } from "vitest";
import { formatCompactWon, formatKoreanWon, formatPercent, formatWon, formatYm, formatYmShort, parseWonInput } from "./format";

describe("금액 표기", () => {
  it("원 단위", () => {
    expect(formatWon(4_800_000)).toBe("4,800,000원");
    expect(formatWon(-692_000)).toBe("−692,000원");
    expect(formatWon(120_000, { sign: true })).toBe("+120,000원");
    expect(formatWon(0, { sign: true })).toBe("0원");
  });

  it("한국어 단위", () => {
    expect(formatKoreanWon(4_800_000)).toBe("480만 원");
    expect(formatKoreanWon(123_456_789)).toBe("1억 2,345만 6,789원");
    expect(formatKoreanWon(300_000_000)).toBe("3억 원");
    expect(formatKoreanWon(6_789)).toBe("6,789원");
    expect(formatKoreanWon(0)).toBe("0원");
    expect(formatKoreanWon(-15_000_000)).toBe("−1,500만 원");
    expect(formatKoreanWon(100_005_000)).toBe("1억 5,000원");
  });

  it("요약 표기는 만 원 미만을 반올림한다", () => {
    expect(formatCompactWon(123_456_789)).toBe("1억 2,346만 원");
    expect(formatCompactWon(692_000)).toBe("69만 원");
    expect(formatCompactWon(6_789)).toBe("6,789원");
    expect(formatCompactWon(-2_345_000, { sign: true })).toBe("−235만 원");
    expect(formatCompactWon(99_996_000)).toBe("1억 원");
  });

  it("비율과 월", () => {
    expect(formatPercent(40.25)).toBe("40.3%");
    expect(formatYm("2026-11")).toBe("2026년 11월");
    expect(formatYmShort("2026-03")).toBe("26.03");
  });

  it("입력 파싱: 빈 값은 null 이고 0 과 구분된다", () => {
    expect(parseWonInput("4,800,000")).toBe(4_800_000);
    expect(parseWonInput("480만")).toBe(480);
    expect(parseWonInput("")).toBeNull();
    expect(parseWonInput("원")).toBeNull();
    expect(parseWonInput("0")).toBe(0);
    expect(parseWonInput("-50,000")).toBe(-50_000);
  });
});
