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

/** 한 달의 입력 행 */
export interface MonthData {
  assetSnapshots: AssetSnapshot[];
  liabilitySnapshots: LiabilitySnapshot[];
  entries: MonthEntry[];
}

/**
 * 화면이 쓰는 가구 데이터 전체.
 * 설정 테이블은 전부, 월별 입력 행은 "열린 달들 + 마지막으로 마감한 달"만 담는다.
 * 그보다 오래된 달은 months[].summary 에 동결된 결과로 본다.
 */
export interface HouseholdData {
  household: Household;
  /** 로그인한 본인 */
  me: Member;
  /** sort_order 순 */
  members: Member[];
  assets: Asset[];
  liabilities: Liability[];
  planItems: PlanItem[];
  /** 월 오름차순 */
  months: MonthRow[];
  /** month id → 입력 행 */
  monthData: Record<string, MonthData>;
  goals: Goal[];
  goalAllocations: GoalAllocation[];
  scenarios: Scenario[];
  events: FutureEvent[];
}

export const EMPTY_MONTH_DATA: MonthData = { assetSnapshots: [], liabilitySnapshots: [], entries: [] };

/** 백업 파일 형식 (설정 → 내보내기) */
export interface BackupFile {
  app: "duoasset";
  formatVersion: 1;
  exportedAt: string;
  household: Household;
  members: Member[];
  assets: Asset[];
  liabilities: Liability[];
  planItems: PlanItem[];
  months: MonthRow[];
  assetSnapshots: AssetSnapshot[];
  liabilitySnapshots: LiabilitySnapshot[];
  monthEntries: MonthEntry[];
  goals: Goal[];
  goalAllocations: GoalAllocation[];
  scenarios: Scenario[];
  events: FutureEvent[];
}
