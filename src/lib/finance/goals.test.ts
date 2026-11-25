import { describe, expect, it } from "vitest";
import { allocatedLiquid, computeGoalProgress } from "./goals";
import { balanceTotals } from "./settlement";
import { allocation, asset, goal } from "./testing";
import type { SimulationPoint } from "./types";

const account = asset({ kind: "cash", name: "비상금 통장" });
const deposit = asset({ kind: "deposit", name: "예금" });
const assets = [account, deposit];
const assetValues = { [account.id]: 10_000_000, [deposit.id]: 30_000_000 };
const totals = balanceTotals(
  assets.map((a) => ({ kind: a.kind, liquidity: a.liquidity, value: assetValues[a.id] })),
  [{ balance: 15_000_000 }],
);

describe("목표 진행 상황", () => {
  it("연결한 자산의 배정액으로 달성률을 계산한다", () => {
    const emergency = goal({ target_amount: 15_000_000, target_date: "2027-03-31" });
    const [progress] = computeGoalProgress({
      goals: [emergency],
      allocations: [allocation(emergency, account, null)],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    expect(progress.current).toBe(10_000_000);
    expect(progress.percent).toBe(66.7);
    expect(progress.remaining).toBe(5_000_000);
    expect(progress.achieved).toBe(false);
    // 12개월 남음 → 월 41만 6,667원 (올림)
    expect(progress.requiredMonthly).toBe(416_667);
  });

  it("같은 자산을 여러 목표에 배정해도 합계가 평가금액을 넘지 않는다", () => {
    const first = goal({ target_amount: 8_000_000, sort_order: 1 });
    const second = goal({ target_amount: 8_000_000, sort_order: 2 });
    const third = goal({ target_amount: 5_000_000, sort_order: 3 });
    const progress = computeGoalProgress({
      goals: [third, second, first],
      allocations: [
        allocation(first, account, 7_000_000),
        allocation(second, account, 7_000_000),
        allocation(third, account, null),
      ],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    const byId = Object.fromEntries(progress.map((p) => [p.goalId, p]));
    expect(byId[first.id].current).toBe(7_000_000);
    // 통장에 1,000만 원뿐이므로 두 번째 목표는 남은 300만 원만 배정되고 400만 원이 모자란다
    expect(byId[second.id].current).toBe(3_000_000);
    expect(byId[second.id].shortfall).toBe(4_000_000);
    expect(byId[third.id].current).toBe(0);
    const totalAllocated = progress.reduce((total, p) => total + p.current, 0);
    expect(totalAllocated).toBeLessThanOrEqual(assetValues[account.id]);
  });

  it("순자산·가용자산·금융자산 기준 목표는 자산을 배정하지 않고 지표를 그대로 본다", () => {
    const netWorth = goal({ target_amount: 100_000_000, basis: "net_worth" });
    const liquid = goal({ target_amount: 20_000_000, basis: "liquid_assets" });
    const financial = goal({ target_amount: 40_000_000, basis: "financial_assets" });
    const progress = computeGoalProgress({
      goals: [netWorth, liquid, financial],
      allocations: [],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    expect(progress[0].current).toBe(25_000_000);
    expect(progress[1].current).toBe(10_000_000);
    expect(progress[2].current).toBe(40_000_000);
    expect(progress[2].achieved).toBe(true);
    expect(progress[2].percent).toBe(100);
  });

  it("월 적립 계획으로 예상 달성 시점을 구한다", () => {
    const trip = goal({ target_amount: 6_000_000, basis: "manual", manual_amount: 1_500_000, monthly_contribution: 500_000 });
    const [progress] = computeGoalProgress({ goals: [trip], allocations: [], assetValues, totals, currentMonth: "2026-03" });
    expect(progress.expectedMonth).toBe("2026-12");
  });

  it("순자산 목표의 예상 달성 시점은 시뮬레이션에서 처음 넘는 달이다", () => {
    const target = goal({ target_amount: 30_000_000, basis: "net_worth" });
    const point = (month: string, netWorth: number): SimulationPoint => ({
      month, cash: 0, invested: 0, fixed: 0, assets: netWorth, liabilities: 0, netWorth, income: 0, consumption: 0, savings: 0, debtPayment: 0,
    });
    const [progress] = computeGoalProgress({
      goals: [target],
      allocations: [],
      assetValues,
      totals,
      currentMonth: "2026-03",
      projection: [point("2026-04", 27_000_000), point("2026-05", 29_500_000), point("2026-06", 31_000_000)],
    });
    expect(progress.expectedMonth).toBe("2026-06");
  });

  it("목표에 배정된 가용자산을 따로 집계한다", () => {
    const emergency = goal({ target_amount: 15_000_000 });
    const house = goal({ target_amount: 100_000_000 });
    const progress = computeGoalProgress({
      goals: [emergency, house],
      allocations: [allocation(emergency, account, 6_000_000), allocation(house, deposit, null)],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    // 예금은 즉시 사용 가능 자산이 아니므로 제외
    expect(allocatedLiquid(progress, assets)).toBe(6_000_000);
  });

  it("보관한 목표는 제외한다", () => {
    const archived = goal({ target_amount: 1_000_000, is_archived: true });
    expect(computeGoalProgress({ goals: [archived], allocations: [], assetValues, totals, currentMonth: "2026-03" })).toEqual([]);
  });
});


// ───────────────────────── 추가 고정: 배정 순서 · 반올림 · 예상 시점 ─────────────────────────

describe("목표: 자산 배정 (9절)", () => {
  it("평가금액이 음수인 자산(마이너스 통장)은 배정할 금액이 0이다", () => {
    const overdraft = asset({ kind: "cash", name: "마이너스 통장" });
    const emergency = goal({ target_amount: 5_000_000, sort_order: 1 });
    const trip = goal({ target_amount: 3_000_000, sort_order: 2 });
    const progress = computeGoalProgress({
      goals: [emergency, trip],
      allocations: [allocation(emergency, overdraft, 1_000_000), allocation(trip, overdraft, null)],
      assetValues: { [overdraft.id]: -2_000_000 },
      totals,
      currentMonth: "2026-03",
    });
    expect(progress[0]).toMatchObject({ current: 0, percent: 0, remaining: 5_000_000, shortfall: 1_000_000 });
    expect(progress[0].allocations).toEqual([{ assetId: overdraft.id, requested: 1_000_000, allocated: 0 }]);
    // "남은 전부"도 0이다 (음수를 배정하지 않는다)
    expect(progress[1]).toMatchObject({ current: 0, percent: 0, remaining: 3_000_000, shortfall: 0 });
    expect(progress[1].allocations).toEqual([{ assetId: overdraft.id, requested: null, allocated: 0 }]);
  });

  it("'남은 전부'가 여러 목표에 걸리면 정렬 순서가 빠른 목표부터 채우고, 뒤 목표에는 남은 만큼만 간다", () => {
    const first = goal({ target_amount: 50_000_000, sort_order: 1 });
    const second = goal({ target_amount: 50_000_000, sort_order: 2 });
    const third = goal({ target_amount: 50_000_000, sort_order: 3 });
    const progress = computeGoalProgress({
      goals: [third, second, first],
      allocations: [
        allocation(third, deposit, null),
        allocation(second, deposit, null),
        // 첫 목표는 예금에서 1,200만만 쓰고, 통장은 전부 쓴다
        allocation(first, deposit, 12_000_000),
        allocation(first, account, null),
      ],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    // 결과도 정렬 순서대로 나온다
    expect(progress.map((p) => p.goalId)).toEqual([first.id, second.id, third.id]);
    expect(progress[0].current).toBe(22_000_000);
    // 예금 3,000만 − 1,200만 = 1,800만이 둘째 목표로 가고 셋째에는 남는 것이 없다
    expect(progress[1].current).toBe(18_000_000);
    expect(progress[2].current).toBe(0);
    expect(progress[2].shortfall).toBe(0);
    expect(progress.reduce((total, p) => total + p.current, 0)).toBe(40_000_000);
  });

  it("정렬 순서가 같으면 먼저 만든 목표부터 배정한다", () => {
    const older = goal({ target_amount: 8_000_000, sort_order: 5, created_at: "2026-01-01T00:00:00Z" });
    const newer = goal({ target_amount: 8_000_000, sort_order: 5, created_at: "2026-02-01T00:00:00Z" });
    const progress = computeGoalProgress({
      goals: [newer, older],
      allocations: [allocation(newer, account, 7_000_000), allocation(older, account, 7_000_000)],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    expect(progress.map((p) => p.goalId)).toEqual([older.id, newer.id]);
    expect(progress[0]).toMatchObject({ current: 7_000_000, shortfall: 0 });
    expect(progress[1]).toMatchObject({ current: 3_000_000, shortfall: 4_000_000 });
  });

  it("보관한 목표는 자산을 차지하지 않는다", () => {
    const archived = goal({ target_amount: 10_000_000, sort_order: 1, is_archived: true });
    const active = goal({ target_amount: 10_000_000, sort_order: 2 });
    const progress = computeGoalProgress({
      goals: [archived, active],
      allocations: [allocation(archived, account, null), allocation(active, account, null)],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ goalId: active.id, current: 10_000_000, achieved: true });
  });

  it("목표를 만들어도 총자산은 변하지 않고, 입력을 바꾸지 않는다", () => {
    const g = goal({ target_amount: 8_000_000 });
    const goals = [g];
    const allocations = [allocation(g, account, null)];
    const values = { ...assetValues };
    const before = JSON.stringify({ goals, allocations, values, totals });
    computeGoalProgress({ goals, allocations, assetValues: values, totals, currentMonth: "2026-03" });
    expect(JSON.stringify({ goals, allocations, values, totals })).toBe(before);
  });
});

describe("목표: 필요한 월 적립액 (목표일까지 남은 달로 나눠 올림)", () => {
  const run = (target_date: string | null, manual_amount = 2_000_000) =>
    computeGoalProgress({
      goals: [goal({ target_amount: 3_000_000, basis: "manual", manual_amount, target_date })],
      allocations: [],
      assetValues,
      totals,
      currentMonth: "2026-03",
    })[0];

  it("나누어떨어지지 않으면 올린다 (반올림하면 목표일에 모자란다)", () => {
    // 남은 100만 ÷ 3개월 = 333,333.33 → 333,334
    expect(run("2026-06-30").requiredMonthly).toBe(333_334);
    // 남은 100만 ÷ 7개월 = 142,857.14 → 142,858
    expect(run("2026-10-01").requiredMonthly).toBe(142_858);
    // 나누어떨어지면 그대로
    expect(run("2026-07-15").requiredMonthly).toBe(250_000);
  });

  it("목표일이 다음 달이면 남은 금액 전부가 필요하다", () => {
    expect(run("2026-04-01").requiredMonthly).toBe(1_000_000);
  });

  it("목표일이 이번 달이거나 지났으면 필요한 월 적립액을 계산하지 않는다", () => {
    expect(run("2026-03-31").requiredMonthly).toBeNull();
    expect(run("2026-02-28").requiredMonthly).toBeNull();
    expect(run("2025-12-31").requiredMonthly).toBeNull();
  });

  it("목표일이 없거나 이미 달성했으면 필요한 월 적립액이 없다", () => {
    expect(run(null).requiredMonthly).toBeNull();
    expect(run("2026-12-31", 3_000_000).requiredMonthly).toBeNull();
  });
});

describe("목표: 예상 달성 시점", () => {
  const point = (month: string, values: Partial<SimulationPoint>): SimulationPoint => ({
    month,
    cash: 0,
    invested: 0,
    fixed: 0,
    assets: 0,
    liabilities: 0,
    netWorth: 0,
    income: 0,
    consumption: 0,
    savings: 0,
    debtPayment: 0,
    ...values,
  });
  // 순자산은 처음부터 1억을 넘지만(부동산 포함) 금융자산(현금 + 투자)은 6월에야 5,000만을 넘는다
  const projection = [
    point("2026-04", { cash: 20_000_000, invested: 25_000_000, fixed: 300_000_000, netWorth: 145_000_000 }),
    point("2026-05", { cash: 22_000_000, invested: 27_999_999, fixed: 300_000_000, netWorth: 150_000_000 }),
    point("2026-06", { cash: 23_000_000, invested: 27_000_000, fixed: 300_000_000, netWorth: 151_000_000 }),
    point("2026-07", { cash: 30_000_000, invested: 30_000_000, fixed: 300_000_000, netWorth: 160_000_000 }),
  ];

  it("금융자산 목표는 시뮬레이션의 현금성 + 투자자산이 처음 목표 이상이 되는 달이다", () => {
    const financial = goal({ target_amount: 50_000_000, basis: "financial_assets" });
    const [progress] = computeGoalProgress({ goals: [financial], allocations: [], assetValues, totals, currentMonth: "2026-03", projection });
    expect(progress.current).toBe(40_000_000);
    expect(progress.expectedMonth).toBe("2026-06");
  });

  it("순자산 목표는 같은 추이에서 순자산으로 판단한다", () => {
    const netWorth = goal({ target_amount: 150_000_000, basis: "net_worth" });
    const [progress] = computeGoalProgress({ goals: [netWorth], allocations: [], assetValues, totals, currentMonth: "2026-03", projection });
    expect(progress.expectedMonth).toBe("2026-05");
  });

  it("시뮬레이션 기간 안에 넘지 못하면 예상 시점이 없다 (월 적립 계획으로 대신 계산하지 않는다)", () => {
    const far = goal({ target_amount: 900_000_000, basis: "net_worth", monthly_contribution: 1_000_000 });
    const [progress] = computeGoalProgress({ goals: [far], allocations: [], assetValues, totals, currentMonth: "2026-03", projection });
    expect(progress.expectedMonth).toBeNull();
  });

  it("가용자산 목표는 시뮬레이션을 쓰지 않고 월 적립 계획으로만 계산한다", () => {
    // 가용자산 1,000만, 목표 2,000만
    const withPlan = goal({ target_amount: 20_000_000, basis: "liquid_assets", monthly_contribution: 3_000_000 });
    const withoutPlan = goal({ target_amount: 20_000_000, basis: "liquid_assets" });
    const progress = computeGoalProgress({ goals: [withPlan, withoutPlan], allocations: [], assetValues, totals, currentMonth: "2026-03", projection });
    // 남은 1,000만 ÷ 300만 = 3.33 → 4개월 뒤
    expect(progress[0].expectedMonth).toBe("2026-07");
    expect(progress[1].expectedMonth).toBeNull();
  });

  it("월 적립 계획 기준 예상 시점은 남은 금액 ÷ 월 적립액을 올림한 개월 수 뒤다", () => {
    const run = (manual_amount: number, monthly_contribution: number | null) =>
      computeGoalProgress({
        goals: [goal({ target_amount: 6_000_000, basis: "manual", manual_amount, monthly_contribution })],
        allocations: [],
        assetValues,
        totals,
        currentMonth: "2026-11",
      })[0].expectedMonth;
    // 남은 100만 ÷ 30만 = 3.33 → 4개월 (반올림·버림이면 3개월). 해를 넘긴다.
    expect(run(5_000_000, 300_000)).toBe("2027-03");
    // 남은 100만 ÷ 100만 = 1개월
    expect(run(5_000_000, 1_000_000)).toBe("2026-12");
    // 남은 100만 ÷ 150만 = 0.67 → 1개월
    expect(run(5_000_000, 1_500_000)).toBe("2026-12");
    // 월 적립액이 0이거나 없으면 계산하지 않는다
    expect(run(5_000_000, 0)).toBeNull();
    expect(run(5_000_000, null)).toBeNull();
  });

  it("달성한 목표: 예상 시점·필요 적립액은 없고, 달성률은 100%에서 자르지 않는다", () => {
    const done = goal({
      target_amount: 8_000_000,
      target_date: "2027-12-31",
      monthly_contribution: 500_000,
    });
    const [progress] = computeGoalProgress({
      goals: [done],
      // 금액을 지정해 목표보다 많이 배정한 경우 (1,000만 원 전부)
      allocations: [allocation(done, account, 10_000_000)],
      assetValues,
      totals,
      currentMonth: "2026-03",
      projection,
    });
    expect(progress).toMatchObject({
      current: 10_000_000,
      achieved: true,
      remaining: 0,
      requiredMonthly: null,
      expectedMonth: null,
      // 1,000만 ÷ 800만 = 125%
      percent: 125,
    });
  });

  it("'남은 전부' 배정은 목표에 필요한 만큼만 가져가 다음 목표가 같은 자산을 쓸 수 있다", () => {
    const first = goal({ target_amount: 6_000_000, sort_order: 1 });
    const second = goal({ target_amount: 3_000_000, sort_order: 2 });
    const third = goal({ target_amount: 5_000_000, sort_order: 3 });
    const progress = computeGoalProgress({
      goals: [first, second, third],
      allocations: [allocation(first, account, null), allocation(second, account, null), allocation(third, account, null)],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    // 통장 1,000만 원: 600만 → 300만 → 남은 100만
    expect(progress.map((p) => p.current)).toEqual([6_000_000, 3_000_000, 1_000_000]);
    expect(progress.map((p) => p.achieved)).toEqual([true, true, false]);
  });

  it("가용자산·금융자산 기준 목표는 다른 목표에 배정된 금액을 다시 세지 않는다", () => {
    const linked = goal({ target_amount: 4_000_000, sort_order: 1 });
    const liquid = goal({ target_amount: 10_000_000, basis: "liquid_assets", sort_order: 2 });
    const financial = goal({ target_amount: 40_000_000, basis: "financial_assets", sort_order: 3 });
    const netWorth = goal({ target_amount: 25_000_000, basis: "net_worth", sort_order: 4 });
    const progress = computeGoalProgress({
      goals: [linked, liquid, financial, netWorth],
      allocations: [allocation(linked, account, 4_000_000)],
      assets,
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    // 가용자산 1,000만 중 400만은 이미 다른 목표의 몫이다
    expect(progress[1].current).toBe(6_000_000);
    expect(progress[1].achieved).toBe(false);
    // 금융자산 4,000만 − 400만
    expect(progress[2].current).toBe(36_000_000);
    // 순자산 목표는 전체 재산을 보는 목표라 배정과 무관하다
    expect(progress[3].current).toBe(25_000_000);
    // 배정 합계가 실제 가용자산을 넘지 않는다
    expect(progress[0].current + progress[1].current).toBeLessThanOrEqual(totals.liquid);
  });

  it("목표 금액과 정확히 같으면 달성이다", () => {
    const exact = goal({ target_amount: 10_000_000, basis: "liquid_assets" });
    const [progress] = computeGoalProgress({ goals: [exact], allocations: [], assetValues, totals, currentMonth: "2026-03" });
    expect(progress).toMatchObject({ achieved: true, percent: 100, remaining: 0 });
  });

  it("순자산이 음수면 달성률은 0%이고 남은 금액은 목표보다 크다", () => {
    const negative = balanceTotals([{ kind: "cash", liquidity: "liquid", value: 5_000_000 }], [{ balance: 15_000_000 }]);
    const [progress] = computeGoalProgress({
      goals: [goal({ target_amount: 100_000_000, basis: "net_worth" })],
      allocations: [],
      assetValues,
      totals: negative,
      currentMonth: "2026-03",
    });
    expect(progress).toMatchObject({ current: -10_000_000, percent: 0, remaining: 110_000_000, achieved: false });
  });

  it("달성률은 소수 1자리로 반올림한다", () => {
    // 1,000만 ÷ 3,000만 = 33.33…% , 2,000만 ÷ 3,000만 = 66.66…%
    const third = goal({ target_amount: 30_000_000, basis: "liquid_assets" });
    const twoThirds = goal({ target_amount: 30_000_000, basis: "manual", manual_amount: 20_000_000 });
    const progress = computeGoalProgress({ goals: [third, twoThirds], allocations: [], assetValues, totals, currentMonth: "2026-03" });
    expect(progress[0].percent).toBe(33.3);
    expect(progress[1].percent).toBe(66.7);
  });
});

describe("목표 배정 후 여유 가용자산 (9절)", () => {
  it("가용자산에 걸린 실제 배정액만 더한다: 요청액이 아니라 줄어든 배정액 기준", () => {
    const first = goal({ target_amount: 8_000_000, sort_order: 1 });
    const second = goal({ target_amount: 8_000_000, sort_order: 2 });
    const progress = computeGoalProgress({
      goals: [first, second],
      allocations: [allocation(first, account, 7_000_000), allocation(second, account, 7_000_000), allocation(second, deposit, 5_000_000)],
      assetValues,
      totals,
      currentMonth: "2026-03",
    });
    // 통장(가용) 1,000만: 700 + 300 = 1,000. 예금 500만은 가용자산이 아니다.
    expect(allocatedLiquid(progress, assets)).toBe(10_000_000);
    expect(totals.liquid - allocatedLiquid(progress, assets)).toBe(0);
  });
});
