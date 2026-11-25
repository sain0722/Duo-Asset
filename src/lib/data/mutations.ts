import type {
  Asset,
  AssetSnapshot,
  LiabilitySnapshot,
  MonthEntry,
  MonthReport,
  MonthRow,
  Won,
  Ym,
} from "@/lib/finance/types";
import { ConflictError, toAppError } from "./errors";
import type { TableName } from "./queries";
import type { BackupFile } from "./types";
import { getSupabase } from "./supabase";

/** DB 가 채우는 컬럼. 클라이언트는 보내지 않는다. */
type Managed = "id" | "household_id" | "version" | "created_at" | "updated_at";

/** 새 행에 넣을 값 */
export type NewRow<T> = Omit<T, Managed>;
/** 고칠 값 */
export type Patch<T> = Partial<Omit<T, Managed>>;

interface Versioned {
  id: string;
  version: number;
}

export async function insertRow<T>(table: TableName, values: Partial<NewRow<T>>): Promise<T> {
  const { data, error } = await getSupabase()
    .from(table)
    .insert(values as Record<string, unknown>)
    .select()
    .single();
  if (error) throw toAppError(error);
  return data as T;
}

/**
 * 낙관적 잠금으로 수정한다. 읽었던 version 을 함께 보내고,
 * 그 사이 다른 기기에서 수정했다면 ConflictError 를 던진다.
 */
export async function updateRow<T extends Versioned>(table: TableName, row: Versioned, patch: Patch<T>): Promise<T> {
  const { data, error } = await getSupabase()
    .from(table)
    .update({ ...patch, version: row.version })
    .eq("id", row.id)
    .select()
    .maybeSingle();
  if (error) throw toAppError(error);
  // 행이 없다 = 다른 기기에서 지웠거나, 마감돼 더는 고칠 수 없다
  if (!data) throw new ConflictError();
  return data as T;
}

export async function deleteRow(table: TableName, id: string): Promise<void> {
  const { error } = await getSupabase().from(table).delete().eq("id", id);
  if (error) throw toAppError(error);
}

// ───────────────────────── 월별 입력 ─────────────────────────

export interface AssetSnapshotValues {
  value: Won;
  principal: Won;
  opening_value?: Won | null;
  opening_principal?: Won | null;
}

/** 자산의 월말 값을 기록한다. 이미 있으면 수정, 없으면 새로 만든다. */
export async function saveAssetSnapshot(
  monthId: string,
  assetId: string,
  existing: AssetSnapshot | undefined,
  values: AssetSnapshotValues,
): Promise<AssetSnapshot> {
  if (existing) return updateRow<AssetSnapshot>("asset_snapshots", existing, values);
  return insertOnce<AssetSnapshot>("asset_snapshots", { month_id: monthId, asset_id: assetId, ...values });
}

export interface LiabilitySnapshotValues {
  balance: Won;
  interest_paid?: Won | null;
  opening_balance?: Won | null;
}

export async function saveLiabilitySnapshot(
  monthId: string,
  liabilityId: string,
  existing: LiabilitySnapshot | undefined,
  values: LiabilitySnapshotValues,
): Promise<LiabilitySnapshot> {
  if (existing) return updateRow<LiabilitySnapshot>("liability_snapshots", existing, values);
  return insertOnce<LiabilitySnapshot>("liability_snapshots", {
    month_id: monthId,
    liability_id: liabilityId,
    ...values,
  });
}

export type EntryValues = Pick<MonthEntry, "kind" | "member_id" | "name" | "amount"> &
  Partial<Pick<MonthEntry, "to_member_id" | "plan_item_id" | "memo">>;

/** 수입·지출·납입·이동의 실제 금액을 기록한다. */
export async function saveEntry(
  monthId: string,
  existing: MonthEntry | undefined,
  values: EntryValues,
): Promise<MonthEntry> {
  if (existing) {
    // kind 와 plan_item_id 는 바꿀 수 없다 (DB 컬럼 권한)
    const { member_id, to_member_id, name, amount, memo } = values;
    const patch = { member_id, to_member_id, name, amount, memo };
    return updateRow<MonthEntry>("month_entries", existing, dropUndefined(patch));
  }
  return insertOnce<MonthEntry>("month_entries", { month_id: monthId, ...values });
}

/** 확인을 취소한다 (다시 "미확인" 상태로) */
export async function clearSnapshotOrEntry(
  table: "asset_snapshots" | "liability_snapshots" | "month_entries",
  id: string,
): Promise<void> {
  return deleteRow(table, id);
}

/** 같은 키로 다른 기기가 먼저 만들었으면(unique 위반) 충돌로 알린다 */
async function insertOnce<T>(table: TableName, values: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().from(table).insert(values).select().single();
  if (error) {
    if (error.code === "23505") throw new ConflictError();
    throw toAppError(error);
  }
  return data as T;
}

function dropUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ───────────────────────── 자산 등록 ─────────────────────────

/**
 * 자산을 만들고 현재 열린 달에 첫 스냅샷을 기록한다.
 * existedBefore = true 면 "전부터 갖고 있던 자산"으로 보고 월초 값도 같이 적어
 * 이번 달 저축·소비 계산에 영향을 주지 않게 한다 (기초 조정).
 */
export async function createAssetWithSnapshot(args: {
  asset: Partial<NewRow<Asset>>;
  monthId: string;
  value: Won;
  principal: Won;
  existedBefore: boolean;
}): Promise<Asset> {
  const asset = await insertRow<Asset>("assets", args.asset);
  try {
    await insertOnce<AssetSnapshot>("asset_snapshots", {
      month_id: args.monthId,
      asset_id: asset.id,
      value: args.value,
      principal: args.principal,
      opening_value: args.existedBefore ? args.value : null,
      opening_principal: args.existedBefore ? args.principal : null,
    });
  } catch (error) {
    // 스냅샷 없이 자산만 남지 않도록 되돌린다
    await deleteRow("assets", asset.id).catch(() => undefined);
    throw error;
  }
  return asset;
}

// ───────────────────────── RPC ─────────────────────────

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(name, params);
  if (error) throw toAppError(error);
  return data as T;
}

/** 초대된 이메일로 로그인했다면 가구에 연결한다. 연결된 가구 id 또는 null */
export function claimMembership(): Promise<string | null> {
  return rpc<string | null>("claim_membership");
}

export function createHousehold(args: {
  householdName: string;
  myName: string;
  partnerName: string;
  partnerEmail: string | null;
  startMonth: Ym;
}): Promise<string> {
  return rpc<string>("create_household", {
    p_household_name: args.householdName,
    p_my_name: args.myName,
    p_partner_name: args.partnerName,
    p_partner_email: args.partnerEmail,
    p_start_month: args.startMonth,
  });
}

/** 월 마감: 화면에서 본 정산 결과(report)를 그대로 동결한다. */
export function closeMonth(month: MonthRow, report: MonthReport): Promise<MonthRow> {
  return rpc<MonthRow>("close_month", {
    p_month_id: month.id,
    p_summary: report,
    p_version: month.version,
  });
}

export function reopenMonth(month: MonthRow): Promise<MonthRow> {
  return rpc<MonthRow>("reopen_month", { p_month_id: month.id });
}

/**
 * 백업 파일로 현재 가구의 재무 데이터를 통째로 교체한다 (되돌릴 수 없다).
 * DB 함수가 한 트랜잭션으로 처리하므로 실패하면 기존 데이터는 그대로 남는다.
 */
export function restoreBackup(backup: BackupFile): Promise<void> {
  return rpc<void>("restore_backup", { p_backup: backup });
}
