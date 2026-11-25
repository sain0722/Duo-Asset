import { describe, expect, it } from "vitest";

import { planItem } from "@/lib/finance/testing";

import { canSplitAt, inactiveReason, periodLabel, splitPlanItem } from "./plan-items";

describe("plan-items", () => {
  it("적용 기간을 짧게 표기한다", () => {
    expect(periodLabel({ start_month: null, end_month: null })).toBeNull();
    expect(periodLabel({ start_month: "2026-12", end_month: null })).toBe("26.12부터");
    expect(periodLabel({ start_month: null, end_month: "2027-03" })).toBe("27.03까지");
    expect(periodLabel({ start_month: "2026-01", end_month: "2026-06" })).toBe("26.01 ~ 26.06");
  });

  it("그 달에 빠진 이유를 알려 준다", () => {
    const bonus = planItem({ kind: "income", amount: 1_000_000, income_type: "bonus", months_of_year: [7, 1] });
    expect(inactiveReason(bonus, "2026-07")).toBeNull();
    expect(inactiveReason(bonus, "2026-11")).toBe("1·7월에만");
    expect(inactiveReason({ ...bonus, is_active: false }, "2026-07")).toBe("사용 안 함");
    expect(inactiveReason({ ...bonus, months_of_year: null, start_month: "2027-01" }, "2026-11")).toBe("27.01부터 적용");
    expect(inactiveReason({ ...bonus, months_of_year: null, end_month: "2026-10" }, "2026-11")).toBe("26.10에 종료");
  });

  it("그 달 이전에도 적용되던 항목만 나눌 수 있다", () => {
    expect(canSplitAt({ start_month: null, end_month: null }, "2026-11")).toBe(true);
    expect(canSplitAt({ start_month: "2026-11", end_month: null }, "2026-11")).toBe(false);
    expect(canSplitAt({ start_month: "2026-01", end_month: "2026-10" }, "2026-11")).toBe(false);
    expect(canSplitAt({ start_month: "2026-01", end_month: "2026-11" }, "2026-11")).toBe(true);
  });

  it("나누면 기존 항목은 전월에 끝나고 새 항목이 종료 월을 이어받는다", () => {
    const item = planItem({ kind: "expense", amount: 100_000, start_month: "2026-01", end_month: "2027-12" });
    expect(splitPlanItem(item, "2026-11")).toEqual({
      endPrevious: { end_month: "2026-10" },
      nextStart: "2026-11",
      nextEnd: "2027-12",
    });
    expect(splitPlanItem(item, "2027-01").endPrevious.end_month).toBe("2026-12");
  });
});
