/**
 * 가구 데이터(HouseholdData)에서 화면이 쓰는 값을 조립한다.
 * 계산 자체는 lib/finance 의 순수 함수가 하고, 여기서는 "어떤 입력을 넣을지"만 정한다.
 * 이 파일도 순수 함수만 둔다 (React·Supabase import 금지).
 */
import {
  allocatedLiquid,
  buildPlanLines,
  computeGoalProgress,
  computeMonthReport,
  eventsForScenario,
  resolveAssumptions,
  scheduledPayment,
  simulate,
  summarizePlan,
} from "@/lib/finance";
import type {
  BalanceTotals,
  GoalProgress,
  MonthInput,
  MonthPlan,
  MonthReport,
  MonthRow,
  PlanLine,
  PocketId,
  Scenario,
  SimulationInput,
  SimulationResult,
  Won,
  Ym,
} from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";
import { addMonths, compareYm, currentYm, ymRange } from "@/lib/month";
import { EMPTY_MONTH_DATA, type HouseholdData } from "./types";

// ───────────────────────── 월 탐색 ─────────────────────────

/** 정산할 차례인 달: 가장 이른 열린 달 */
export function workingMonth(data: HouseholdData): MonthRow | null {
  return data.months.find((month) => month.status === "open") ?? null;
}

/** 가장 최근 달 (열려 있다) */
export function latestMonth(data: HouseholdData): MonthRow | null {
  return data.months.at(-1) ?? null;
}

/** 가장 최근에 마감한 달 */
export function lastClosedMonth(data: HouseholdData): MonthRow | null {
  return data.months.findLast((month) => month.status === "closed") ?? null;
}

export function previousMonth(data: HouseholdData, month: MonthRow): MonthRow | null {
  const index = data.months.findIndex((m) => m.id === month.id);
  return index > 0 ? data.months[index - 1] : null;
}

export function findMonth(data: HouseholdData, ym: Ym): MonthRow | null {
  return data.months.find((month) => month.month === ym) ?? null;
}

/** 다시 열 수 있는 달인가: 가장 최근에 마감한 달만 */
export function canReopen(data: HouseholdData, month: MonthRow): boolean {
  return month.status === "closed" && lastClosedMonth(data)?.id === month.id;
}

/** 마감할 수 있는 달인가: 가장 이른 열린 달만 (미확인 항목 여부는 report.complete 로 따로 본다) */
export function canClose(data: HouseholdData, month: MonthRow): boolean {
  return month.status === "open" && workingMonth(data)?.id === month.id;
}

// ───────────────────────── 월 정산 ─────────────────────────

const reportCache = new WeakMap<HouseholdData, Map<string, MonthReport>>();

/**
 * 그 달의 정산 결과.
 * 마감된 달은 동결된 summary 를 그대로 돌려주고, 열린 달은 현재 입력으로 계산한다.
 */
export function reportFor(data: HouseholdData, month: MonthRow): MonthReport {
  if (month.status === "closed" && month.summary) return month.summary;

  let cache = reportCache.get(data);
  if (!cache) {
    cache = new Map();
    reportCache.set(data, cache);
  }
  const cached = cache.get(month.id);
  if (cached) return cached;

  const report = computeMonthReport(monthInputFor(data, month));
  cache.set(month.id, report);
  return report;
}

/** 그 달의 계획 줄. 한 번 마감했던 달은 그때 동결한 계획을 그대로 쓴다. */
export function planLinesFor(data: HouseholdData, month: MonthRow): PlanLine[] {
  if (month.summary) {
    if (month.status === "closed") return month.summary.planLines;
    // 다시 연 달: 그 뒤 삭제된 계획 항목의 줄은 뺀다.
    // (실제 값이 연결된 항목은 삭제할 수 없으므로, 삭제됐다면 확인할 값도 없다)
    const alive = new Set(data.planItems.map((item) => item.id));
    return month.summary.planLines.filter((line) => !line.planItemId || alive.has(line.planItemId));
  }
  return buildPlanLines({
    month: month.month,
    planItems: data.planItems,
    liabilities: data.liabilities,
    liabilityBalances: openingLiabilityBalances(data, month),
  });
}

/** 그 달 월초의 부채 잔액 (= 직전 달 말 잔액). 기준 월은 그 달에 입력한 잔액. */
function openingLiabilityBalances(data: HouseholdData, month: MonthRow): Record<string, Won> {
  const own = data.monthData[month.id] ?? EMPTY_MONTH_DATA;
  const prev = previousMonth(data, month);
  if (!prev) {
    return Object.fromEntries(own.liabilitySnapshots.map((s) => [s.liability_id, s.balance]));
  }
  const balances: Record<string, Won> = Object.fromEntries(
    reportFor(data, prev).liabilityLines.map((line) => [line.liabilityId, line.balance]),
  );
  // 전부터 있던 부채를 이번 달에 처음 등록했다면 적어 둔 월초 잔액을 쓴다
  for (const snapshot of own.liabilitySnapshots) {
    if (!balances[snapshot.liability_id] && snapshot.opening_balance !== null) {
      balances[snapshot.liability_id] = snapshot.opening_balance;
    }
  }
  return balances;
}

export function monthInputFor(data: HouseholdData, month: MonthRow): MonthInput {
  const prev = previousMonth(data, month);
  const prevReport = prev ? reportFor(data, prev) : null;
  const own = data.monthData[month.id] ?? EMPTY_MONTH_DATA;

  // 이 달에는 없던 자산·부채는 뺀다. 달을 다시 열었을 때 나중에 등록(또는 복원)한 항목이
  // 0원짜리 미확인 줄로 끼어들어 재마감을 막거나 다음 달 계산을 바꾸는 것을 막는다.
  //  - 다시 연 달: 마감 당시 줄에 있던 것만 (그 달에 실제로 있던 항목)
  //  - 처음 여는 달: 더 나중 달에 처음 기록된 것을 뺀다
  const index = data.months.findIndex((m) => m.id === month.id);
  const later = data.months.slice(index + 1).map((m) => data.monthData[m.id] ?? EMPTY_MONTH_DATA);
  const prevAssetIds = new Set((prevReport?.assetLines ?? []).map((line) => line.assetId));
  const ownAssetIds = new Set(own.assetSnapshots.map((s) => s.asset_id));
  const prevLiabilityIds = new Set((prevReport?.liabilityLines ?? []).map((line) => line.liabilityId));
  const ownLiabilityIds = new Set(own.liabilitySnapshots.map((s) => s.liability_id));
  const frozenAssetIds = month.summary ? new Set(month.summary.assetLines.map((line) => line.assetId)) : null;
  const frozenLiabilityIds = month.summary ? new Set(month.summary.liabilityLines.map((line) => line.liabilityId)) : null;

  return {
    month: month.month,
    isBaseline: prev === null,
    members: data.members,
    assets: data.assets.filter(
      (asset) =>
        prevAssetIds.has(asset.id) ||
        ownAssetIds.has(asset.id) ||
        (frozenAssetIds
          ? frozenAssetIds.has(asset.id)
          : !later.some((d) => d.assetSnapshots.some((s) => s.asset_id === asset.id))),
    ),
    liabilities: data.liabilities.filter(
      (liability) =>
        prevLiabilityIds.has(liability.id) ||
        ownLiabilityIds.has(liability.id) ||
        (frozenLiabilityIds
          ? frozenLiabilityIds.has(liability.id)
          : !later.some((d) => d.liabilitySnapshots.some((s) => s.liability_id === liability.id))),
    ),
    planLines: planLinesFor(data, month),
    prevAssetSnapshots: (prevReport?.assetLines ?? []).map((line) => ({
      asset_id: line.assetId,
      value: line.value,
      principal: line.principal,
    })),
    prevLiabilitySnapshots: (prevReport?.liabilityLines ?? []).map((line) => ({
      liability_id: line.liabilityId,
      balance: line.balance,
    })),
    assetSnapshots: own.assetSnapshots,
    liabilitySnapshots: own.liabilitySnapshots,
    entries: own.entries,
  };
}

// ───────────────────────── 현재 상태 ─────────────────────────

export interface Position {
  /** 기준이 되는 달 (가장 최근 달) */
  asOf: Ym | null;
  report: MonthReport | null;
  totals: BalanceTotals;
  /** 자산 id → 평가금액 / 순투입액 */
  assetValues: Record<string, Won>;
  assetPrincipals: Record<string, Won>;
  /** 부채 id → 남은 원금 */
  liabilityBalances: Record<string, Won>;
}

const EMPTY_TOTALS: BalanceTotals = { assets: 0, liabilities: 0, netWorth: 0, liquid: 0, financial: 0, byKind: {} };

/** 가장 최근 달 기준의 자산·부채 현황. 아직 확인하지 않은 항목은 직전 값이 유지된 것으로 본다. */
export function currentPosition(data: HouseholdData): Position {
  const month = latestMonth(data);
  if (!month) {
    return { asOf: null, report: null, totals: EMPTY_TOTALS, assetValues: {}, assetPrincipals: {}, liabilityBalances: {} };
  }
  const report = reportFor(data, month);
  return {
    asOf: month.month,
    report,
    totals: report.closing,
    assetValues: Object.fromEntries(report.assetLines.map((line) => [line.assetId, line.value])),
    assetPrincipals: Object.fromEntries(report.assetLines.map((line) => [line.assetId, line.principal])),
    liabilityBalances: Object.fromEntries(report.liabilityLines.map((line) => [line.liabilityId, line.balance])),
  };
}

// ───────────────────────── 지금 값의 기준 표기 ─────────────────────────

export type PositionBasis =
  /** 열린 달에 확인한 잔액이 아직 없다: 값은 마지막 마감 달 말 그대로 */
  | { kind: "closed"; month: Ym }
  /** 일부 잔액만 확인했다: 나머지는 전월 값 */
  | { kind: "in_progress"; month: Ym }
  /** 모든 항목을 확인했고 마감만 남았다 */
  | { kind: "confirmed"; month: Ym }
  /** 마감한 달이 없다 (기준 월 입력 중) */
  | { kind: "baseline"; month: Ym };

export interface PositionView {
  totals: BalanceTotals;
  basis: PositionBasis;
  /** 비교 기준이 되는 달 말의 합계 (증감 = totals − compare.totals). 비교할 달이 없으면 null */
  compare: { totals: BalanceTotals; since: Ym } | null;
  /** 순자산 증감. since 달 말 대비. 비교할 달이 없으면 null */
  change: { amount: Won; since: Ym } | null;
}

/**
 * 지금 보여 주는 잔액이 "어느 시점의 값인지"와 무엇과 비교할지를 정한다.
 * 홈·자산·부채·목표 화면이 같은 표기를 쓰도록 한곳에 둔다.
 *
 * 새 달이 열렸지만 확인한 잔액이 하나도 없으면 화면의 값은 지난 마감 달 말 값이다.
 * 이때 "이번 달 기준 · 지난달보다 0원"처럼 모르는 변화를 0으로 보여 주지 않는다.
 */
export function positionView(data: HouseholdData): PositionView | null {
  const position = currentPosition(data);
  const latest = latestMonth(data);
  if (!latest || !position.report) return null;
  const totals = position.totals;

  const closed = lastClosedMonth(data);
  if (!closed) return { totals, basis: { kind: "baseline", month: latest.month }, compare: null, change: null };

  const closedTotals = reportFor(data, closed).closing;
  const touched = data.months
    .filter((month) => month.status === "open")
    .some((month) => {
      const report = reportFor(data, month);
      return report.assetLines.some((line) => line.confirmed) || report.liabilityLines.some((line) => line.confirmed);
    });

  if (!touched) {
    // 화면의 값이 곧 마지막 마감 달 말 값이므로, 증감도 그 달 한 달 동안의 변화로 보여 준다.
    const before = previousMonth(data, closed);
    const compare = before ? { totals: reportFor(data, before).closing, since: before.month } : null;
    return {
      totals,
      basis: { kind: "closed", month: closed.month },
      compare,
      change: compare && { amount: closedTotals.netWorth - compare.totals.netWorth, since: compare.since },
    };
  }

  return {
    totals,
    basis: { kind: position.report.complete ? "confirmed" : "in_progress", month: latest.month },
    compare: { totals: closedTotals, since: closed.month },
    change: { amount: totals.netWorth - closedTotals.netWorth, since: closed.month },
  };
}

/** 기준 표기 문구 (예: "10월 말 마감 기준") */
export function basisText(basis: PositionBasis): string {
  const month = formatMonthOnly(basis.month);
  switch (basis.kind) {
    case "closed":
      return `${month} 말 마감 기준`;
    case "in_progress":
      return `${month} 진행 중 · 일부 잔액은 전월 값`;
    case "confirmed":
      return `${month} 말 잔액 · 마감 전`;
    case "baseline":
      return `기준 월(${month}) 잔액`;
  }
}

// ───────────────────────── 미래 계산의 출발점 ─────────────────────────

export interface ProjectionBase {
  /** 미래 계산을 시작하는 달 */
  startMonth: Ym;
  /** startMonth 월초의 자산 평가금액 · 부채 잔액 */
  assetValues: Record<string, Won>;
  liabilityBalances: Record<string, Won>;
}

/**
 * 시뮬레이션과 미래 달 계획의 출발점.
 * 가장 최근 달의 정산이 끝났으면(미확인 없음) 그 달 말 잔액에서 다음 달부터,
 * 아직이면 직전 달 말 잔액에서 그 달부터 시작한다 — 정산 전인 달의 저축·상환을 건너뛰지 않기 위해서다.
 */
export function projectionBase(data: HouseholdData): ProjectionBase {
  const latest = latestMonth(data);
  if (!latest) return { startMonth: currentYm(), assetValues: {}, liabilityBalances: {} };

  const report = reportFor(data, latest);
  const prev = previousMonth(data, latest);
  if (!prev || report.complete) {
    return {
      startMonth: addMonths(latest.month, 1),
      assetValues: Object.fromEntries(report.assetLines.map((line) => [line.assetId, line.value])),
      liabilityBalances: Object.fromEntries(report.liabilityLines.map((line) => [line.liabilityId, line.balance])),
    };
  }

  // 정산 전: 이번 달을 계획대로 다시 굴린다.
  //  - 아직 확인하지 않은 항목은 월초(직전 달 말) 값에서 출발한다.
  //  - 이미 확인한 부채는 "이번 달 예정 원금을 갚으면 확인한 잔액이 되는" 값에서 출발한다
  //    (이번 달에 새로 받은 대출, 중도 완납이 미래 계산에서 빠지지 않게).
  //  - 이번 달에 처음 생긴 자산은 확인한 값을 쓴다. 기존 현금으로 산 자산이라면 정산이 끝날 때까지
  //    그 금액이 잠시 이중으로 잡힐 수 있다 (정산을 마치면 사라지는 근사).
  return {
    startMonth: latest.month,
    assetValues: Object.fromEntries(
      report.assetLines.map((line) => [
        line.assetId,
        line.confirmed && line.openValue === 0 ? line.value : line.openValue,
      ]),
    ),
    liabilityBalances: Object.fromEntries(
      report.liabilityLines.map((line) => [
        line.liabilityId,
        line.confirmed ? line.balance + line.plannedPrincipal : line.openBalance,
      ]),
    ),
  };
}

// ───────────────────────── 계획 ─────────────────────────

/**
 * 임의의 달의 계획 (월급·배분 화면, 홈의 "이번 달").
 * 기록이 있는 달은 그 달의 계획 줄을, 미래 달은 현재 설정과 예정 상환 일정으로 계산한다.
 */
export function planForMonth(data: HouseholdData, ym: Ym): MonthPlan {
  const row = findMonth(data, ym);
  if (row) return summarizePlan(ym, data.members, planLinesFor(data, row));

  // 미래 달: 출발점부터 ym 직전까지 예정대로 갚았다고 보고 부채 잔액을 굴린다
  const base = projectionBase(data);
  const balances = { ...base.liabilityBalances };
  if (compareYm(ym, base.startMonth) > 0) {
    for (const month of ymRange(base.startMonth, addMonths(ym, -1))) {
      for (const liability of data.liabilities) {
        const balance = balances[liability.id] ?? 0;
        if (balance <= 0) continue;
        balances[liability.id] = balance - scheduledPayment(liability, month, balance).principal;
      }
    }
  }
  return summarizePlan(
    ym,
    data.members,
    buildPlanLines({ month: ym, planItems: data.planItems, liabilities: data.liabilities, liabilityBalances: balances }),
  );
}

// ───────────────────────── 이력 ─────────────────────────

export interface HistoryPoint {
  month: Ym;
  /** 열린 달의 값은 잠정치다 */
  provisional: boolean;
  report: MonthReport;
}

/** 월별 정산 결과 (오름차순). 마감된 달은 동결 결과, 열린 달은 현재 계산. */
export function history(data: HouseholdData): HistoryPoint[] {
  return data.months.map((month) => ({
    month: month.month,
    provisional: month.status === "open",
    report: reportFor(data, month),
  }));
}

// ───────────────────────── 시뮬레이션 · 목표 ─────────────────────────

export function baseScenario(data: HouseholdData): Scenario | null {
  return data.scenarios.find((scenario) => scenario.is_base) ?? data.scenarios[0] ?? null;
}

export function simulationInputFor(
  data: HouseholdData,
  scenario: Scenario,
  overrides: Partial<SimulationInput> = {},
): SimulationInput {
  const base = projectionBase(data);
  return {
    startMonth: base.startMonth,
    members: data.members,
    assets: data.assets,
    liabilities: data.liabilities,
    planItems: data.planItems,
    assetValues: base.assetValues,
    liabilityBalances: base.liabilityBalances,
    assumptions: resolveAssumptions(scenario.assumptions),
    events: eventsForScenario(scenario, data.events),
    ...overrides,
  };
}

export function simulateScenario(data: HouseholdData, scenario: Scenario): SimulationResult {
  return simulate(simulationInputFor(data, scenario));
}

export interface GoalsView {
  progress: GoalProgress[];
  /** 가용자산 중 목표에 배정된 금액 */
  allocatedLiquid: Won;
  /** 목표 배정 후 여유 가용자산 */
  freeLiquid: Won;
}

export function goalsView(data: HouseholdData, currentMonth: Ym): GoalsView {
  const position = currentPosition(data);
  const base = baseScenario(data);
  const needsProjection = data.goals.some(
    (goal) => !goal.is_archived && (goal.basis === "net_worth" || goal.basis === "financial_assets"),
  );
  const progress = computeGoalProgress({
    goals: data.goals,
    allocations: data.goalAllocations,
    assets: data.assets,
    assetValues: position.assetValues,
    totals: position.totals,
    currentMonth,
    projection: needsProjection && base ? simulateScenario(data, base).points : undefined,
  });
  const allocated = allocatedLiquid(progress, data.assets);
  return { progress, allocatedLiquid: allocated, freeLiquid: position.totals.liquid - allocated };
}

// ───────────────────────── 주머니 표시 ─────────────────────────

export type PocketTone = "member-1" | "member-2" | "joint";

export function pocketName(data: HouseholdData, pocket: PocketId): string {
  if (pocket === JOINT) return "공동";
  return data.members.find((member) => member.id === pocket)?.name ?? "알 수 없음";
}

/** 주머니 색: 구성원 순서대로 member-1, member-2, 공동은 joint */
export function pocketTone(data: HouseholdData, pocket: PocketId): PocketTone {
  if (pocket === JOINT) return "joint";
  return data.members.findIndex((member) => member.id === pocket) <= 0 ? "member-1" : "member-2";
}
