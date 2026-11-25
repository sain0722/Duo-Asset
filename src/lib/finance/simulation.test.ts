import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, eventsForScenario, simulate } from "./simulation";
import { asset, liability, member, planItem } from "./testing";
import type { Assumptions, FutureEvent, FutureEventKind, FutureEventParams, Scenario, SimulationInput } from "./types";

const FLAT: Assumptions = {
  ...DEFAULT_ASSUMPTIONS,
  horizonYears: 2,
  salaryGrowthPct: 0,
  expenseGrowthPct: 0,
  investReturnPct: 0,
  cashReturnPct: 0,
  realEstateGrowthPct: 0,
};

let eventSeq = 0;
function event(kind: FutureEventKind, month: string, params: FutureEventParams, scenarioId: string | null = null): FutureEvent {
  return {
    id: `event-${++eventSeq}`,
    household_id: "h",
    scenario_id: scenarioId,
    name: kind,
    kind,
    month,
    params,
    memo: "",
    version: 1,
    created_at: "",
    updated_at: "",
  };
}

function base(overrides: Partial<SimulationInput> = {}): SimulationInput {
  const a = member("하늘");
  const b = member("바다");
  const account = asset({ kind: "cash" });
  const stock = asset({ kind: "investment" });
  const presale = asset({ kind: "presale", liquidity: "locked" });
  return {
    startMonth: "2026-04",
    members: [a, b],
    assets: [account, stock, presale],
    liabilities: [],
    planItems: [
      planItem({ kind: "income", amount: 4_000_000, member_id: a.id }),
      planItem({ kind: "income", amount: 3_000_000, member_id: b.id }),
      planItem({ kind: "contribution", amount: 2_000_000, member_id: a.id }),
      planItem({ kind: "contribution", amount: 1_500_000, member_id: b.id }),
      // 개인 사용 가능: 하늘 200만, 바다 100만 (적금 50만 제외)
      planItem({ kind: "saving", amount: 500_000, member_id: b.id }),
      planItem({ kind: "expense", amount: 2_000_000, name: "공동생활비" }),
    ],
    assetValues: { [account.id]: 10_000_000, [stock.id]: 20_000_000, [presale.id]: 50_000_000 },
    liabilityBalances: {},
    assumptions: FLAT,
    events: [],
    ...overrides,
  };
}

describe("미래 시뮬레이션", () => {
  it("성장률이 0이면 매월 저축액만큼 현금이 쌓인다", () => {
    const result = simulate(base());
    // 수입 700 − 소비(공동 200 + 개인 300) = 저축 200
    expect(result.points[0].income).toBe(7_000_000);
    expect(result.points[0].consumption).toBe(5_000_000);
    expect(result.points[0].savings).toBe(2_000_000);
    expect(result.points[0].cash).toBe(12_000_000);
    expect(result.points).toHaveLength(24);
    expect(result.points[23].cash).toBe(10_000_000 + 24 * 2_000_000);
    expect(result.points[23].netWorth).toBe(80_000_000 + 24 * 2_000_000);
    expect(result.firstShortfallMonth).toBeNull();
  });

  it("매달 순자산 = 자산 − 부채, 자산 = 현금 + 투자 + 비금융", () => {
    const result = simulate(base({ assumptions: { ...DEFAULT_ASSUMPTIONS, horizonYears: 5 } }));
    for (const p of result.points) {
      expect(p.assets).toBe(p.cash + p.invested + p.fixed);
      expect(p.netWorth).toBe(p.assets - p.liabilities);
      expect(Number.isInteger(p.cash) && Number.isInteger(p.invested) && Number.isInteger(p.netWorth)).toBe(true);
    }
  });

  it("연봉 인상은 매년 1월에 반영되고 늘어난 수입은 저축이 된다", () => {
    const result = simulate(base({ assumptions: { ...FLAT, salaryGrowthPct: 10 } }));
    const dec = result.points.find((p) => p.month === "2026-12")!;
    const jan = result.points.find((p) => p.month === "2027-01")!;
    expect(dec.income).toBe(7_000_000);
    expect(jan.income).toBe(7_700_000);
    expect(jan.savings - dec.savings).toBe(700_000);
  });

  it("생활비 증가율은 소비에만 적용된다", () => {
    const result = simulate(base({ assumptions: { ...FLAT, expenseGrowthPct: 10 } }));
    expect(result.points.find((p) => p.month === "2027-01")!.consumption).toBe(5_500_000);
  });

  it("투자 수익률은 투자자산에만 복리로 적용된다", () => {
    const result = simulate(base({ assumptions: { ...FLAT, horizonYears: 1, investReturnPct: 12 } }));
    const last = result.points.at(-1)!;
    // 1년 뒤 약 +12% (월 복리, 반올림 오차 허용)
    expect(Math.abs(last.invested - 22_400_000)).toBeLessThan(100);
  });

  it("월 저축 조정액만큼 소비가 줄고 저축이 는다", () => {
    const result = simulate(base({ assumptions: { ...FLAT, monthlySavingsAdjust: 300_000 } }));
    expect(result.points[0].savings).toBe(2_300_000);
  });

  it("투자 저축 항목은 현금에서 투자자산으로 옮겨진다", () => {
    const input = base();
    const stock = input.assets.find((a) => a.kind === "investment")!;
    input.planItems.push(planItem({ kind: "saving", amount: 400_000, member_id: input.members[0].id, asset_id: stock.id }));
    const result = simulate(input);
    // 하늘의 사용 가능 금액이 40만 줄어 소비가 줄고, 그 40만이 투자자산으로 간다
    expect(result.points[0].consumption).toBe(4_600_000);
    expect(result.points[0].invested).toBe(20_400_000);
    expect(result.points[0].cash).toBe(10_000_000 + 2_400_000 - 400_000);
  });

  it("할부가 끝나면 마일스톤이 남고 이후 저축이 늘어난다", () => {
    const input = base();
    const car = liability({
      kind: "installment",
      name: "자동차 할부",
      original_principal: 6_000_000,
      monthly_payment: 500_000,
      payer_member_id: input.members[0].id,
    });
    input.liabilities = [car];
    input.liabilityBalances = { [car.id]: 1_500_000 };
    const result = simulate(input);
    const paidOff = result.milestones.find((m) => m.kind === "debt_paid_off")!;
    expect(paidOff.month).toBe("2026-06");
    expect(paidOff.amount).toBe(500_000);
    expect(result.points.find((p) => p.month === "2026-06")!.liabilities).toBe(0);
    // 할부금은 원금 상환이라 저축액(현금 증가)을 줄인다. 끝나면 그만큼 저축이 늘어난다.
    const during = result.points.find((p) => p.month === "2026-05")!;
    const after = result.points.find((p) => p.month === "2026-07")!;
    expect(after.savings - during.savings).toBe(500_000);
    // 상환 중에도 순자산은 저축 200만 + 원금 상환 50만만큼 늘어난다
    expect(during.savings).toBe(2_000_000);
    expect(during.netWorth - result.points.find((p) => p.month === "2026-04")!.netWorth).toBe(2_500_000);
  });

  it("소득 변화 이벤트는 지정한 기간에만 적용된다", () => {
    const input = base();
    input.events = [
      event("income_change", "2026-07", { memberId: input.members[0].id, monthlyDelta: 1_000_000, endMonth: "2026-09" }),
    ];
    const result = simulate(input);
    const incomeAt = (m: string) => result.points.find((p) => p.month === m)!.income;
    expect(incomeAt("2026-06")).toBe(7_000_000);
    expect(incomeAt("2026-07")).toBe(8_000_000);
    expect(incomeAt("2026-09")).toBe(8_000_000);
    expect(incomeAt("2026-10")).toBe(7_000_000);
    expect(result.milestones.some((m) => m.kind === "event" && m.month === "2026-07")).toBe(true);
  });

  it("일회성 지출은 소비, 자산 취득은 자산 간 이동이다", () => {
    const spend = simulate(base({ events: [event("one_time", "2026-05", { amount: -3_000_000, asAsset: false })] }));
    const buy = simulate(base({ events: [event("one_time", "2026-05", { amount: -3_000_000, asAsset: true })] }));
    const plain = simulate(base());
    const at = (r: typeof plain) => r.points.find((p) => p.month === "2026-05")!;
    expect(at(spend).netWorth).toBe(at(plain).netWorth - 3_000_000);
    expect(at(buy).netWorth).toBe(at(plain).netWorth);
    expect(at(buy).cash).toBe(at(plain).cash - 3_000_000);
    expect(at(buy).fixed).toBe(at(plain).fixed + 3_000_000);
  });

  it("대출 발생: 현금과 부채가 같이 늘고 다음 달부터 상환한다", () => {
    const result = simulate(
      base({
        events: [
          event("loan", "2026-05", { principal: 12_000_000, annualRate: 0, termMonths: 12, method: "equal_principal", toAsset: false }),
        ],
      }),
    );
    const may = result.points.find((p) => p.month === "2026-05")!;
    const june = result.points.find((p) => p.month === "2026-06")!;
    expect(may.liabilities).toBe(12_000_000);
    expect(may.netWorth).toBe(80_000_000 + 2 * 2_000_000);
    expect(june.liabilities).toBe(11_000_000);
    expect(june.debtPayment).toBe(1_000_000);
    expect(result.milestones.find((m) => m.kind === "debt_paid_off")!.month).toBe("2027-05");
  });

  it("주택 입주: 잔금·대출·보증금 반환이 순자산을 바꾸지 않는다", () => {
    const input = base();
    input.events = [
      event("home_move_in", "2026-06", {
        balanceDue: 250_000_000,
        loanAmount: 230_000_000,
        loanRate: 0,
        loanTermMonths: 360,
        loanMethod: "equal_principal",
        depositReturn: 0,
        monthlyExpenseDelta: 200_000,
      }),
    ];
    const result = simulate(input);
    const plain = simulate(base());
    const at = (r: typeof plain, m: string) => r.points.find((p) => p.month === m)!;
    const june = at(result, "2026-06");
    // 입주한 달부터 주거비 20만 원이 늘어난 것 외에는 순자산 동일
    expect(june.netWorth).toBe(at(plain, "2026-06").netWorth - 200_000);
    expect(june.liabilities).toBe(230_000_000);
    expect(june.fixed).toBe(50_000_000 + 250_000_000);
    expect(june.cash).toBe(at(plain, "2026-06").cash - 20_000_000 - 200_000);
  });

  it("육아휴직: 기간 동안 소득이 대체되고 육아비가 늘어난다", () => {
    const input = base();
    input.events = [
      event("parental_leave", "2026-08", {
        memberId: input.members[1].id,
        leaveMonths: 3,
        monthlyIncomeDuringLeave: 1_500_000,
        monthlyChildCost: 600_000,
        oneTimeCost: 2_000_000,
      }),
    ];
    const result = simulate(input);
    const at = (m: string) => result.points.find((p) => p.month === m)!;
    expect(at("2026-07").income).toBe(7_000_000);
    expect(at("2026-08").income).toBe(5_500_000);
    expect(at("2026-10").income).toBe(5_500_000);
    expect(at("2026-11").income).toBe(7_000_000);
    expect(at("2026-08").consumption).toBe(5_000_000 + 600_000 + 2_000_000);
    expect(at("2026-11").consumption).toBe(5_600_000);
  });

  it("현금이 모자라면 자금 부족을 알린다", () => {
    const result = simulate(base({ events: [event("one_time", "2026-06", { amount: -40_000_000, asAsset: false })] }));
    expect(result.firstShortfallMonth).toBe("2026-06");
    expect(result.milestones.some((m) => m.kind === "cash_shortfall")).toBe(true);
  });

  it("과거 날짜의 이벤트는 무시한다", () => {
    const result = simulate(base({ events: [event("one_time", "2026-01", { amount: -40_000_000, asAsset: false })] }));
    expect(result.points[0].cash).toBe(12_000_000);
  });

  it("시뮬레이션은 입력을 바꾸지 않는다", () => {
    const input = base();
    const snapshot = JSON.stringify(input);
    simulate(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("시나리오별 이벤트", () => {
  it("끄지 않은 공통 이벤트와 전용 이벤트만 적용한다", () => {
    const common = event("one_time", "2027-01", { amount: -1, asAsset: false });
    const excluded = event("one_time", "2027-02", { amount: -1, asAsset: false });
    const own = event("one_time", "2027-03", { amount: -1, asAsset: false }, "s1");
    const other = event("one_time", "2027-04", { amount: -1, asAsset: false }, "s2");
    const scenario: Scenario = {
      id: "s1",
      household_id: "h",
      name: "이직",
      is_base: false,
      assumptions: {},
      excluded_event_ids: [excluded.id],
      sort_order: 0,
      version: 1,
      created_at: "",
      updated_at: "",
    };
    expect(eventsForScenario(scenario, [common, excluded, own, other]).map((e) => e.id)).toEqual([common.id, own.id]);
  });
});
