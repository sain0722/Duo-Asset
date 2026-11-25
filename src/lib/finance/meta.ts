import type {
  AssetKind,
  FutureEventKind,
  GoalBasis,
  IncomeType,
  LiabilityKind,
  Liquidity,
  PlanItemKind,
  PocketId,
} from "./types";
import { JOINT } from "./types";

/** DB 의 null(공동)을 주머니 id 로 */
export function pocketOf(memberId: string | null | undefined): PocketId {
  return memberId ?? JOINT;
}

/** 주머니 id 를 DB 의 member id (공동은 null) 로 */
export function memberIdOf(pocket: PocketId): string | null {
  return pocket === JOINT ? null : pocket;
}

export interface AssetKindMeta {
  label: string;
  /**
   * balance: 잔액 하나만 입력한다 (순투입액 = 평가금액).
   * valuation: 평가금액과 순투입액을 따로 관리한다.
   */
  tracking: "balance" | "valuation";
  defaultLiquidity: Liquidity;
  /** 금융자산 합계에 포함되는가 */
  financial: boolean;
  /** 시뮬레이션에서의 분류 */
  bucket: "cash" | "invested" | "fixed";
  /** 평가손익을 "투자 평가손익"으로 볼지 ("기타 평가 변동"이 아니라) */
  investment: boolean;
}

export const ASSET_KINDS: Record<AssetKind, AssetKindMeta> = {
  cash: { label: "현금·입출금", tracking: "balance", defaultLiquidity: "liquid", financial: true, bucket: "cash", investment: false },
  deposit: { label: "예금", tracking: "balance", defaultLiquidity: "short", financial: true, bucket: "cash", investment: false },
  savings: { label: "적금", tracking: "balance", defaultLiquidity: "short", financial: true, bucket: "cash", investment: false },
  investment: { label: "주식·투자", tracking: "valuation", defaultLiquidity: "short", financial: true, bucket: "invested", investment: true },
  pension: { label: "퇴직연금·연금", tracking: "valuation", defaultLiquidity: "locked", financial: true, bucket: "invested", investment: true },
  real_estate: { label: "부동산", tracking: "valuation", defaultLiquidity: "locked", financial: false, bucket: "fixed", investment: false },
  lease_deposit: { label: "임대보증금", tracking: "balance", defaultLiquidity: "locked", financial: false, bucket: "fixed", investment: false },
  presale: { label: "분양 납부금", tracking: "balance", defaultLiquidity: "locked", financial: false, bucket: "fixed", investment: false },
  vehicle: { label: "자동차", tracking: "valuation", defaultLiquidity: "locked", financial: false, bucket: "fixed", investment: false },
  other: { label: "기타 자산", tracking: "valuation", defaultLiquidity: "locked", financial: false, bucket: "fixed", investment: false },
};

export const ASSET_KIND_ORDER: AssetKind[] = [
  "cash",
  "deposit",
  "savings",
  "investment",
  "pension",
  "real_estate",
  "lease_deposit",
  "presale",
  "vehicle",
  "other",
];

export const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  liquid: "즉시 사용 가능",
  short: "현금화 가능",
  locked: "장기·비유동",
};

export interface LiabilityKindMeta {
  label: string;
  description: string;
  /** 입력이 필요한 필드 */
  needsRate: boolean;
  needsTerm: boolean;
  /** 첫 납부 월이 있어야 회차·만기를 계산할 수 있다 */
  needsStart: boolean;
  needsMonthlyPayment: boolean;
}

export const LIABILITY_KINDS: Record<LiabilityKind, LiabilityKindMeta> = {
  installment: {
    label: "무이자 할부",
    description: "매월 같은 금액의 원금을 갚습니다. 이자는 없습니다.",
    needsRate: false,
    needsTerm: true,
    needsStart: false,
    needsMonthlyPayment: true,
  },
  amortized: {
    label: "원리금균등",
    description: "매월 같은 금액(원금+이자)을 냅니다.",
    needsRate: true,
    needsTerm: true,
    needsStart: true,
    needsMonthlyPayment: false,
  },
  equal_principal: {
    label: "원금균등",
    description: "매월 같은 원금에 남은 원금의 이자를 더해 냅니다.",
    needsRate: true,
    needsTerm: true,
    needsStart: true,
    needsMonthlyPayment: false,
  },
  bullet: {
    label: "만기일시상환",
    description: "매월 이자만 내고 만기에 원금을 한 번에 갚습니다.",
    needsRate: true,
    needsTerm: true,
    needsStart: true,
    needsMonthlyPayment: false,
  },
  interest_only: {
    label: "원금 유지 차용금",
    description: "원금 상환 계획 없이 매월 정해진 금액(이자·용돈 등)만 지급합니다.",
    needsRate: false,
    needsTerm: false,
    needsStart: false,
    needsMonthlyPayment: true,
  },
};

export const LIABILITY_KIND_ORDER: LiabilityKind[] = [
  "installment",
  "amortized",
  "equal_principal",
  "bullet",
  "interest_only",
];

export const PLAN_KIND_LABELS: Record<PlanItemKind | "debt", string> = {
  income: "수입",
  benefit: "비현금 복지",
  expense: "고정지출",
  saving: "저축",
  contribution: "공용통장 납입",
  debt: "부채 상환",
};

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  salary: "급여",
  bonus: "상여금",
  other: "기타 수입",
};

export const GOAL_BASIS_LABELS: Record<GoalBasis, string> = {
  linked: "연결한 자산",
  manual: "직접 입력",
  net_worth: "순자산",
  liquid_assets: "가용자산",
  financial_assets: "금융자산",
};

export const EVENT_KIND_LABELS: Record<FutureEventKind, string> = {
  income_change: "소득 변화",
  expense_change: "지출 변화",
  one_time: "일회성 지출·수입",
  loan: "대출 발생",
  home_move_in: "주택 입주",
  parental_leave: "출산·육아휴직",
};
