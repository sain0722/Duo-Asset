import type { Goal, GoalAllocation, Won } from "@/lib/finance/types";

/** computeGoalProgress 와 같은 순서 (정렬 순서 → 만든 순서) */
export function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export function nextSortOrder(goals: Goal[]): number {
  return goals.reduce((max, goal) => Math.max(max, goal.sort_order + 1), 0);
}

/**
 * 진행 중인 목표 하나를 위/아래로 옮긴 뒤의 sort_order.
 * 같은 sort_order 가 겹쳐 있을 수 있어 자리만 바꾸지 않고 순서대로 다시 매긴다. 바뀌는 행만 돌려준다.
 */
export function reorderGoals(goals: Goal[], goalId: string, direction: -1 | 1): { goal: Goal; sort_order: number }[] {
  const ordered = sortGoals(goals.filter((goal) => !goal.is_archived));
  const index = ordered.findIndex((goal) => goal.id === goalId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return [];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered
    .map((goal, order) => ({ goal, sort_order: order }))
    .filter(({ goal, sort_order }) => goal.sort_order !== sort_order);
}

export interface AllocationDraft {
  assetId: string;
  /** null = 남은 전부 */
  amount: Won | null;
}

/** 저장된 배정과 폼의 배정을 비교해 넣을 것 · 고칠 것 · 지울 것을 나눈다 (목표·자산 한 쌍에 하나뿐이다) */
export function diffAllocations(existing: GoalAllocation[], desired: AllocationDraft[]) {
  const byAsset = new Map(existing.map((row) => [row.asset_id, row]));
  const wanted = new Set(desired.map((draft) => draft.assetId));
  return {
    insert: desired.filter((draft) => !byAsset.has(draft.assetId)),
    update: desired.flatMap((draft) => {
      const row = byAsset.get(draft.assetId);
      return row && row.amount !== draft.amount ? [{ row, amount: draft.amount }] : [];
    }),
    remove: existing.filter((row) => !wanted.has(row.asset_id)),
  };
}
