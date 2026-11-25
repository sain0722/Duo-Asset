import { describe, expect, it } from "vitest";

import type { HistoryPoint } from "@/lib/data/derive";
import type { Liability, LiabilityLine, MonthPlan, MonthReport, PlanItem } from "@/lib/finance/types";

import {
  debtPlanTotals,
  expenseReleases,
  liabilityHistory,
  payoffInfo,
  releaseTimeline,
  repaidPercent,
  scheduleStart,
} from "./derive";

function liability(overrides: Partial<Liability>): Liability {
  return {
    id: "l",
    household_id: "h",
    name: "부채",
    kind: "installment",
    payer_member_id: null,
    original_principal: 30_000_000,
    annual_rate: 0,
    term_months: null,
    start_month: null,
    monthly_payment: null,
    payment_day: null,
    withdraw_asset_id: null,
    memo: "",
    is_active: true,
    sort_order: 0,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function planItem(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: "p",
    household_id: "h",
    kind: "expense",
    member_id: null,
    name: "항목",
    amount: 100_000,
    income_type: null,
    pay_day: null,
    start_month: null,
    end_month: null,
    months_of_year: null,
    asset_id: null,
    memo: "",
    is_active: true,
    sort_order: 0,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("debtPlanTotals", () => {
  it("부채 줄의 원금·이자만 더한다", () => {
    const plan = {
      lines: [
        { key: "a", kind: "debt", pocket: "joint", name: "할부", amount: 500_000, principal: 500_000, interest: 0 },
        { key: "b", kind: "debt", pocket: "m1", name: "대출", amount: 900_000, principal: 600_000, interest: 300_000 },
        { key: "c", kind: "expense", pocket: "joint", name: "관리비", amount: 200_000 },
      ],
    } as MonthPlan;
    expect(debtPlanTotals(plan)).toEqual({ principal: 1_100_000, interest: 300_000, payment: 1_400_000 });
  });
});

describe("repaidPercent", () => {
  it("최초 원금 대비 갚은 비율", () => {
    expect(repaidPercent(30_000_000, 20_000_000)).toBe(33.3);
    expect(repaidPercent(30_000_000, 31_000_000)).toBe(0);
  });
});

describe("scheduleStart", () => {
  it("확인한 달은 다음 달부터, 아니면 이번 달 월초 잔액에서", () => {
    expect(scheduleStart({ confirmed: true, balance: 900, openBalance: 1000 }, "2026-11")).toEqual({ from: "2026-12", balance: 900 });
    expect(scheduleStart({ confirmed: false, balance: 1000, openBalance: 1000 }, "2026-11")).toEqual({ from: "2026-11", balance: 1000 });
  });
});

describe("payoffInfo", () => {
  it("무이자 할부: 끝나는 달과 평소 월 납부액", () => {
    const loan = liability({ kind: "installment", monthly_payment: 500_000, term_months: 60, start_month: "2024-10" });
    const info = payoffInfo(loan, "2026-11", 1_200_000);
    expect(info.schedule.map((r) => r.principal)).toEqual([500_000, 500_000, 200_000]);
    expect(info.endMonth).toBe("2027-01");
    expect(info.freed).toBe(500_000);
  });

  it("만기일시상환: 풀리는 금액은 매월 내던 이자", () => {
    const loan = liability({ kind: "bullet", annual_rate: 6, term_months: 3, start_month: "2026-11", original_principal: 10_000_000 });
    const info = payoffInfo(loan, "2026-11", 10_000_000);
    expect(info.endMonth).toBe("2027-01");
    expect(info.freed).toBe(50_000);
  });

  it("원금 유지 차용금은 끝나지 않는다", () => {
    const loan = liability({ kind: "interest_only", monthly_payment: 300_000 });
    const info = payoffInfo(loan, "2026-11", 40_000_000);
    expect(info.endMonth).toBeNull();
    expect(info.freed).toBe(0);
    expect(info.schedule[0].payment).toBe(300_000);
  });

  it("아직 시작 전인 대출은 첫 납부 월부터 센다", () => {
    const loan = liability({ kind: "installment", monthly_payment: 100_000, term_months: 2, start_month: "2027-01", original_principal: 200_000 });
    const info = payoffInfo(loan, "2026-11", 200_000);
    expect(info.endMonth).toBe("2027-02");
    expect(info.freed).toBe(100_000);
  });
});

describe("여유 자금 변화", () => {
  it("끝나는 날이 정해진 매월 고정지출만 고른다", () => {
    const items = [
      planItem({ id: "a", name: "학원비", end_month: "2027-02", amount: 300_000 }),
      planItem({ id: "b", name: "끝난 항목", end_month: "2026-10" }),
      planItem({ id: "c", name: "계속", end_month: null }),
      planItem({ id: "d", name: "보관", end_month: "2027-05", is_active: false }),
      planItem({ id: "e", name: "연 2회", end_month: "2027-05", months_of_year: [1, 7] }),
      planItem({ id: "f", name: "수입", kind: "income", income_type: "salary", end_month: "2027-05" }),
      planItem({ id: "g", name: "이번 달까지", end_month: "2026-11", member_id: "m1", amount: 50_000 }),
    ];
    expect(expenseReleases(items, "2026-11")).toEqual([
      { key: "plan:a", source: "expense", name: "학원비", pocket: "joint", endMonth: "2027-02", freedFrom: "2027-03", amount: 300_000 },
      { key: "plan:g", source: "expense", name: "이번 달까지", pocket: "m1", endMonth: "2026-11", freedFrom: "2026-12", amount: 50_000 },
    ]);
  });

  it("끝나는 순서로 정렬하고 누적한다", () => {
    const timeline = releaseTimeline([
      { key: "x", source: "expense", name: "x", pocket: "joint", endMonth: "2027-05", freedFrom: "2027-06", amount: 100 },
      { key: "y", source: "debt", name: "y", pocket: "joint", endMonth: "2027-01", freedFrom: "2027-02", amount: 500 },
    ]);
    expect(timeline.map((t) => [t.key, t.cumulative])).toEqual([
      ["y", 500],
      ["x", 600],
    ]);
  });
});

describe("liabilityHistory", () => {
  function point(month: string, lines: Partial<LiabilityLine>[], isBaseline = false, provisional = false): HistoryPoint {
    return {
      month,
      provisional,
      report: {
        isBaseline,
        liabilityLines: lines.map((l) => ({
          liabilityId: "l",
          name: "부채",
          kind: "installment",
          pocket: "joint",
          openBalance: 0,
          balance: 0,
          principalPaid: 0,
          plannedPrincipal: 0,
          plannedInterest: 0,
          interestPaid: null,
          adjustment: 0,
          confirmed: true,
          ...l,
        })),
      } as MonthReport,
    };
  }

  it("기준 월은 빼고, 확인하지 않은 달의 실제 상환은 미확인(null)", () => {
    const rows = liabilityHistory(
      [
        point("2026-09", [{ balance: 1000 }], true),
        point("2026-10", [{ balance: 900, principalPaid: 100, plannedPrincipal: 100, interestPaid: 0 }]),
        point("2026-11", [{ balance: 900, principalPaid: 0, plannedPrincipal: 100, confirmed: false }], false, true),
      ],
      "l",
    );
    expect(rows.map((r) => [r.month, r.principalPaid, r.plannedPrincipal, r.interestPaid])).toEqual([
      ["2026-10", 100, 100, 0],
      ["2026-11", null, 100, null],
    ]);
  });
});
