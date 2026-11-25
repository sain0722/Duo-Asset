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
import { addMonths, compareYm, ymRange } from "@/lib/month";
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
  if (month.summary) return month.summary.planLines;
  return buildPlanLines({
    month: month.month,
    planItems: data.planItems,
    liabilities: data.liabilities,
    liabilityBalances: openingLiabilityBalances(data, month),
  });
}

/** 그 달 월초의 부채 잔액 (= 직전 달 말 잔액). 기준 월은 그 달에 입력한 잔액. */
function openingLiabilityBalances(data: HouseholdData, month: MonthRow): Record<string, Won> {
  const prev = previousMonth(data, month);
  if (!prev) {
    const own = data.monthData[month.id] ?? EMPTY_MONTH_DATA;
    return Object.fromEntries(own.liabilitySnapshots.map((s) => [s.liability_id, s.balance]));
  }
  return Object.fromEntries(reportFor(data, prev).liabilityLines.map((line) => [line.liabilityId, line.balance]));
}

export function monthInputFor(data: HouseholdData, month: MonthRow): MonthInput {
  const prev = previousMonth(data, month);
  const prevReport = prev ? reportFor(data, prev) : null;
  const own = data.monthData[month.id] ?? EMPTY_MONTH_DATA;
  return {
    month: month.month,
    isBaseline: prev === null,
    members: data.members,
    assets: data.assets,
    liabilities: data.liabilities,
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

// ───────────────────────── 계획 ─────────────────────────

/**
 * 임의의 달의 계획 (월급·배분 화면, 홈의 "이번 달").
 * 기록이 있는 달은 그 달의 계획 줄을, 미래 달은 현재 설정과 예정 상환 일정으로 계산한다.
 */
export function planForMonth(data: HouseholdData, ym: Ym): MonthPlan {
  const row = findMonth(data, ym);
  if (row) return summarizePlan(ym, data.members, planLinesFor(data, row));

  const latest = latestMonth(data);
  let balances = currentPosition(data).liabilityBalances;
  if (latest && compareYm(ym, latest.month) > 0) {
    // 마지막 기록 이후 ym 직전까지 예정대로 갚았다고 보고 잔액을 굴린다
    balances = { ...balances };
    const between = ymRange(addMonths(latest.month, 1), addMonths(ym, -1));
    for (const month of between) {
      for (const liability of data.liabilities) {
        const balance = balances[liability.id] ?? 0;
        if (!liability.is_active || balance <= 0) continue;
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
  const position = currentPosition(data);
  return {
    // 마지막 기록 다음 달부터
    startMonth: addMonths(position.asOf ?? "2026-01", 1),
    members: data.members,
    assets: data.assets,
    liabilities: data.liabilities,
    planItems: data.planItems,
    assetValues: position.assetValues,
    liabilityBalances: position.liabilityBalances,
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
