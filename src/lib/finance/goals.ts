import { addMonths, diffMonths, ymOfDateString } from "@/lib/month";
import { ASSET_KINDS } from "./meta";
import { percentOf } from "./settlement";
import type {
  Asset,
  BalanceTotals,
  Goal,
  GoalAllocation,
  GoalProgress,
  SimulationPoint,
  Won,
  Ym,
} from "./types";

function bySortOrder(a: Goal, b: Goal): number {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

/**
 * 목표별 진행 상황. 규칙은 docs/finance-rules.md 9절.
 *
 * 한 자산이 여러 목표에 연결돼 있으면 목표 정렬 순서대로 자산의 남은 평가금액 안에서만 배정한다.
 * 그래서 배정액 합계는 자산 평가금액을 넘지 않는다.
 */
export function computeGoalProgress(args: {
  goals: Goal[];
  allocations: GoalAllocation[];
  /** 배정된 금액이 가용자산·금융자산 중 어디에 속하는지 알기 위해 필요하다 (없으면 차감하지 않는다) */
  assets?: Asset[];
  /** 자산 id → 현재 평가금액 */
  assetValues: Record<string, Won>;
  totals: BalanceTotals;
  currentMonth: Ym;
  /** 기본 시나리오 시뮬레이션 결과 (순자산·금융자산 목표의 예상 달성 시점에 사용) */
  projection?: SimulationPoint[];
}): GoalProgress[] {
  const { goals, allocations, assets = [], assetValues, totals, currentMonth, projection } = args;
  const remainingByAsset = new Map<string, Won>(
    Object.entries(assetValues).map(([id, value]) => [id, Math.max(value, 0)]),
  );
  const active = goals.filter((goal) => !goal.is_archived).sort(bySortOrder);

  // 1. 자산을 연결한 목표부터 우선순위대로 배정한다
  const allocatedByGoal = new Map<string, GoalProgress["allocations"]>();
  const shortfallByGoal = new Map<string, Won>();
  for (const goal of active) {
    if (goal.basis !== "linked") continue;
    const allocated: GoalProgress["allocations"] = [];
    let total = 0;
    let shortfall = 0;
    for (const allocation of allocations.filter((a) => a.goal_id === goal.id)) {
      const available = remainingByAsset.get(allocation.asset_id) ?? 0;
      // "남은 전부"도 이 목표에 필요한 만큼만 가져간다 (다음 목표가 같은 자산을 쓸 수 있게)
      const wanted = allocation.amount ?? Math.max(goal.target_amount - total, 0);
      const amount = Math.min(wanted, available);
      remainingByAsset.set(allocation.asset_id, available - amount);
      total += amount;
      if (allocation.amount !== null) shortfall += allocation.amount - amount;
      allocated.push({ assetId: allocation.asset_id, requested: allocation.amount, allocated: amount });
    }
    allocatedByGoal.set(goal.id, allocated);
    shortfallByGoal.set(goal.id, shortfall);
  }

  // 2. 가용자산·금융자산 기준 목표는 다른 목표에 이미 배정된 금액을 빼고 본다 (같은 돈을 두 번 세지 않는다)
  const all = [...allocatedByGoal.values()].flat();
  const reservedLiquid = sumAllocated(all, assets, (asset) => asset.liquidity === "liquid");
  const reservedFinancial = sumAllocated(all, assets, (asset) => ASSET_KINDS[asset.kind].financial);

  return active.map((goal) => {
    const allocated = allocatedByGoal.get(goal.id) ?? [];
    const current = currentAmount(goal, allocated, totals, reservedLiquid, reservedFinancial);
    const target = goal.target_amount;
    const remaining = Math.max(target - current, 0);
    const achieved = current >= target;

    let requiredMonthly: Won | null = null;
    if (!achieved && goal.target_date) {
      const monthsLeft = diffMonths(currentMonth, ymOfDateString(goal.target_date));
      if (monthsLeft > 0) requiredMonthly = Math.ceil(remaining / monthsLeft);
    }

    return {
      goalId: goal.id,
      current,
      target,
      percent: Math.max(percentOf(current, target) ?? 0, 0),
      remaining,
      requiredMonthly,
      expectedMonth: achieved ? null : expectedMonth(goal, remaining, currentMonth, projection, reservedFinancial),
      achieved,
      allocations: allocated,
      shortfall: shortfallByGoal.get(goal.id) ?? 0,
    };
  });
}

function sumAllocated(
  allocations: GoalProgress["allocations"],
  assets: Asset[],
  include: (asset: Asset) => boolean,
): Won {
  const ids = new Set(assets.filter(include).map((asset) => asset.id));
  return allocations.reduce((total, a) => total + (ids.has(a.assetId) ? a.allocated : 0), 0);
}

function currentAmount(
  goal: Goal,
  allocated: GoalProgress["allocations"],
  totals: BalanceTotals,
  reservedLiquid: Won,
  reservedFinancial: Won,
): Won {
  switch (goal.basis) {
    case "linked":
      return allocated.reduce((total, a) => total + a.allocated, 0);
    case "manual":
      return goal.manual_amount ?? 0;
    case "net_worth":
      return totals.netWorth;
    case "liquid_assets":
      return totals.liquid - reservedLiquid;
    case "financial_assets":
      return totals.financial - reservedFinancial;
  }
}

function expectedMonth(
  goal: Goal,
  remaining: Won,
  currentMonth: Ym,
  projection: SimulationPoint[] | undefined,
  reservedFinancial: Won,
): Ym | null {
  // 순자산·금융자산 목표는 시뮬레이션 추이에서 처음 목표를 넘는 달
  if (projection && (goal.basis === "net_worth" || goal.basis === "financial_assets")) {
    const hit = projection.find((point) =>
      goal.basis === "net_worth"
        ? point.netWorth >= goal.target_amount
        : point.cash + point.invested - reservedFinancial >= goal.target_amount,
    );
    return hit?.month ?? null;
  }
  if (goal.monthly_contribution && goal.monthly_contribution > 0) {
    return addMonths(currentMonth, Math.ceil(remaining / goal.monthly_contribution));
  }
  return null;
}

/**
 * 가용자산 중 목표에 배정된 금액.
 * "목표 배정 후 여유 가용자산 = 가용자산 − 이 값"
 */
export function allocatedLiquid(progress: GoalProgress[], assets: Asset[]): Won {
  const liquidIds = new Set(assets.filter((a) => a.liquidity === "liquid").map((a) => a.id));
  let total = 0;
  for (const goal of progress) {
    for (const allocation of goal.allocations) {
      if (liquidIds.has(allocation.assetId)) total += allocation.allocated;
    }
  }
  return total;
}
