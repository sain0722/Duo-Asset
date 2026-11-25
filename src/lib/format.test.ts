import { describe, expect, it } from "vitest";
import {
  formatCompactWon,
  formatDate,
  formatKoreanWon,
  formatMonthOnly,
  formatNumber,
  formatPercent,
  formatWon,
  formatYm,
  formatYmShort,
  parseWonInput,
} from "./format";

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
    expect(parseWonInput("4800000원")).toBe(4_800_000);
    expect(parseWonInput("")).toBeNull();
    expect(parseWonInput("원")).toBeNull();
    expect(parseWonInput("0")).toBe(0);
    expect(parseWonInput("-50,000")).toBe(-50_000);
    expect(parseWonInput("−50,000")).toBe(-50_000);
  });

  it("입력 파싱: 한국어 단위와 소수점을 틀린 숫자로 만들지 않는다", () => {
    expect(parseWonInput("480만")).toBe(4_800_000);
    expect(parseWonInput("1억 2,000만")).toBe(120_000_000);
    expect(parseWonInput("1.5억")).toBe(150_000_000);
    expect(parseWonInput("69.2만")).toBe(692_000);
    expect(parseWonInput("3억 500")).toBe(300_000_500);
    // 은행 앱·엑셀에서 복사한 값: 소수점 이하는 버린다 (100배로 읽지 않는다)
    expect(parseWonInput("1,234,567.00")).toBe(1_234_567);
    // 해석할 수 없으면 미입력으로
    expect(parseWonInput("약 480")).toBeNull();
    expect(parseWonInput("12a34")).toBeNull();
    expect(parseWonInput("1.2.3")).toBeNull();
  });
});

describe("한국어 단위 표기: 경계", () => {
  it("만 원 미만은 숫자만, 만 원부터 '만' 단위를 쓴다", () => {
    expect(formatKoreanWon(9_999)).toBe("9,999원");
    expect(formatKoreanWon(10_000)).toBe("1만 원");
    expect(formatKoreanWon(10_001)).toBe("1만 1원");
    expect(formatKoreanWon(1)).toBe("1원");
  });

  it("1억 경계: 9,999만 9,999원 다음이 1억 원이다", () => {
    expect(formatKoreanWon(99_999_999)).toBe("9,999만 9,999원");
    expect(formatKoreanWon(100_000_000)).toBe("1억 원");
    expect(formatKoreanWon(100_000_001)).toBe("1억 1원");
    expect(formatKoreanWon(100_010_000)).toBe("1억 1만 원");
    expect(formatKoreanWon(12_345_678_912)).toBe("123억 4,567만 8,912원");
    // 조 단위는 따로 쓰지 않는다
    expect(formatKoreanWon(1_000_000_000_000)).toBe("10,000억 원");
  });

  it("음수는 U+2212 부호를 붙이고, 0에는 부호를 붙이지 않는다", () => {
    expect(formatKoreanWon(-1)).toBe("−1원");
    expect(formatKoreanWon(-100_000_000)).toBe("−1억 원");
    expect(formatKoreanWon(-123_456_789)).toBe("−1억 2,345만 6,789원");
    expect(formatKoreanWon(1, { sign: true })).toBe("+1원");
    expect(formatKoreanWon(4_800_000, { sign: true })).toBe("+480만 원");
    expect(formatKoreanWon(0, { sign: true })).toBe("0원");
    expect(formatWon(-1)).toBe("−1원");
    expect(formatWon(0)).toBe("0원");
  });
});

describe("요약 표기: 경계", () => {
  it("만 원 미만은 반올림하지 않고 그대로 보여 준다", () => {
    expect(formatCompactWon(0)).toBe("0원");
    expect(formatCompactWon(9_999)).toBe("9,999원");
    expect(formatCompactWon(-9_999)).toBe("−9,999원");
    expect(formatCompactWon(10_000)).toBe("1만 원");
  });

  it("만 원 이상은 5,000원에서 올리고 그 미만은 버린다", () => {
    expect(formatCompactWon(14_999)).toBe("1만 원");
    expect(formatCompactWon(15_000)).toBe("2만 원");
    expect(formatCompactWon(694_999)).toBe("69만 원");
    expect(formatCompactWon(695_000)).toBe("70만 원");
  });

  it("반올림으로 단위가 올라가면 '1억 원'으로 쓴다 (10,000만 원이 아니다)", () => {
    expect(formatCompactWon(99_994_999)).toBe("9,999만 원");
    expect(formatCompactWon(99_995_000)).toBe("1억 원");
    expect(formatCompactWon(199_995_000)).toBe("2억 원");
    expect(formatCompactWon(100_004_999)).toBe("1억 원");
    expect(formatCompactWon(100_005_000)).toBe("1억 1만 원");
  });

  it("음수는 절댓값을 반올림한 뒤 부호를 붙인다 (양수와 같은 크기)", () => {
    expect(formatCompactWon(-15_000)).toBe("−2만 원");
    expect(formatCompactWon(-14_999)).toBe("−1만 원");
    expect(formatCompactWon(-99_995_000)).toBe("−1억 원");
    expect(formatCompactWon(15_000, { sign: true })).toBe("+2만 원");
    expect(formatCompactWon(0, { sign: true })).toBe("0원");
  });
});

describe("그 밖의 표기", () => {
  it("숫자·비율·월·날짜", () => {
    expect(formatNumber(4_800_000)).toBe("4,800,000");
    expect(formatNumber(-1_234)).toBe("-1,234");
    expect(formatPercent(40.25)).toBe("40.3%");
    expect(formatPercent(-12.5)).toBe("-12.5%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(33.333, 0)).toBe("33%");
    expect(formatYm("2027-01")).toBe("2027년 1월");
    expect(formatMonthOnly("2026-12")).toBe("12월");
    expect(formatMonthOnly("2027-01")).toBe("1월");
    expect(formatYmShort("2027-01")).toBe("27.01");
    expect(formatDate("2026-11-25")).toBe("2026.11.25");
    expect(formatDate("2026-11-25T09:00:00+09:00")).toBe("2026.11.25");
  });
});

describe("입력 파싱: 추가 경계", () => {
  it("공백·쉼표·'원'만 있으면 미입력이다", () => {
    expect(parseWonInput("   ")).toBeNull();
    expect(parseWonInput(",")).toBeNull();
    expect(parseWonInput("-")).toBeNull();
    expect(parseWonInput("+")).toBeNull();
    expect(parseWonInput("만")).toBeNull();
    expect(parseWonInput("억")).toBeNull();
  });

  it("부호: +, -, − 를 하나만 읽는다", () => {
    expect(parseWonInput("+5,000")).toBe(5_000);
    expect(parseWonInput("−1억 5,000만")).toBe(-150_000_000);
    expect(parseWonInput("-480만")).toBe(-4_800_000);
    expect(parseWonInput("--5")).toBeNull();
    expect(parseWonInput("+−5")).toBeNull();
    expect(parseWonInput("5-")).toBeNull();
  });

  it("단위 조합: 억·만·나머지 순서로만 읽는다", () => {
    expect(parseWonInput("1억")).toBe(100_000_000);
    expect(parseWonInput("1억원")).toBe(100_000_000);
    expect(parseWonInput("1억 2만 3")).toBe(100_020_003);
    expect(parseWonInput("1억2000만3000")).toBe(120_003_000);
    expect(parseWonInput("1.5만원")).toBe(15_000);
    expect(parseWonInput("0만")).toBe(0);
    // 순서가 뒤집히거나 지원하지 않는 단위(천)는 틀린 숫자로 만들지 않는다
    expect(parseWonInput("2만 1억")).toBeNull();
    expect(parseWonInput("1만2천")).toBeNull();
    expect(parseWonInput("5천")).toBeNull();
  });

  it("소수 단위는 원 단위에서 반올림하고 부동소수점 오차를 남기지 않는다", () => {
    expect(parseWonInput("0.5만")).toBe(5_000);
    expect(parseWonInput("1.15만")).toBe(11_500); // 1.15 × 10,000 = 11,499.999…
    expect(parseWonInput("0.07억")).toBe(7_000_000); // 0.07 × 1억 = 7,000,000.000000001
    expect(parseWonInput("0.29억")).toBe(29_000_000);
    expect(parseWonInput("1.23456789억")).toBe(123_456_789);
    expect(parseWonInput("1.00001만")).toBe(10_000); // 10,000.1원 → 10,000원
  });

  it("단위 없는 소수는 0 쪽으로 버린다 (100배로 읽지 않는다)", () => {
    expect(parseWonInput("1.5")).toBe(1);
    expect(parseWonInput("0.9")).toBe(0);
    expect(parseWonInput("-1.9")).toBe(-1);
    expect(parseWonInput("1,234.56")).toBe(1_234);
  });

  it("지수 표기·전각 숫자·통화 기호는 읽지 않는다", () => {
    expect(parseWonInput("1e5")).toBeNull();
    expect(parseWonInput("９")).toBeNull();
    expect(parseWonInput("₩4,800,000")).toBeNull();
    expect(parseWonInput("4,800,000 KRW")).toBeNull();
  });

  it("정수로 정확히 표현할 수 없는 큰 값은 미입력으로 돌린다", () => {
    expect(parseWonInput("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseWonInput("9007199254740993")).toBeNull();
    expect(parseWonInput("100000000억")).toBeNull();
  });

  it("표기한 금액을 다시 읽으면 같은 값이 나온다", () => {
    for (const amount of [0, 1, 9_999, 10_000, 692_000, 4_800_000, 99_999_999, 100_000_000, 123_456_789, -15_000_000, 300_000_500]) {
      expect(parseWonInput(formatWon(amount))).toBe(amount);
      expect(parseWonInput(formatKoreanWon(amount))).toBe(amount);
    }
  });
});
