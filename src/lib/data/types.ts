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
 * 설정 테이블은 전부, 월별 입력 행은 열린 달만 담는다.
 * 마감된 달은 months[].summary 에 동결된 결과로 본다.
 *
 * 이 객체는 불변으로 다룬다: 값이 바뀌면 재조회로 새 객체를 받는다.
 * (derive 의 계산 캐시가 객체 단위로 붙는다. 제자리에서 고치면 오래된 결과가 나온다.)
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
  /** month id → 입력 행 (열린 달만) */
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
