import { describe, expect, it } from "vitest";

import { allocation, asset, goal } from "@/lib/finance/testing";

import { diffAllocations, nextSortOrder, reorderGoals } from "./goal-ops";

describe("목표 순서 바꾸기", () => {
  it("아래로 내리면 이웃과 자리를 바꾸고 바뀐 행만 돌려준다", () => {
    const a = goal({ target_amount: 1, sort_order: 0 });
    const b = goal({ target_amount: 1, sort_order: 1 });
    const c = goal({ target_amount: 1, sort_order: 2 });
    const changes = reorderGoals([c, a, b], a.id, 1);
    expect(changes.map((x) => [x.goal.id, x.sort_order])).toEqual([
      [b.id, 0],
      [a.id, 1],
    ]);
  });

  it("sort_order 가 겹쳐 있어도 순서대로 다시 매긴다", () => {
    const a = goal({ target_amount: 1, sort_order: 0, created_at: "2026-01-01T00:00:00Z" });
    const b = goal({ target_amount: 1, sort_order: 0, created_at: "2026-01-02T00:00:00Z" });
    const changes = reorderGoals([a, b], b.id, -1);
    expect(changes.map((x) => [x.goal.id, x.sort_order])).toEqual([[a.id, 1]]);
  });

  it("맨 위에서 더 올리거나 보관한 목표는 바꾸지 않는다", () => {
    const a = goal({ target_amount: 1, sort_order: 0 });
    const archived = goal({ target_amount: 1, sort_order: 1, is_archived: true });
    expect(reorderGoals([a, archived], a.id, -1)).toEqual([]);
    expect(reorderGoals([a, archived], a.id, 1)).toEqual([]);
  });

  it("새 목표는 맨 뒤에 붙는다", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([goal({ target_amount: 1, sort_order: 4 }), goal({ target_amount: 1, sort_order: 2 })])).toBe(5);
  });
});

describe("배정 저장", () => {
  const g = goal({ target_amount: 10_000_000 });
  const cash = asset({ kind: "cash" });
  const deposit = asset({ kind: "deposit" });
  const savings = asset({ kind: "savings" });

  it("새 자산은 넣고, 금액이 바뀐 것은 고치고, 빠진 것은 지운다", () => {
    const keep = allocation(g, cash, 1_000_000);
    const change = allocation(g, deposit, null);
    const drop = allocation(g, savings, 500_000);
    const other = asset({ kind: "investment" });
    const diff = diffAllocations(
      [keep, change, drop],
      [
        { assetId: cash.id, amount: 1_000_000 },
        { assetId: deposit.id, amount: 2_000_000 },
        { assetId: other.id, amount: null },
      ],
    );
    expect(diff.insert).toEqual([{ assetId: other.id, amount: null }]);
    expect(diff.update).toEqual([{ row: change, amount: 2_000_000 }]);
    expect(diff.remove).toEqual([drop]);
  });

  it("'남은 전부'(null)와 0원은 다른 값이다", () => {
    const row = allocation(g, cash, null);
    expect(diffAllocations([row], [{ assetId: cash.id, amount: 0 }]).update).toEqual([{ row, amount: 0 }]);
  });
});
