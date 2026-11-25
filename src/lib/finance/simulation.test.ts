import { describe, expect, it } from "vitest";
import { buildMonthPlan } from "./plan";
import { DEFAULT_ASSUMPTIONS, eventsForScenario, resolveAssumptions, simulate } from "./simulation";
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

  it("주택 매도(갈아타기): 부동산이 현금이 되고, 지정한 대출을 갚아 끝낸다", () => {
    const input = base({ assumptions: { ...FLAT, realEstateGrowthPct: 3 } });
    const home = asset({ kind: "real_estate", name: "지금 집", liquidity: "locked" });
    const mortgage = liability({
      kind: "amortized",
      name: "주택담보대출",
      original_principal: 300_000_000,
      annual_rate: 4,
      term_months: 360,
      start_month: "2025-01",
    });
    input.assets = [...input.assets, home];
    input.assetValues = { ...input.assetValues, [home.id]: 500_000_000 };
    input.liabilities = [mortgage];
    input.liabilityBalances = { [mortgage.id]: 290_000_000 };
    const sellEvent = event("home_sale", "2026-08", { salePrice: 520_000_000, repayLiabilityIds: [mortgage.id] });
    input.events = [sellEvent];
    const result = simulate(input);
    const at = (m: string) => result.points.find((p) => p.month === m)!;
    const before = at("2026-07");
    const sold = at("2026-08");
    const after = at("2026-10");
    // 매도한 달: 부채가 사라지고, 부동산은 분양 납부금(5,000만)만 남는다
    expect(sold.liabilities).toBe(0);
    expect(sold.fixed).toBe(50_000_000);
    expect(before.liabilities).toBeGreaterThan(280_000_000);
    // 팔린 집은 더 이상 오르지 않고, 대출 상환도 없다
    expect(after.fixed).toBe(50_000_000);
    expect(after.debtPayment).toBe(0);
    expect(result.milestones.some((m) => m.kind === "debt_paid_off" && m.month === "2026-08")).toBe(true);
    // 현금 = 매도 대금 − 남은 대출을 갚은 금액 만큼 늘었다 (평소 저축 외에)
    expect(sold.cash - before.cash).toBeGreaterThan(520_000_000 - 290_000_000);
  });

  it("대출 상환 완료 이벤트: 이벤트로 받은 대출도 한 번에 갚아 끝낼 수 있다", () => {
    const input = base();
    const loan = event("loan", "2026-05", { principal: 24_000_000, annualRate: 0, termMonths: 24, method: "installment", toAsset: false });
    input.events = [loan, event("loan_payoff", "2026-09", { liabilityId: loan.id })];
    const result = simulate(input);
    const plain = simulate(base());
    const at = (r: typeof result, m: string) => r.points.find((p) => p.month === m)!;
    expect(at(result, "2026-08").liabilities).toBe(21_000_000);
    expect(at(result, "2026-09").liabilities).toBe(0);
    expect(at(result, "2026-10").debtPayment).toBe(0);
    // 빌렸다 갚았을 뿐이므로 순자산은 대출이 없을 때와 같다 (무이자)
    expect(at(result, "2026-12").netWorth).toBe(at(plain, "2026-12").netWorth);
  });

  it("현금이 모자라면 자금 부족을 알린다", () => {
    const result = simulate(base({ events: [event("one_time", "2026-06", { amount: -40_000_000, asAsset: false })] }));
    expect(result.firstShortfallMonth).toBe("2026-06");
    expect(result.milestones.some((m) => m.kind === "cash_shortfall")).toBe(true);
  });

  it("이미 지난 일회성 이벤트는 무시한다 (현재 잔액에 반영돼 있다)", () => {
    const result = simulate(
      base({
        events: [
          event("one_time", "2026-01", { amount: -40_000_000, asAsset: false }),
          event("loan", "2026-02", { principal: 12_000_000, annualRate: 0, termMonths: 12, method: "equal_principal", toAsset: false }),
        ],
      }),
    );
    expect(result.points[0].cash).toBe(12_000_000);
    expect(result.points[0].liabilities).toBe(0);
    expect(result.milestones.filter((m) => m.kind === "event")).toEqual([]);
  });

  it("이미 시작된 육아휴직·기간 한정 변화는 끝날 때까지 계속 적용된다", () => {
    const input = base();
    input.events = [
      // 2월에 시작한 6개월 휴직: 4월(시작 월)에도 아직 휴직 중이다
      event("parental_leave", "2026-02", {
        memberId: input.members[1].id,
        leaveMonths: 6,
        monthlyIncomeDuringLeave: 1_500_000,
        monthlyChildCost: 600_000,
        oneTimeCost: 2_000_000,
      }),
      // 1월부터 5월까지의 임시 지출
      event("expense_change", "2026-01", { monthlyDelta: 300_000, endMonth: "2026-05" }),
    ];
    const result = simulate(input);
    const at = (m: string) => result.points.find((p) => p.month === m)!;
    // 휴직 중: 바다 소득 150만
    expect(at("2026-04").income).toBe(5_500_000);
    expect(at("2026-07").income).toBe(5_500_000);
    expect(at("2026-08").income).toBe(7_000_000);
    // 육아비는 계속, 임시 지출은 5월까지, 출산 일회성 비용(2월)은 이미 지났다
    expect(at("2026-04").consumption).toBe(5_000_000 + 600_000 + 300_000);
    expect(at("2026-06").consumption).toBe(5_000_000 + 600_000);
  });

  it("보관한 부채도 원금이 남아 있으면 계속 갚는다", () => {
    const input = base();
    const old = liability({
      kind: "installment",
      original_principal: 3_000_000,
      monthly_payment: 500_000,
      payer_member_id: input.members[0].id,
      is_active: false,
    });
    input.liabilities = [old];
    input.liabilityBalances = { [old.id]: 1_000_000 };
    const result = simulate(input);
    expect(result.points[0].liabilities).toBe(500_000);
    expect(result.points[1].liabilities).toBe(0);
  });

  it("만기일시상환이 끝나면 풀리는 돈은 원금이 아니라 매월 내던 이자다", () => {
    const input = base({ assumptions: { ...FLAT, horizonYears: 2 } });
    const bullet = liability({
      kind: "bullet",
      name: "전세대출",
      original_principal: 60_000_000,
      annual_rate: 4,
      term_months: 12,
      start_month: "2026-01",
    });
    input.liabilities = [bullet];
    input.liabilityBalances = { [bullet.id]: 60_000_000 };
    input.assetValues = { ...input.assetValues, [input.assets[0].id]: 80_000_000 };
    const paidOff = simulate(input).milestones.find((m) => m.kind === "debt_paid_off")!;
    expect(paidOff.month).toBe("2026-12");
    expect(paidOff.amount).toBe(200_000);
  });

  it("이벤트로 받은 대출의 첫 납부는 실행한 다음 달이다", () => {
    const result = simulate(
      base({
        events: [
          event("loan", "2026-05", { principal: 12_000_000, annualRate: 0, termMonths: 12, method: "installment", toAsset: true }),
        ],
      }),
    );
    const at = (m: string) => result.points.find((p) => p.month === m)!;
    expect(at("2026-05").debtPayment).toBe(0);
    expect(at("2026-06").debtPayment).toBe(1_000_000);
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

// ───────────────────────── 추가 고정: 10절의 순서·경계 ─────────────────────────

describe("미래 시뮬레이션: 계획과의 관계 (10절 3항)", () => {
  it("첫 달의 수입·소비·저축·원금상환은 같은 달 계획 합계와 같다 (상여금 없는 달, 부채 포함)", () => {
    const input = base();
    const [haneul] = input.members;
    const car = liability({
      kind: "installment",
      name: "자동차 할부",
      original_principal: 24_000_000,
      monthly_payment: 500_000,
      payer_member_id: haneul.id,
    });
    const mortgage = liability({
      kind: "equal_principal",
      name: "주택담보대출",
      original_principal: 240_000_000,
      annual_rate: 4.8,
      term_months: 240,
      start_month: "2026-01",
    });
    input.liabilities = [car, mortgage];
    input.liabilityBalances = { [car.id]: 6_000_000, [mortgage.id]: 237_000_000 };

    const first = simulate(input).points[0];
    // 이자 = 2억 3,700만 × 4.8% ÷ 12 = 948,000
    // 소비 = 공동생활비 200 + 사용 가능 금액(하늘 400 − 할부 50 − 납입 200 = 150, 바다 100) + 이자 94.8
    expect(first.income).toBe(7_000_000);
    expect(first.consumption).toBe(5_448_000);
    // 원금 = 할부 50 + 주담대 100, 저축 = 700 − 544.8 − 150
    expect(first.debtPayment).toBe(1_500_000 + 948_000);
    expect(first.savings).toBe(52_000);
    expect(first.cash).toBe(10_052_000);
    expect(first.liabilities).toBe(5_500_000 + 236_000_000);

    const plan = buildMonthPlan({
      month: input.startMonth,
      members: input.members,
      planItems: input.planItems,
      liabilities: input.liabilities,
      liabilityBalances: input.liabilityBalances,
    }).totals;
    expect(plan).toMatchObject({ income: 7_000_000, consumption: 5_448_000, principalRepayment: 1_500_000, savings: 52_000 });
    expect(first.income).toBe(plan.income);
    expect(first.consumption).toBe(plan.consumption);
    expect(first.savings).toBe(plan.savings);
  });

  it("상여금 달: 계획은 상여금을 사용 가능 금액(소비)으로 보지만 시뮬레이션은 저축으로 쌓는다", () => {
    const input = base();
    input.planItems.push(
      planItem({ kind: "income", amount: 2_000_000, member_id: input.members[0].id, income_type: "bonus", months_of_year: [7] }),
    );
    const result = simulate(input);
    const at = (m: string) => result.points.find((p) => p.month === m)!;
    expect(at("2026-06")).toMatchObject({ income: 7_000_000, consumption: 5_000_000, savings: 2_000_000 });
    // 7월: 수입만 200만 늘고 소비는 평소 달 그대로 → 저축 400만
    expect(at("2026-07")).toMatchObject({ income: 9_000_000, consumption: 5_000_000, savings: 4_000_000 });
    expect(at("2026-08")).toMatchObject({ income: 7_000_000, consumption: 5_000_000, savings: 2_000_000 });

    // 같은 달의 계획: 상여금 200만이 하늘의 사용 가능 금액에 더해져 소비 700만, 저축 200만
    const july = buildMonthPlan({ month: "2026-07", members: input.members, planItems: input.planItems, liabilities: [], liabilityBalances: {} });
    expect(july.totals).toMatchObject({ income: 9_000_000, consumption: 7_000_000, savings: 2_000_000 });
  });

  it("시작 월이 상여금 달이어도 사용 가능 금액은 매월 반복되는 항목만으로 계산한다", () => {
    const input = base({ startMonth: "2026-07" });
    input.planItems.push(
      planItem({ kind: "income", amount: 2_000_000, member_id: input.members[0].id, income_type: "bonus", months_of_year: [7] }),
    );
    const result = simulate(input);
    expect(result.points[0]).toMatchObject({ month: "2026-07", income: 9_000_000, consumption: 5_000_000, savings: 4_000_000 });
    expect(result.points[1]).toMatchObject({ month: "2026-08", income: 7_000_000, consumption: 5_000_000, savings: 2_000_000 });
  });

  it("수입보다 많이 배분한 구성원의 음수 사용 가능 금액은 소비를 줄이지 않는다", () => {
    const input = base();
    // 바다: 300 − 150 − 50 − 150 = −50 → 소비에는 0으로 들어간다
    input.planItems.push(planItem({ kind: "saving", amount: 1_500_000, member_id: input.members[1].id }));
    const first = simulate(input).points[0];
    // 공동생활비 200 + 하늘 200 + 바다 0
    expect(first.consumption).toBe(4_000_000);
    expect(first.savings).toBe(3_000_000);
  });
});

describe("미래 시뮬레이션: 수익 (10절 1항)", () => {
  it("현금성 자산이 음수면 이자를 붙이지 않는다", () => {
    const input = base({ assumptions: { ...FLAT, cashReturnPct: 12 } });
    input.assetValues = { ...input.assetValues, [input.assets[0].id]: -10_000_000 };
    const result = simulate(input);
    // −1,000만 + 저축 200만 (이자를 붙였다면 −8,094,888)
    expect(result.points[0].cash).toBe(-8_000_000);
    expect(result.points[1].cash).toBe(-6_000_000);
    expect(result.firstShortfallMonth).toBe("2026-04");
    expect(result.milestones.find((m) => m.kind === "cash_shortfall")).toMatchObject({ month: "2026-04", amount: 8_000_000 });
    // 자금 부족 마일스톤은 처음 한 번만 남긴다
    expect(result.milestones.filter((m) => m.kind === "cash_shortfall")).toHaveLength(1);
  });

  it("수익은 월 복리 이율로 월초 잔액에 붙이고 원 단위로 반올림한다", () => {
    const input = base({ assumptions: { ...FLAT, cashReturnPct: 12, investReturnPct: 7, realEstateGrowthPct: 3 } });
    const home = asset({ kind: "real_estate", liquidity: "locked" });
    input.assets.push(home);
    input.assetValues = { ...input.assetValues, [home.id]: 400_000_000 };
    const first = simulate(input).points[0];
    // 1,000만 × 1.12^(1/12) = 10,094,887.93 → 10,094,888, 여기에 그 달 저축 200만
    expect(first.cash).toBe(10_094_888 + 2_000_000);
    // 2,000만 × 1.07^(1/12) = 20,113,082.91 → 20,113,083
    expect(first.invested).toBe(20_113_083);
    // 4억 × 1.03^(1/12) = 400,986,507.91 → 400,986,508. 분양 납부금 5,000만에는 붙지 않는다.
    expect(first.fixed).toBe(400_986_508 + 50_000_000);
    // 수익은 수입·저축이 아니다
    expect(first.income).toBe(7_000_000);
    expect(first.savings).toBe(2_000_000);
  });
});

describe("미래 시뮬레이션: 수입과 소비의 경계 (10절 2·3항)", () => {
  it("연봉 인상은 시작 연도 다음 해 1월부터 적용된다 (시작 월이 12월이면 바로 다음 달)", () => {
    const result = simulate(base({ startMonth: "2026-12", assumptions: { ...FLAT, salaryGrowthPct: 10 } }));
    expect(result.points[0]).toMatchObject({ month: "2026-12", income: 7_000_000 });
    expect(result.points[1]).toMatchObject({ month: "2027-01", income: 7_700_000 });
  });

  it("시작 월이 1월이면 그 해에는 인상이 없고 다음 해 1월에 처음 오른다", () => {
    const result = simulate(base({ startMonth: "2027-01", assumptions: { ...FLAT, salaryGrowthPct: 10 } }));
    const at = (m: string) => result.points.find((p) => p.month === m)!;
    expect(at("2027-01").income).toBe(7_000_000);
    expect(at("2027-12").income).toBe(7_000_000);
    expect(at("2028-01").income).toBe(7_700_000);
  });

  it("인상은 해마다 복리로 쌓이고, 급여·상여금만 오른다 (기타 수입은 그대로)", () => {
    const input = base({ assumptions: { ...FLAT, salaryGrowthPct: 10 } });
    input.planItems.push(planItem({ kind: "income", amount: 500_000, income_type: "other", name: "공동 임대수입" }));
    input.planItems.push(
      planItem({ kind: "income", amount: 1_000_000, member_id: input.members[1].id, income_type: "bonus", months_of_year: [1] }),
    );
    const result = simulate(input);
    const at = (m: string) => result.points.find((p) => p.month === m)!;
    expect(at("2026-12").income).toBe(7_500_000);
    // 2027-01: 급여 440 + 330, 상여금 110, 기타 50
    expect(at("2027-01").income).toBe(4_400_000 + 3_300_000 + 1_100_000 + 500_000);
    // 2028-01: 1.1² = 1.21 → 급여 484 + 363, 상여금 121, 기타 50
    expect(at("2028-01").income).toBe(4_840_000 + 3_630_000 + 1_210_000 + 500_000);
  });

  it("주머니별 수입은 소득 감소 이벤트가 커도 0 미만으로 내려가지 않는다", () => {
    const input = base();
    input.events = [event("income_change", "2026-05", { memberId: input.members[0].id, monthlyDelta: -5_000_000, endMonth: null })];
    const result = simulate(input);
    // 하늘 400 − 500 → 0, 바다 300 은 그대로 (합계가 200이 되지 않는다)
    expect(result.points.find((p) => p.month === "2026-05")!.income).toBe(3_000_000);
  });

  it("소비는 월 저축 조정액이나 지출 감소가 커도 0 미만으로 내려가지 않는다", () => {
    const adjusted = simulate(base({ assumptions: { ...FLAT, monthlySavingsAdjust: 6_000_000 } }));
    expect(adjusted.points[0]).toMatchObject({ consumption: 0, savings: 7_000_000 });

    const reduced = simulate(base({ events: [event("expense_change", "2026-04", { monthlyDelta: -9_000_000, endMonth: null })] }));
    expect(reduced.points[0]).toMatchObject({ consumption: 0, savings: 7_000_000 });
  });

  it("부채 이자는 소비 하한(0)을 적용한 뒤에 더한다", () => {
    const input = base({ assumptions: { ...FLAT, monthlySavingsAdjust: 6_000_000 } });
    const bullet = liability({ kind: "bullet", original_principal: 60_000_000, annual_rate: 4, term_months: 36, start_month: "2026-01" });
    input.liabilities = [bullet];
    input.liabilityBalances = { [bullet.id]: 60_000_000 };
    const first = simulate(input).points[0];
    // 이자 6,000만 × 4% ÷ 12 = 20만
    expect(first.consumption).toBe(200_000);
    expect(first.savings).toBe(6_800_000);
  });

  it("월 저축 조정액이 음수면 그만큼 더 쓰고 덜 저축한다", () => {
    const result = simulate(base({ assumptions: { ...FLAT, monthlySavingsAdjust: -300_000 } }));
    expect(result.points[0]).toMatchObject({ consumption: 5_300_000, savings: 1_700_000 });
  });
});

describe("미래 시뮬레이션: 월 투자액 (10절 6항)", () => {
  it("월 투자액을 지정하면 계획의 투자 저축 항목 대신 그 금액을 현금에서 투자자산으로 옮긴다", () => {
    const input = base({ assumptions: { ...FLAT, monthlyInvestment: 700_000 } });
    const stock = input.assets.find((a) => a.kind === "investment")!;
    // 계획에는 투자 저축 40만 원이 있지만 지정한 70만 원이 우선한다
    input.planItems.push(planItem({ kind: "saving", amount: 400_000, member_id: input.members[0].id, asset_id: stock.id }));
    const result = simulate(input);
    // 저축 = 700 − (공동 200 + 하늘 160 + 바다 100) = 240
    expect(result.points[0].savings).toBe(2_400_000);
    expect(result.points[0].cash).toBe(10_000_000 + 2_400_000 - 700_000);
    expect(result.points[0].invested).toBe(20_700_000);
    expect(result.points[11].invested).toBe(20_000_000 + 12 * 700_000);
    // 자산 간 이동일 뿐 순자산은 저축만큼만 늘어난다
    expect(result.points[0].netWorth).toBe(80_000_000 + 2_400_000);
  });

  it("월 투자액 0원은 '옮기지 않는다'는 뜻이다 (계획 항목으로 대체하지 않는다)", () => {
    const input = base({ assumptions: { ...FLAT, monthlyInvestment: 0 } });
    const stock = input.assets.find((a) => a.kind === "investment")!;
    input.planItems.push(planItem({ kind: "saving", amount: 400_000, member_id: input.members[0].id, asset_id: stock.id }));
    const first = simulate(input).points[0];
    expect(first.invested).toBe(20_000_000);
    expect(first.cash).toBe(12_400_000);
  });

  it("지정하지 않으면 투자·연금 자산에 연결된 저축 항목만 옮긴다 (적금·미연결 저축은 현금에 남는다)", () => {
    const input = base();
    const pension = asset({ kind: "pension", liquidity: "locked" });
    const installmentSavings = asset({ kind: "savings" });
    input.assets.push(pension, installmentSavings);
    input.assetValues = { ...input.assetValues, [pension.id]: 5_000_000, [installmentSavings.id]: 3_000_000 };
    const [haneul] = input.members;
    input.planItems.push(
      planItem({ kind: "saving", amount: 300_000, member_id: haneul.id, asset_id: pension.id }),
      planItem({ kind: "saving", amount: 200_000, member_id: haneul.id, asset_id: installmentSavings.id }),
    );
    const first = simulate(input).points[0];
    // 하늘 사용 가능 금액 200 − 30 − 20 = 150 → 소비 450, 저축 250
    expect(first.savings).toBe(2_500_000);
    // 연금으로 30만만 이동: 투자 2,000 + 500 + 30
    expect(first.invested).toBe(25_300_000);
    // 현금성: 1,000 + 적금 300 + 저축 250 − 30
    expect(first.cash).toBe(15_200_000);
  });

  it("기본 가정에서는 월 투자액이 지정되지 않은 상태(null)다", () => {
    expect(resolveAssumptions({}).monthlyInvestment).toBeNull();
    expect(resolveAssumptions(null)).toEqual(DEFAULT_ASSUMPTIONS);
    expect(resolveAssumptions({ horizonYears: 3, monthlyInvestment: 0 })).toMatchObject({ horizonYears: 3, monthlyInvestment: 0, salaryGrowthPct: 3 });
  });
});

describe("미래 시뮬레이션: 주택 입주 (10절 4항)", () => {
  it("대출이 잔금보다 크고 보증금도 돌려받는 경우: 차액과 보증금이 현금으로 들어오고 순자산은 그대로다", () => {
    const withLease = () => {
      const input = base();
      const lease = asset({ kind: "lease_deposit", liquidity: "locked" });
      input.assets.push(lease);
      input.assetValues = { ...input.assetValues, [lease.id]: 30_000_000 };
      return input;
    };
    const input = withLease();
    input.events = [
      event("home_move_in", "2026-06", {
        balanceDue: 200_000_000,
        loanAmount: 230_000_000,
        loanRate: 0,
        loanTermMonths: 360,
        loanMethod: "equal_principal",
        depositReturn: 30_000_000,
        monthlyExpenseDelta: 0,
      }),
    ];
    const result = simulate(input);
    const plain = simulate(withLease());
    const at = (r: typeof plain, m: string) => r.points.find((p) => p.month === m)!;

    // 입주 전 달까지는 같다
    expect(at(result, "2026-05")).toEqual(at(plain, "2026-05"));

    const june = at(result, "2026-06");
    expect(at(plain, "2026-06")).toMatchObject({ cash: 16_000_000, fixed: 80_000_000, liabilities: 0, netWorth: 116_000_000 });
    // 현금: 1,600 + (대출 2.3억 − 잔금 2억) + 보증금 3,000
    expect(june.cash).toBe(76_000_000);
    // 비금융: 분양 납부금 5,000 → 부동산 5,000 + 잔금 2억 = 2.5억, 보증금 3,000은 사라진다
    expect(june.fixed).toBe(250_000_000);
    expect(june.liabilities).toBe(230_000_000);
    expect(june.netWorth).toBe(116_000_000);

    // 첫 납부는 다음 달: 2.3억 ÷ 360 = 638,888.89 → 638,889. 무이자라 순자산은 여전히 같다.
    const july = at(result, "2026-07");
    expect(july.debtPayment).toBe(638_889);
    expect(july.liabilities).toBe(229_361_111);
    expect(july.netWorth).toBe(at(plain, "2026-07").netWorth);
  });

  it("대출 없이 입주하면 잔금 전액이 현금에서 나가고 부채는 생기지 않는다", () => {
    const input = base();
    input.assetValues = { ...input.assetValues, [input.assets[0].id]: 120_000_000 };
    input.events = [
      event("home_move_in", "2026-05", {
        balanceDue: 100_000_000,
        loanAmount: 0,
        loanRate: 0,
        loanTermMonths: 360,
        loanMethod: "amortized",
        depositReturn: 0,
        monthlyExpenseDelta: 0,
      }),
    ];
    const may = simulate(input).points.find((p) => p.month === "2026-05")!;
    // 현금 1.2억 + 저축 400(두 달) − 잔금 1억
    expect(may.cash).toBe(24_000_000);
    expect(may.fixed).toBe(150_000_000);
    expect(may.liabilities).toBe(0);
    expect(may.netWorth).toBe(120_000_000 + 20_000_000 + 50_000_000 + 4_000_000);
  });
});

describe("미래 시뮬레이션: 부채가 끝나면 풀리는 월 여유 자금 (10절 5항)", () => {
  const paidOffAmount = (input: SimulationInput) => simulate(input).milestones.find((m) => m.kind === "debt_paid_off")!;

  it("마지막 회차가 끝수 때문에 더 커도 평소 회차 금액을 표시한다", () => {
    const input = base();
    // 1,000만 ÷ 30 = 333,333. 2024-01 시작 → 2026-06 이 30번째(마지막). 27회 납부 뒤 잔액 1,000,009
    const loan = liability({
      kind: "installment",
      name: "할부",
      original_principal: 10_000_000,
      term_months: 30,
      start_month: "2024-01",
      payer_member_id: input.members[0].id,
    });
    input.liabilities = [loan];
    input.liabilityBalances = { [loan.id]: 1_000_009 };
    const result = simulate(input);
    expect(result.points.slice(0, 3).map((p) => p.debtPayment)).toEqual([333_333, 333_333, 333_343]);
    expect(paidOffAmount(input)).toMatchObject({ month: "2026-06", amount: 333_333, label: "할부 상환 완료" });
  });

  it("원금균등은 가장 큰 첫 납부액이 아니라 끝나기 직전 회차의 납부액을 표시한다", () => {
    const input = base();
    // 120만, 연 12%, 3개월: 412,000 → 408,000 → 404,000(마지막)
    const loan = liability({
      kind: "equal_principal",
      name: "단기 대출",
      original_principal: 1_200_000,
      annual_rate: 12,
      term_months: 3,
      start_month: "2026-04",
    });
    input.liabilities = [loan];
    input.liabilityBalances = { [loan.id]: 1_200_000 };
    const result = simulate(input);
    expect(result.points.slice(0, 4).map((p) => p.debtPayment)).toEqual([412_000, 408_000, 404_000, 0]);
    expect(paidOffAmount(input)).toMatchObject({ month: "2026-06", amount: 408_000 });
    // 이자만 소비다: 500 + 1.2 / 0.8 / 0.4
    expect(result.points.slice(0, 3).map((p) => p.consumption)).toEqual([5_012_000, 5_008_000, 5_004_000]);
  });

  it("원금이 줄지 않는 차용금은 끝나지 않고 지급액이 매달 소비로 잡힌다", () => {
    const input = base();
    const parents = liability({
      kind: "interest_only",
      original_principal: 30_000_000,
      monthly_payment: 400_000,
      payer_member_id: input.members[0].id,
    });
    input.liabilities = [parents];
    input.liabilityBalances = { [parents.id]: 30_000_000 };
    const result = simulate(input);
    expect(result.milestones.filter((m) => m.kind === "debt_paid_off")).toEqual([]);
    expect(result.points.every((p) => p.liabilities === 30_000_000 && p.debtPayment === 400_000)).toBe(true);
    // 하늘의 사용 가능 금액이 40만 줄고(160) 그 40만이 이자로 나간다 → 소비·저축은 그대로
    expect(result.points[0]).toMatchObject({ consumption: 5_000_000, savings: 2_000_000 });
  });
});

describe("미래 시뮬레이션: 기간", () => {
  it("기간(년) × 12 개월만큼 계산하고, 시작 월이 첫 점이다", () => {
    const result = simulate(base({ startMonth: "2026-11", assumptions: { ...FLAT, horizonYears: 1 } }));
    expect(result.points).toHaveLength(12);
    expect(result.points[0].month).toBe("2026-11");
    expect(result.points[2].month).toBe("2027-01");
    expect(result.points[11].month).toBe("2027-10");
  });
});
