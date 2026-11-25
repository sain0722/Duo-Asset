/**
 * 정산 화면의 저장 동작. 항상 이 달의 최신 입력 행(version 포함)을 찾아 넘긴다.
 * 여러 건을 한 번에 확인할 때는 saveInputs(테이블마다 요청 1회)를 한 번의 mutate(재조회 1회) 안에서 부른다.
 */
import {
  clearSnapshotOrEntry,
  saveAssetSnapshot,
  saveEntry,
  saveLiabilitySnapshot,
  saveMonthInputs,
  type AssetSnapshotValues,
  type LiabilitySnapshotValues,
} from "@/lib/data/mutations";
import { memberIdOf } from "@/lib/finance";
import type { AmountLine, AssetLine, LiabilityLine, Won } from "@/lib/finance/types";

import type { MonthInputs } from "./model";
import type { OpenMonthContext } from "./month-context";

type Ctx = Pick<OpenMonthContext, "month" | "own" | "report">;

/** 아직 행이 없는(미확인) 항목 여러 건을 테이블마다 한 번의 요청으로 기록한다 */
export function saveInputs(ctx: Ctx, inputs: Partial<MonthInputs>) {
  return saveMonthInputs(ctx.month.id, inputs);
}

/** 계획 줄(또는 추가 항목)의 실제 금액을 기록한다 */
export function saveAmountLine(ctx: Ctx, kind: "income" | "contribution" | "expense", line: AmountLine, amount: Won) {
  const existing = line.entryId ? ctx.own.entries.find((entry) => entry.id === line.entryId) : undefined;
  const planItemId = ctx.report.planLines.find((plan) => plan.key === line.key)?.planItemId ?? null;
  return saveEntry(ctx.month.id, existing, {
    kind,
    member_id: memberIdOf(line.pocket),
    plan_item_id: planItemId,
    name: line.name,
    amount,
  });
}

export function clearAmountLine(line: AmountLine) {
  if (!line.entryId) return Promise.resolve();
  return clearSnapshotOrEntry("month_entries", line.entryId);
}

export function saveAssetLine(ctx: Ctx, line: Pick<AssetLine, "assetId">, values: AssetSnapshotValues) {
  const existing = ctx.own.assetSnapshots.find((snapshot) => snapshot.asset_id === line.assetId);
  return saveAssetSnapshot(ctx.month.id, line.assetId, existing, values);
}

export function clearAssetLine(ctx: Ctx, line: Pick<AssetLine, "assetId">) {
  const existing = ctx.own.assetSnapshots.find((snapshot) => snapshot.asset_id === line.assetId);
  if (!existing) return Promise.resolve();
  return clearSnapshotOrEntry("asset_snapshots", existing.id);
}

export function saveLiabilityLine(ctx: Ctx, line: Pick<LiabilityLine, "liabilityId">, values: LiabilitySnapshotValues) {
  const existing = ctx.own.liabilitySnapshots.find((snapshot) => snapshot.liability_id === line.liabilityId);
  return saveLiabilitySnapshot(ctx.month.id, line.liabilityId, existing, values);
}

export function clearLiabilityLine(ctx: Ctx, line: Pick<LiabilityLine, "liabilityId">) {
  const existing = ctx.own.liabilitySnapshots.find((snapshot) => snapshot.liability_id === line.liabilityId);
  if (!existing) return Promise.resolve();
  return clearSnapshotOrEntry("liability_snapshots", existing.id);
}

/** 전부터 있던 자산을 이번 달에 등록하며 적은 월초 값. 확인을 취소하면 함께 사라지므로 취소를 막는다. */
export function hasOpeningValues(ctx: Ctx, assetId: string): boolean {
  const snapshot = ctx.own.assetSnapshots.find((s) => s.asset_id === assetId);
  return snapshot?.opening_value != null;
}
