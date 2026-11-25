/**
 * 테스트용 픽스처 생성기. 금액은 모두 가상의 값이다.
 * 프로덕션 코드에서 import 하지 않는다.
 */
import { buildPlanLines } from "./plan";
import type {
  Asset,
  AssetSnapshot,
  Goal,
  GoalAllocation,
  Liability,
  LiabilitySnapshot,
  Member,
  MonthEntry,
  MonthInput,
  PlanItem,
  Won,
  Ym,
} from "./types";

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;
const stamp = () => `2026-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`;

export const HOUSEHOLD = "household-1";

export function member(name: string, overrides: Partial<Member> = {}): Member {
  return { id: nextId("member"), household_id: HOUSEHOLD, user_id: null, name, email: null, sort_order: seq, ...overrides };
}

export function asset(overrides: Partial<Asset> & Pick<Asset, "kind">): Asset {
  return {
    id: nextId("asset"),
    household_id: HOUSEHOLD,
    name: overrides.kind,
    owner_member_id: null,
    liquidity: overrides.kind === "cash" ? "liquid" : "short",
    maturity_date: null,
    memo: "",
    is_active: true,
    sort_order: seq,
    version: 1,
    created_at: stamp(),
    updated_at: stamp(),
    ...overrides,
  };
}

export function liability(overrides: Partial<Liability> & Pick<Liability, "kind" | "original_principal">): Liability {
  return {
    id: nextId("liability"),
    household_id: HOUSEHOLD,
    name: overrides.kind,
    payer_member_id: null,
    annual_rate: 0,
    term_months: null,
    start_month: null,
    monthly_payment: null,
    payment_day: null,
    withdraw_asset_id: null,
    memo: "",
    is_active: true,
    sort_order: seq,
    version: 1,
    created_at: stamp(),
    updated_at: stamp(),
    ...overrides,
  };
}

export function planItem(overrides: Partial<PlanItem> & Pick<PlanItem, "kind" | "amount">): PlanItem {
  return {
    id: nextId("item"),
    household_id: HOUSEHOLD,
    member_id: null,
    name: overrides.kind,
    income_type: overrides.kind === "income" ? "salary" : null,
    pay_day: null,
    start_month: null,
    end_month: null,
    months_of_year: null,
    asset_id: null,
    memo: "",
    is_active: true,
    sort_order: seq,
    version: 1,
    created_at: stamp(),
    updated_at: stamp(),
    ...overrides,
  };
}

/** 자산 스냅샷. principal 을 생략하면 value 와 같다 (현금성 자산). */
export function assetSnap(
  a: Asset,
  value: Won,
  principal: Won = value,
  overrides: Partial<AssetSnapshot> = {},
): AssetSnapshot {
  return {
    id: nextId("asnap"),
    household_id: HOUSEHOLD,
    month_id: "month",
    asset_id: a.id,
    value,
    principal,
    opening_value: null,
    opening_principal: null,
    version: 1,
    updated_at: stamp(),
    ...overrides,
  };
}

export function liabilitySnap(
  l: Liability,
  balance: Won,
  overrides: Partial<LiabilitySnapshot> = {},
): LiabilitySnapshot {
  return {
    id: nextId("lsnap"),
    household_id: HOUSEHOLD,
    month_id: "month",
    liability_id: l.id,
    balance,
    interest_paid: null,
    opening_balance: null,
    version: 1,
    updated_at: stamp(),
    ...overrides,
  };
}

export function entry(overrides: Partial<MonthEntry> & Pick<MonthEntry, "kind" | "amount">): MonthEntry {
  return {
    id: nextId("entry"),
    household_id: HOUSEHOLD,
    month_id: "month",
    member_id: null,
    to_member_id: null,
    plan_item_id: null,
    name: overrides.kind,
    memo: "",
    version: 1,
    updated_at: stamp(),
    ...overrides,
  };
}

/** 계획 항목에 대한 실제 값 (수입·납입·지출) */
export function actual(item: PlanItem, amount: Won): MonthEntry {
  return entry({
    kind: item.kind as MonthEntry["kind"],
    amount,
    member_id: item.member_id,
    plan_item_id: item.id,
    name: item.name,
  });
}

export function goal(overrides: Partial<Goal> & Pick<Goal, "target_amount">): Goal {
  return {
    id: nextId("goal"),
    household_id: HOUSEHOLD,
    name: "목표",
    target_date: null,
    basis: "linked",
    manual_amount: null,
    monthly_contribution: null,
    memo: "",
    is_archived: false,
    sort_order: seq,
    version: 1,
    created_at: stamp(),
    updated_at: stamp(),
    ...overrides,
  };
}

export function allocation(g: Goal, a: Asset, amount: Won | null): GoalAllocation {
  return { id: nextId("alloc"), household_id: HOUSEHOLD, goal_id: g.id, asset_id: a.id, amount };
}

/** MonthInput 조립. 계획 줄은 planItems·liabilities 와 직전 달 부채 잔액에서 만든다. */
export function monthInput(args: {
  month?: Ym;
  isBaseline?: boolean;
  members: Member[];
  assets?: Asset[];
  liabilities?: Liability[];
  planItems?: PlanItem[];
  prevAssets?: AssetSnapshot[];
  prevLiabilities?: LiabilitySnapshot[];
  curAssets?: AssetSnapshot[];
  curLiabilities?: LiabilitySnapshot[];
  entries?: MonthEntry[];
}): MonthInput {
  const month = args.month ?? "2026-03";
  const liabilities = args.liabilities ?? [];
  const prevLiabilities = args.prevLiabilities ?? [];
  return {
    month,
    isBaseline: args.isBaseline ?? false,
    members: args.members,
    assets: args.assets ?? [],
    liabilities,
    planLines: buildPlanLines({
      month,
      planItems: args.planItems ?? [],
      liabilities,
      liabilityBalances: Object.fromEntries(prevLiabilities.map((s) => [s.liability_id, s.balance])),
    }),
    prevAssetSnapshots: args.prevAssets ?? [],
    prevLiabilitySnapshots: prevLiabilities,
    assetSnapshots: args.curAssets ?? [],
    liabilitySnapshots: args.curLiabilities ?? [],
    entries: args.entries ?? [],
  };
}
