import { describe, expect, it } from "vitest";

import type { HistoryPoint } from "@/lib/data/derive";
import { scheduledPayment } from "@/lib/finance";
import type { Liability, LiabilityLine, MonthPlan, MonthReport, PlanItem } from "@/lib/finance/types";

import {
  debtPlanTotals,
  expenseReleases,
  liabilityHistory,
  payoffInfo,
  releaseTimeline,
  repaidPercent,
  scheduleStart,
  scheduledRepayment,
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

describe("scheduledRepayment", () => {
  it("할부: 월 납부액 (월초 잔액 = 월말 잔액 + 납부액)", () => {
    const l = liability({ kind: "installment", original_principal: 2_400_000, monthly_payment: 200_000, start_month: "2026-05" });
    expect(scheduledRepayment(l, "2026-10", 1_200_000)).toBe(200_000);
  });

  it("시작 전이면 0", () => {
    const l = liability({ kind: "installment", original_principal: 2_400_000, monthly_payment: 200_000, start_month: "2026-12" });
    expect(scheduledRepayment(l, "2026-10", 2_400_000)).toBe(0);
  });

  it("원리금균등: 계획이 월초 잔액으로 잡는 원금과 같다", () => {
    const l = liability({ kind: "amortized", original_principal: 30_000_000, annual_rate: 4.5, term_months: 60, start_month: "2026-01" });
    const balance = 25_000_000;
    const repaid = scheduledRepayment(l, "2026-10", balance);
    expect(repaid).toBeGreaterThan(0);
    expect(scheduledPayment(l, "2026-10", balance + repaid!).principal).toBe(repaid);
  });

  it("일정상 마지막 회차인데 원금이 남아 있으면 정하지 않는다", () => {
    const l = liability({ kind: "installment", original_principal: 2_400_000, monthly_payment: 200_000, term_months: 12, start_month: "2025-11" });
    expect(scheduledRepayment(l, "2026-10", 1_200_000)).toBeNull();
  });

  it("이자만 내는 부채는 0", () => {
    const l = liability({ kind: "interest_only", monthly_payment: 100_000 });
    expect(scheduledRepayment(l, "2026-10", 5_000_000)).toBe(0);
  });

  it("원리금균등: 만기가 가까워도(남은 회차 2~3회) 정확히 맞는 값을 찾는다", () => {
    // 무이자 12개월, 2025-12 시작 → 2026-10 은 11번째 회차. 월말 잔액 100만 원이면 월초 200만 원에서 100만 원을 갚았다
    const zero = liability({ kind: "amortized", original_principal: 12_000_000, annual_rate: 0, term_months: 12, start_month: "2025-12" });
    expect(scheduledRepayment(zero, "2026-10", 1_000_000)).toBe(1_000_000);

    for (const [rate, start] of [
      [0, "2026-01"], // 2026-10 이 10번째, 남은 회차 3
      [5, "2026-01"],
      [5, "2025-12"], // 남은 회차 2
    ] as const) {
      const l = liability({ kind: "amortized", original_principal: 12_000_000, annual_rate: rate, term_months: 12, start_month: start });
      const balance = 2_000_000;
      const repaid = scheduledRepayment(l, "2026-10", balance);
      expect(repaid).not.toBeNull();
      // 그 월초 잔액으로 계획이 잡는 원금과 1원 안에서 같다
      expect(Math.abs(scheduledPayment(l, "2026-10", balance + repaid!).principal - repaid!)).toBeLessThanOrEqual(1);
    }
  });

  it("원금균등·만기일시", () => {
    const equal = liability({ kind: "equal_principal", original_principal: 12_000_000, annual_rate: 3, term_months: 24, start_month: "2026-01" });
    expect(scheduledRepayment(equal, "2026-10", 7_000_000)).toBe(500_000);
    const bullet = liability({ kind: "bullet", original_principal: 10_000_000, annual_rate: 3, term_months: 24, start_month: "2026-01" });
    expect(scheduledRepayment(bullet, "2026-10", 10_000_000)).toBe(0);
  });
});
