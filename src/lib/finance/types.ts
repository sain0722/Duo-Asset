/**
 * DuoAsset 도메인 타입.
 *
 * - DB 행 타입은 PostgREST 가 돌려주는 snake_case 컬럼 그대로 쓴다 (매핑 계층 없음).
 *   supabase/migrations 의 스키마와 항상 일치해야 한다.
 * - 계산 결과 타입(camelCase)은 lib/finance 의 순수 함수가 만들어 낸다.
 * - 모든 금액은 KRW 원 단위 정수다. 계산 규칙은 docs/finance-rules.md 참고.
 */

/** KRW 원 단위 정수 */
export type Won = number;
/** 'YYYY-MM' (Asia/Seoul 기준) */
export type Ym = string;

// ───────────────────────── DB 행 ─────────────────────────

export type AssetKind =
  | "cash"
  | "deposit"
  | "savings"
  | "investment"
  | "pension"
  | "real_estate"
  | "lease_deposit"
  | "presale"
  | "vehicle"
  | "other";

/** liquid: 즉시 사용 가능 / short: 해지·매도하면 현금화 가능 / locked: 장기·비유동 */
export type Liquidity = "liquid" | "short" | "locked";

export type LiabilityKind =
  | "installment"
  | "amortized"
  | "equal_principal"
  | "bullet"
  | "interest_only";

export type PlanItemKind = "income" | "benefit" | "expense" | "saving" | "contribution";
export type IncomeType = "salary" | "bonus" | "other";
export type EntryKind = "income" | "expense" | "contribution" | "transfer";

export interface Household {
  id: string;
  name: string;
  created_at: string;
}

export interface Member {
  id: string;
  household_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  sort_order: number;
}

export interface Asset {
  id: string;
  household_id: string;
  name: string;
  kind: AssetKind;
  /** null = 공동 자산 */
  owner_member_id: string | null;
  liquidity: Liquidity;
  maturity_date: string | null;
  memo: string;
  is_active: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Liability {
  id: string;
  household_id: string;
  name: string;
  kind: LiabilityKind;
  /** null = 공용통장에서 납부 */
  payer_member_id: string | null;
  original_principal: Won;
  /** 연 이율 % (예: 4.25). PostgREST 는 numeric 을 number 로 준다. */
  annual_rate: number;
  term_months: number | null;
  start_month: Ym | null;
  monthly_payment: Won | null;
  payment_day: number | null;
  withdraw_asset_id: string | null;
  memo: string;
  is_active: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PlanItem {
  id: string;
  household_id: string;
  kind: PlanItemKind;
  /** null = 공동(공용통장) 항목 */
  member_id: string | null;
  name: string;
  amount: Won;
  income_type: IncomeType | null;
  pay_day: number | null;
  start_month: Ym | null;
  end_month: Ym | null;
  /** null = 매월, [1, 7] = 1월과 7월에만 */
  months_of_year: number[] | null;
  asset_id: string | null;
  memo: string;
  is_active: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MonthRow {
  id: string;
  household_id: string;
  month: Ym;
  status: "open" | "closed";
  summary: MonthReport | null;
  note: string;
  closed_at: string | null;
  closed_by: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AssetSnapshot {
  id: string;
  household_id: string;
  month_id: string;
  asset_id: string;
  value: Won;
  principal: Won;
  opening_value: Won | null;
  opening_principal: Won | null;
  version: number;
  updated_at: string;
}

export interface LiabilitySnapshot {
  id: string;
  household_id: string;
  month_id: string;
  liability_id: string;
  balance: Won;
  interest_paid: Won | null;
  opening_balance: Won | null;
  version: number;
  updated_at: string;
}

export interface MonthEntry {
  id: string;
  household_id: string;
  month_id: string;
  kind: EntryKind;
  member_id: string | null;
  to_member_id: string | null;
  plan_item_id: string | null;
  name: string;
  amount: Won;
  memo: string;
  version: number;
  updated_at: string;
}

export type GoalBasis = "linked" | "manual" | "net_worth" | "liquid_assets" | "financial_assets";

export interface Goal {
  id: string;
  household_id: string;
  name: string;
  target_amount: Won;
  target_date: string | null;
  basis: GoalBasis;
  manual_amount: Won | null;
  monthly_contribution: Won | null;
  memo: string;
  is_archived: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GoalAllocation {
  id: string;
  household_id: string;
  goal_id: string;
  asset_id: string;
  /** null = 남은 금액 전부 */
  amount: Won | null;
}

export interface Scenario {
  id: string;
  household_id: string;
  name: string;
  is_base: boolean;
  assumptions: Partial<Assumptions>;
  excluded_event_ids: string[];
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export type FutureEventKind =
  | "income_change"
  | "expense_change"
  | "one_time"
  | "loan"
  | "home_move_in"
  | "parental_leave";

export interface FutureEvent {
  id: string;
  household_id: string;
  /** null = 모든 시나리오 공통 */
  scenario_id: string | null;
  name: string;
  kind: FutureEventKind;
  month: Ym;
  params: FutureEventParams;
  memo: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// ───────────────────────── 주머니 ─────────────────────────

/**
 * 주머니(pocket): 돈이 머무는 단위. 구성원 개인(member id) 또는 공동("joint").
 * DB 에서는 공동을 null 로 표현하므로 pocketOf() 로 변환한다.
 */
export type PocketId = string;
export const JOINT: PocketId = "joint";

// ───────────────────────── 계획 ─────────────────────────

export type PlanLineKind = PlanItemKind | "debt";

/** 특정 월에 적용되는 계획 한 줄. 마감 시 MonthReport.planLines 로 동결된다. */
export interface PlanLine {
  /** 계획 항목 id 또는 `liability:<id>` */
  key: string;
  kind: PlanLineKind;
  pocket: PocketId;
  name: string;
  /** debt 는 원금+이자 총 납부액 */
  amount: Won;
  /** debt 전용 */
  principal?: Won;
  interest?: Won;
  planItemId?: string;
  liabilityId?: string;
  assetId?: string | null;
  incomeType?: IncomeType | null;
  payDay?: number | null;
}

export interface MemberPlan {
  memberId: string;
  /** 현금 수입 합계 (비현금 복지 제외) */
  income: Won;
  /** 비현금 복지 합계 (정보용) */
  benefits: Won;
  fixedExpenses: Won;
  debtPrincipal: Won;
  debtInterest: Won;
  contribution: Won;
  savings: Won;
  /** 개인 사용 가능 금액 = 수입 − 고정지출 − 부채상환 − 공용통장 납입 − 저축. 음수 가능(초과 배분). */
  allowance: Won;
  lines: PlanLine[];
}

export interface JointPlan {
  /** 구성원 납입 합계 */
  contributions: Won;
  /** 공동 명의 수입 */
  income: Won;
  expenses: Won;
  debtPrincipal: Won;
  debtInterest: Won;
  /** 공용통장에서 다른 공동 자산으로 옮기기로 한 금액 (공동저축의 일부) */
  designatedSavings: Won;
  /** 공동저축 = 유입 − 공동지출 − 공동 부채상환 */
  surplus: Won;
  lines: PlanLine[];
}

export interface PlanTotals {
  income: Won;
  benefits: Won;
  /** 계획 소비 = 고정지출 + 이자 + 개인 사용 가능 금액(양수분) + 공동지출 */
  consumption: Won;
  principalRepayment: Won;
  /** 계획 저축 = 수입 − 소비 − 원금상환 */
  savings: Won;
}

export interface MonthPlan {
  month: Ym;
  members: MemberPlan[];
  joint: JointPlan;
  totals: PlanTotals;
  lines: PlanLine[];
}

// ───────────────────────── 부채 일정 ─────────────────────────

export interface DebtPayment {
  principal: Won;
  interest: Won;
  /** principal + interest */
  payment: Won;
}

export interface ScheduleRow extends DebtPayment {
  month: Ym;
  /** 납부 후 남은 원금 */
  balance: Won;
}

// ───────────────────────── 월 정산 ─────────────────────────

export interface MonthInput {
  month: Ym;
  /** 이전 달 기록이 없는 기준 월. 잔액만 집계하고 수입·지출 분석은 하지 않는다. */
  isBaseline: boolean;
  members: Member[];
  assets: Asset[];
  liabilities: Liability[];
  planLines: PlanLine[];
  /** 직전 달 말의 확정 상태 (직전 달 정산 결과에서 가져온다). 기준 월이면 빈 배열 */
  prevAssetSnapshots: Pick<AssetSnapshot, "asset_id" | "value" | "principal">[];
  prevLiabilitySnapshots: Pick<LiabilitySnapshot, "liability_id" | "balance">[];
  assetSnapshots: AssetSnapshot[];
  liabilitySnapshots: LiabilitySnapshot[];
  entries: MonthEntry[];
}

export interface AssetLine {
  assetId: string;
  name: string;
  kind: AssetKind;
  pocket: PocketId;
  liquidity: Liquidity;
  openValue: Won;
  openPrincipal: Won;
  value: Won;
  principal: Won;
  /** 이번 달 순투입액 = principal − openPrincipal */
  contributed: Won;
  /** 평가손익 = (value − openValue) − contributed */
  gain: Won;
  /** 기초 조정으로 들어온 금액 (기존 보유분 신규 등록). 수입·저축과 무관. */
  adjustment: Won;
  /** 스냅샷 행이 있는가. false 면 전월 값을 그대로 가정한 것. */
  confirmed: boolean;
}

export interface LiabilityLine {
  liabilityId: string;
  name: string;
  kind: LiabilityKind;
  pocket: PocketId;
  openBalance: Won;
  balance: Won;
  /** 순상환액 = openBalance − balance (음수면 신규 차입) */
  principalPaid: Won;
  plannedPrincipal: Won;
  plannedInterest: Won;
  /** 실제 이자·비원금 지급액. null = 미확인 */
  interestPaid: Won | null;
  adjustment: Won;
  confirmed: boolean;
}

export interface AmountLine {
  /** plan line key 또는 entry id */
  key: string;
  name: string;
  pocket: PocketId;
  /** null = 계획에 없던 추가 항목 */
  planned: Won | null;
  /** null = 미확인 */
  actual: Won | null;
  entryId?: string;
}

export interface TransferLine {
  entryId: string;
  name: string;
  from: PocketId;
  to: PocketId;
  amount: Won;
}

export interface PocketReport {
  pocket: PocketId;
  name: string;
  income: Won;
  /** 이 주머니로 들어온 / 나간 주머니 간 이동 (공용통장 납입 포함) */
  transfersIn: Won;
  transfersOut: Won;
  /** 이 주머니 자산의 순투입액 합 */
  assetContribution: Won;
  /** 이 주머니가 갚은 원금 (순상환, 음수면 신규 차입) */
  principalPaid: Won;
  /** 소비지출 = 수입 + 들어온 이동 − 나간 이동 − 자산 순투입 − 원금 순상환 */
  consumption: Won;
  /** 확인된 지출 (지출 항목 + 확인된 이자) */
  classified: Won;
  /** 미분류 지출 = consumption − classified */
  unclassified: Won;
  /** 계획 소비 (개인: 고정지출 + 이자 + 사용 가능 금액, 공동: 공동지출 + 이자) */
  plannedConsumption: Won;
  expenseLines: AmountLine[];
}

export type ReportWarningCode =
  | "unconfirmed_asset"
  | "unconfirmed_liability"
  | "unconfirmed_income"
  | "unconfirmed_contribution"
  | "negative_consumption"
  | "negative_pocket_consumption";

export interface ReportWarning {
  code: ReportWarningCode;
  message: string;
  pocket?: PocketId;
}

export interface BalanceTotals {
  assets: Won;
  liabilities: Won;
  netWorth: Won;
  /** 가용자산: liquidity = 'liquid' */
  liquid: Won;
  /** 금융자산: cash, deposit, savings, investment, pension */
  financial: Won;
  byKind: Partial<Record<AssetKind, Won>>;
}

/** 월 정산 결과. 마감 시 months.summary 에 그대로 저장된다. */
export interface MonthReport {
  version: 1;
  month: Ym;
  isBaseline: boolean;
  /** 미확인 항목이 하나도 없다 */
  complete: boolean;
  warnings: ReportWarning[];

  opening: BalanceTotals;
  closing: BalanceTotals;
  netWorthChange: Won;

  /** 아래 흐름 지표는 isBaseline 이면 모두 0 */
  income: Won;
  consumption: Won;
  /** 저축액 = 수입 − 소비 − 원금상환 = 자산 순투입 합 − 신규차입 */
  savings: Won;
  /** 저축률 % (소수 1자리). 수입이 0 이면 null */
  savingsRate: number | null;
  principalRepaid: Won;
  newBorrowing: Won;
  /** 투자 평가손익 (investment, pension) */
  investmentGain: Won;
  /** 그 외 자산의 평가 변동 (부동산·자동차 등) */
  otherValuation: Won;
  /** 기초 조정 합 (자산 − 부채) */
  adjustment: Won;

  plan: PlanTotals;
  planLines: PlanLine[];

  incomeLines: AmountLine[];
  contributionLines: AmountLine[];
  transferLines: TransferLine[];
  assetLines: AssetLine[];
  liabilityLines: LiabilityLine[];
  pockets: PocketReport[];
}

// ───────────────────────── 목표 ─────────────────────────

export interface GoalProgress {
  goalId: string;
  current: Won;
  target: Won;
  /** 0–100 (%), 소수 1자리 */
  percent: number;
  remaining: Won;
  /** 목표일까지 필요한 월 적립액. 목표일이 없거나 지났으면 null */
  requiredMonthly: Won | null;
  /** 예상 달성 월. 계산할 수 없으면 null */
  expectedMonth: Ym | null;
  achieved: boolean;
  /** linked 목표: 자산별 실제 배정액 */
  allocations: { assetId: string; requested: Won | null; allocated: Won }[];
  /** 요청 배정액이 자산 평가금액을 넘어 줄어든 금액 */
  shortfall: Won;
}

// ───────────────────────── 시뮬레이션 ─────────────────────────

export interface Assumptions {
  /** 기간(년) */
  horizonYears: number;
  /** 연봉 인상률 %/년 (salary 수입에 적용) */
  salaryGrowthPct: number;
  /** 생활비 증가율 %/년 */
  expenseGrowthPct: number;
  /** 투자 수익률 %/년 (investment, pension) */
  investReturnPct: number;
  /** 현금성 자산 이자율 %/년 */
  cashReturnPct: number;
  /** 부동산 가격 상승률 %/년 */
  realEstateGrowthPct: number;
  /** 기본 계획 대비 월 저축 조정액 (+면 덜 쓰고 더 저축) */
  monthlySavingsAdjust: Won;
  /** 매월 투자자산으로 옮기는 금액. null = 계획의 투자·연금 저축 항목 합계를 사용 */
  monthlyInvestment: Won | null;
}

export type RepaymentMethod = Exclude<LiabilityKind, "interest_only">;

export type FutureEventParams =
  | IncomeChangeParams
  | ExpenseChangeParams
  | OneTimeParams
  | LoanParams
  | HomeMoveInParams
  | ParentalLeaveParams;

/** 소득 변화: 이직·연봉 인상·퇴직 등 */
export interface IncomeChangeParams {
  /** null = 공동 수입 */
  memberId: string | null;
  /** 월 수입 증감 (음수 가능) */
  monthlyDelta: Won;
  /** 이 달까지만 적용 (포함). null = 계속 */
  endMonth: Ym | null;
}

/** 지출 변화: 육아비, 관리비 등 */
export interface ExpenseChangeParams {
  monthlyDelta: Won;
  endMonth: Ym | null;
}

/** 일회성 지출/수입 */
export interface OneTimeParams {
  /** 양수 = 수입, 음수 = 지출 */
  amount: Won;
  /** true 면 소비가 아니라 자산 취득으로 처리 (예: 차량 구매) */
  asAsset: boolean;
}

/** 대출 발생 */
export interface LoanParams {
  principal: Won;
  annualRate: number;
  termMonths: number;
  method: RepaymentMethod;
  /** true 면 대출금이 현금이 아니라 곧바로 자산 취득에 쓰인다 */
  toAsset: boolean;
}

/** 주택 입주: 잔금 납부 + 대출 + 보증금 반환 + 주거비 변화 */
export interface HomeMoveInParams {
  /** 입주 시 내야 하는 잔금 총액 */
  balanceDue: Won;
  loanAmount: Won;
  loanRate: number;
  loanTermMonths: number;
  loanMethod: RepaymentMethod;
  /** 돌려받는 임대보증금 */
  depositReturn: Won;
  /** 입주 후 월 주거비 증감 */
  monthlyExpenseDelta: Won;
}

/** 출산·육아휴직 */
export interface ParentalLeaveParams {
  memberId: string;
  leaveMonths: number;
  /** 휴직 기간 중 월 수령액 (그 기간 동안 해당 구성원의 현금 수입을 대체) */
  monthlyIncomeDuringLeave: Won;
  /** 출산 이후 계속 늘어나는 월 지출 */
  monthlyChildCost: Won;
  /** 출산 관련 일회성 비용 */
  oneTimeCost: Won;
}

export interface SimulationInput {
  /** 시뮬레이션 첫 달 (보통 마지막 기록 월의 다음 달) */
  startMonth: Ym;
  members: Member[];
  assets: Asset[];
  liabilities: Liability[];
  planItems: PlanItem[];
  /** 시작 시점 자산·부채 (자산 id → 평가금액, 부채 id → 남은 원금) */
  assetValues: Record<string, Won>;
  liabilityBalances: Record<string, Won>;
  assumptions: Assumptions;
  /** 이 시나리오에 적용할 이벤트 (제외·전용 필터를 이미 거친 것) */
  events: FutureEvent[];
}

export interface SimulationPoint {
  month: Ym;
  /** 현금성 자산 (cash, deposit, savings) */
  cash: Won;
  /** 투자자산 (investment, pension) */
  invested: Won;
  /** 비금융 자산 (부동산, 보증금, 분양 납부금, 자동차, 기타) */
  fixed: Won;
  assets: Won;
  liabilities: Won;
  netWorth: Won;
  income: Won;
  consumption: Won;
  /** 그 달 저축액 = 수입 − 소비 − 원금상환 */
  savings: Won;
  debtPayment: Won;
}

export interface SimulationMilestone {
  month: Ym;
  kind: "event" | "debt_paid_off" | "cash_shortfall";
  label: string;
  /** debt_paid_off: 종료로 늘어나는 월 여유 자금 / cash_shortfall: 부족액 */
  amount?: Won;
}

export interface SimulationResult {
  points: SimulationPoint[];
  milestones: SimulationMilestone[];
  /** 현금성 자산이 음수가 되는 첫 달. 없으면 null */
  firstShortfallMonth: Ym | null;
}
