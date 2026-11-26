import { describe, expect, it } from "vitest";

import { entry, planItem } from "@/lib/finance/testing";
import type { MonthRow } from "@/lib/finance/types";

import { canSplitAt, entriesToRelink, inactiveReason, periodLabel, splitPlanItem } from "./plan-items";

function monthRow(month: string, status: MonthRow["status"]): MonthRow {
  return { id: `m-${month}`, month, status } as MonthRow;
}

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

  it("나눌 때 변경 시작 월 이후 열린 달의 실제 값만 새 항목으로 옮긴다", () => {
    const salary = planItem({ kind: "income", amount: 4_000_000 });
    const other = planItem({ kind: "income", amount: 1_000_000 });
    const sep = entry({ kind: "income", amount: 4_000_000, plan_item_id: salary.id, month_id: "m-2026-09" });
    const oct = entry({ kind: "income", amount: 4_000_000, plan_item_id: salary.id, month_id: "m-2026-10" });
    const octOther = entry({ kind: "income", amount: 1_000_000, plan_item_id: other.id, month_id: "m-2026-10" });
    const octExtra = entry({ kind: "income", amount: 300_000, plan_item_id: null, month_id: "m-2026-10" });
    const nov = entry({ kind: "income", amount: 4_000_000, plan_item_id: salary.id, month_id: "m-2026-11" });
    const data = {
      months: [monthRow("2026-08", "closed"), monthRow("2026-09", "open"), monthRow("2026-10", "open"), monthRow("2026-11", "open")],
      monthData: {
        "m-2026-08": { assetSnapshots: [], liabilitySnapshots: [], entries: [] },
        "m-2026-09": { assetSnapshots: [], liabilitySnapshots: [], entries: [sep] },
        "m-2026-10": { assetSnapshots: [], liabilitySnapshots: [], entries: [oct, octOther, octExtra] },
        "m-2026-11": { assetSnapshots: [], liabilitySnapshots: [], entries: [nov] },
      },
    };
    expect(entriesToRelink(data, salary.id, "2026-10")).toEqual([oct, nov]);
    expect(entriesToRelink(data, salary.id, "2026-12")).toEqual([]);
    // 마감한 달은 건드리지 않는다
    expect(entriesToRelink(data, salary.id, "2026-08")).toEqual([sep, oct, nov]);
  });

  it("마감했다가 다시 연 달의 실제 값은 옮기지 않는다 (그 달의 계획 줄은 마감 당시 그대로다)", () => {
    const salary = planItem({ kind: "income", amount: 4_000_000 });
    const sep = entry({ kind: "income", amount: 4_000_000, plan_item_id: salary.id, month_id: "m-2026-09" });
    const oct = entry({ kind: "income", amount: 4_000_000, plan_item_id: salary.id, month_id: "m-2026-10" });
    // 9월은 마감 뒤 다시 열었다: 동결된 계획 줄이 옛 항목을 가리킨다
    const reopened = { ...monthRow("2026-09", "open"), summary: { planLines: [{ planItemId: salary.id }] } } as MonthRow;
    const data = {
      months: [monthRow("2026-08", "closed"), reopened, monthRow("2026-10", "open")],
      monthData: {
        "m-2026-09": { assetSnapshots: [], liabilitySnapshots: [], entries: [sep] },
        "m-2026-10": { assetSnapshots: [], liabilitySnapshots: [], entries: [oct] },
      },
    };
    expect(entriesToRelink(data, salary.id, "2026-09")).toEqual([oct]);
  });
});
