import type {
  Asset,
  AssetSnapshot,
  FutureEvent,
  Goal,
  GoalAllocation,
  Household,
  Liability,
  LiabilitySnapshot,
  Member,
  MonthEntry,
  MonthRow,
  PlanItem,
  Scenario,
} from "@/lib/finance/types";
import { NetworkError, toAppError } from "./errors";
import { getSupabase } from "./supabase";
import type { BackupFile, HouseholdData, MonthData } from "./types";

export type TableName =
  | "households"
  | "members"
  | "assets"
  | "liabilities"
  | "plan_items"
  | "months"
  | "asset_snapshots"
  | "liability_snapshots"
  | "month_entries"
  | "goals"
  | "goal_allocations"
  | "scenarios"
  | "future_events";

const PAGE_SIZE = 1000;

/** 테이블 전체를 읽는다. PostgREST 의 한 번 응답 행 수 제한(기본 1000)을 넘으면 이어서 읽는다. */
async function selectAll<T>(
  table: TableName,
  order: string,
  filter?: { column: string; values: string[] },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = getSupabase().from(table).select("*");
    if (filter) query = query.in(filter.column, filter.values);
    const { data, error } = await query
      .order(order, { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw toAppError(error);
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) return rows;
  }
}

/**
 * 가구 데이터 전체를 읽는다. 가구가 없으면(온보딩 전) null.
 * 접근 범위는 RLS 가 정한다 — 여기서는 household_id 조건을 걸지 않는다.
 */
export async function fetchHousehold(): Promise<HouseholdData | null> {
  const supabase = getSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  // 오프라인·일시 장애를 "로그아웃됨"으로 오해하지 않게 구분한다
  if (authError?.name === "AuthRetryableFetchError") throw new NetworkError();
  if (authError || !user) throw new Error("로그인이 필요합니다.");

  const members = await selectAll<Member>("members", "sort_order");
  const me = members.find((member) => member.user_id === user.id);
  if (!me) return null;

  const [households, assets, liabilities, planItems, months, goals, goalAllocations, scenarios, events] =
    await Promise.all([
      selectAll<Household>("households", "created_at"),
      selectAll<Asset>("assets", "sort_order"),
      selectAll<Liability>("liabilities", "sort_order"),
      selectAll<PlanItem>("plan_items", "sort_order"),
      selectAll<MonthRow>("months", "month"),
      selectAll<Goal>("goals", "sort_order"),
      selectAll<GoalAllocation>("goal_allocations", "created_at"),
      selectAll<Scenario>("scenarios", "sort_order"),
      selectAll<FutureEvent>("future_events", "month"),
    ]);

  // 월별 입력 행은 열린 달만 읽는다. 마감된 달은 months.summary 로 충분하다.
  const openIds = months.filter((month) => month.status === "open").map((month) => month.id);
  const monthData: Record<string, MonthData> = Object.fromEntries(
    openIds.map((id) => [id, { assetSnapshots: [], liabilitySnapshots: [], entries: [] }]),
  );
  if (openIds.length > 0) {
    const filter = { column: "month_id", values: openIds };
    const [assetSnapshots, liabilitySnapshots, entries] = await Promise.all([
      selectAll<AssetSnapshot>("asset_snapshots", "created_at", filter),
      selectAll<LiabilitySnapshot>("liability_snapshots", "created_at", filter),
      selectAll<MonthEntry>("month_entries", "created_at", filter),
    ]);
    for (const row of assetSnapshots) monthData[row.month_id].assetSnapshots.push(row);
    for (const row of liabilitySnapshots) monthData[row.month_id].liabilitySnapshots.push(row);
    for (const row of entries) monthData[row.month_id].entries.push(row);
  }

  return {
    household: households[0],
    me,
    members,
    assets,
    liabilities,
    planItems,
    months,
    monthData,
    goals,
    goalAllocations,
    scenarios,
    events,
  };
}

/** 백업용: 가구의 모든 행을 읽는다 (마감된 달의 입력 행 포함). */
export async function exportBackup(): Promise<BackupFile> {
  const [
    households,
    members,
    assets,
    liabilities,
    planItems,
    months,
    assetSnapshots,
    liabilitySnapshots,
    monthEntries,
    goals,
    goalAllocations,
    scenarios,
    events,
  ] = await Promise.all([
    selectAll<Household>("households", "created_at"),
    selectAll<Member>("members", "sort_order"),
    selectAll<Asset>("assets", "sort_order"),
    selectAll<Liability>("liabilities", "sort_order"),
    selectAll<PlanItem>("plan_items", "sort_order"),
    selectAll<MonthRow>("months", "month"),
    selectAll<AssetSnapshot>("asset_snapshots", "created_at"),
    selectAll<LiabilitySnapshot>("liability_snapshots", "created_at"),
    selectAll<MonthEntry>("month_entries", "created_at"),
    selectAll<Goal>("goals", "sort_order"),
    selectAll<GoalAllocation>("goal_allocations", "created_at"),
    selectAll<Scenario>("scenarios", "sort_order"),
    selectAll<FutureEvent>("future_events", "month"),
  ]);
  if (!households[0]) throw new Error("내보낼 가구 데이터가 없습니다.");
  return {
    app: "duoasset",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    household: households[0],
    members,
    assets,
    liabilities,
    planItems,
    months,
    assetSnapshots,
    liabilitySnapshots,
    monthEntries,
    goals,
    goalAllocations,
    scenarios,
    events,
  };
}
