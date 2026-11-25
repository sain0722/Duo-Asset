import type {
  Asset,
  AssetSnapshot,
  Household,
  LiabilitySnapshot,
  Member,
  MonthEntry,
  MonthReport,
  MonthRow,
  Won,
  Ym,
} from "@/lib/finance/types";
import { compareYm, currentYm } from "@/lib/month";
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
  if (error) throw insertError(error);
  return data as T;
}

/** 넣으려는 행이 가리키는 대상(자산·계획 항목 등)을 다른 기기에서 방금 지운 경우를 구분해 알린다 */
function insertError(error: { code?: string; message?: string }): Error {
  if (error.code === "23503") return new Error("연결된 항목이 이미 삭제되었습니다. 새로고침 후 다시 시도해 주세요.");
  return toAppError(error);
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
  const { data, error } = await getSupabase().from(table).delete().eq("id", id).select("id");
  if (error) throw toAppError(error);
  // 지워진 행이 없다 = 이미 지워졌거나, 마감된 달이라 RLS 가 막았다. 성공으로 넘기지 않는다.
  if (!data?.length) throw new ConflictError();
}

// ───────────────────────── 가구 · 구성원 ─────────────────────────
// 이 두 테이블에는 version 이 없다 (이름·초대 이메일만 고친다).
// 잠금 대신 "읽었던 값이 그대로일 때만" 고친다: 다른 기기에서 먼저 바꿨다면 고쳐진 행이 없어 ConflictError.

export async function renameHousehold(household: Household, name: string): Promise<Household> {
  const { data, error } = await getSupabase()
    .from("households")
    .update({ name: name.trim() })
    .eq("id", household.id)
    .eq("name", household.name)
    .select()
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!data) throw new ConflictError();
  return data as Household;
}

/**
 * 구성원 이름·초대 이메일을 고친다. 이메일은 앞뒤 공백을 떼고 소문자로 저장하며, 비우면 초대를 취소한다(null).
 * email 을 넘기지 않으면 이름만 바꾼다 (이미 연결된 구성원).
 */
export async function updateMember(member: Member, patch: { name: string; email?: string | null }): Promise<Member> {
  const values =
    patch.email === undefined
      ? { name: patch.name.trim() }
      : { name: patch.name.trim(), email: patch.email?.trim().toLowerCase() || null };
  let query = getSupabase().from("members").update(values).eq("id", member.id).eq("name", member.name);
  query = member.email === null ? query.is("email", null) : query.eq("email", member.email);
  const { data, error } = await query.select().maybeSingle();
  if (error) {
    if (error.code === "23505") throw new Error("이미 다른 구성원이 쓰고 있는 이메일입니다.");
    throw toAppError(error);
  }
  if (!data) throw new ConflictError();
  return data as Member;
}

// ───────────────────────── 월별 입력 ─────────────────────────

export interface AssetSnapshotValues {
  value: Won;
  principal: Won;
  opening_value?: Won | null;
  opening_principal?: Won | null;
  /** 평가 기준일 'YYYY-MM-DD' (월말 값이 아닐 때만) */
  valued_on?: string | null;
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
    throw insertError(error);
  }
  return data as T;
}

function dropUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * 여러 항목을 한 번에 확인한다 ("예정대로 한 번에 확인", "나머지 모두 변동 없음").
 * 테이블마다 한 번씩만 요청하므로 재조회도 한 번이면 된다. 아직 행이 없는 항목만 넣는다.
 */
export async function saveMonthInputs(
  monthId: string,
  inputs: {
    assetSnapshots?: (AssetSnapshotValues & { asset_id: string })[];
    liabilitySnapshots?: (LiabilitySnapshotValues & { liability_id: string })[];
    entries?: EntryValues[];
  },
): Promise<void> {
  const batches: [TableName, Record<string, unknown>[]][] = [
    ["asset_snapshots", (inputs.assetSnapshots ?? []).map((row) => ({ month_id: monthId, ...row }))],
    ["liability_snapshots", (inputs.liabilitySnapshots ?? []).map((row) => ({ month_id: monthId, ...row }))],
    ["month_entries", (inputs.entries ?? []).map((row) => ({ month_id: monthId, ...row }))],
  ];
  for (const [table, rows] of batches) {
    if (rows.length === 0) continue;
    const { error } = await getSupabase().from(table).insert(rows);
    if (error) {
      // 그 사이 배우자가 같은 항목을 먼저 확인했다
      if (error.code === "23505") throw new ConflictError();
      throw insertError(error);
    }
  }
}

// ───────────────────────── 자산 등록 ─────────────────────────

/**
 * 자산을 만들고 현재 열린 달에 첫 스냅샷을 기록한다.
 * existedBefore = true 면 "전부터 갖고 있던 자산"으로 보고 월초 값도 같이 적어
 * 이번 달 저축·소비 계산에 영향을 주지 않게 한다 (기초 조정).
 * 그 자산에 이번 달에 넣은 돈이 있다면 contributedThisMonth 로 알려 준다:
 * 월초 값 = 월말 값 − 이번 달에 넣은 돈 이 되어, 그 금액만 이번 달 저축으로 잡힌다.
 */
export async function createAssetWithSnapshot(args: {
  asset: Partial<NewRow<Asset>>;
  monthId: string;
  value: Won;
  principal: Won;
  existedBefore: boolean;
  contributedThisMonth?: Won;
}): Promise<Asset> {
  const contributed = args.contributedThisMonth ?? 0;
  const asset = await insertRow<Asset>("assets", args.asset);
  try {
    await insertOnce<AssetSnapshot>("asset_snapshots", {
      month_id: args.monthId,
      asset_id: asset.id,
      value: args.value,
      principal: args.principal,
      opening_value: args.existedBefore ? args.value - contributed : null,
      opening_principal: args.existedBefore ? args.principal - contributed : null,
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
export async function closeMonth(month: MonthRow, report: MonthReport): Promise<MonthRow> {
  // 미확인 항목의 잠정값(계획 금액·전월 잔액)이 확정 결과로 동결되지 않게 한다
  if (!report.complete || report.month !== month.month) {
    throw new Error("미확인 항목이 남아 있어 마감할 수 없습니다.");
  }
  // 스냅샷은 월말 잔액이다. 달이 끝나기 전에 마감하면 그 뒤에 들어온 급여가 다음 달 계산에 섞인다.
  if (compareYm(month.month, currentYm()) >= 0) {
    throw new Error("아직 끝나지 않은 달은 마감할 수 없습니다. 다음 달 1일부터 마감할 수 있습니다.");
  }
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
