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
