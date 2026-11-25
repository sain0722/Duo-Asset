/**
 * 홈 대시보드가 보여 줄 값을 고른다. 재무 계산은 lib/finance · lib/data/derive 가 하고,
 * 여기서는 "어느 달의 어떤 결과를 보여 줄지"와 목록 조립만 한다. React 를 import 하지 않는다.
 */
import {
  baseScenario,
  currentPosition,
  lastClosedMonth,
  latestMonth,
  previousMonth,
  projectionBase,
  reportFor,
  workingMonth,
  type GoalsView,
  type HistoryPoint,
} from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import { eventsForScenario, payoffSummary, percentOf } from "@/lib/finance";
import type {
  BalanceTotals,
  ExpenseChangeParams,
  FutureEvent,
  FutureEventKind,
  IncomeChangeParams,
  MonthPlan,
  MonthReport,
  OneTimeParams,
  PlanLineKind,
  PocketId,
  Won,
  Ym,
} from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { addMonths, compareYm, diffMonths, monthEndDate, ymOfDateString } from "@/lib/month";

/** 미확인 항목 수 (잔액·실제 수입·실제 납입) */
export function unconfirmedCount(report: MonthReport): number {
  return report.warnings.filter((warning) => warning.code.startsWith("unconfirmed_")).length;
}

function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

// ───────────────────────── 순자산 히어로 ─────────────────────────

export type HeroBasis =
  /** 열린 달에 확인한 잔액이 아직 없다: 값은 마지막 마감 달 말 그대로 */
  | { kind: "closed"; month: Ym }
  /** 일부 잔액만 확인했다: 나머지는 전월 값 */
  | { kind: "in_progress"; month: Ym }
  /** 모든 항목을 확인했고 마감만 남았다 */
  | { kind: "confirmed"; month: Ym }
  /** 마감한 달이 없다 (기준 월 입력 중) */
  | { kind: "baseline"; month: Ym };

export interface HeroView {
  totals: BalanceTotals;
  basis: HeroBasis;
  /** 순자산 증감. since 달 말 대비. 비교할 달이 없으면 null */
  change: { amount: Won; since: Ym } | null;
}

export function heroView(data: HouseholdData): HeroView | null {
  const position = currentPosition(data);
  const latest = latestMonth(data);
  if (!latest || !position.report) return null;
  const totals = position.totals;

  const closed = lastClosedMonth(data);
  if (!closed) return { totals, basis: { kind: "baseline", month: latest.month }, change: null };

  const closedReport = reportFor(data, closed);
  const openMonths = data.months.filter((month) => month.status === "open");
  const touched = openMonths.some((month) => {
    const report = reportFor(data, month);
    return report.assetLines.some((line) => line.confirmed) || report.liabilityLines.some((line) => line.confirmed);
  });

  if (!touched) {
    // 화면의 값이 곧 마지막 마감 달 말 값이므로, 증감도 그 달 한 달 동안의 변화로 보여 준다.
    const before = previousMonth(data, closed);
    return {
      totals,
      basis: { kind: "closed", month: closed.month },
      change: before
        ? { amount: closedReport.closing.netWorth - reportFor(data, before).closing.netWorth, since: before.month }
        : null,
    };
  }

  return {
    totals,
    basis: { kind: position.report.complete ? "confirmed" : "in_progress", month: latest.month },
    change: { amount: totals.netWorth - closedReport.closing.netWorth, since: closed.month },
  };
}

// ───────────────────────── 정산 안내 · 시작하기 ─────────────────────────

export type SettlementNotice =
  | { kind: "overdue"; month: Ym; unconfirmed: number }
  | { kind: "prepare"; month: Ym; unconfirmed: number; /** 말일까지 남은 날 (말일이면 0) */ daysLeft: number }
  | null;

/**
 * 정산할 달이 이번 달보다 앞서 있으면 "마무리하세요",
 * 이번 달이고 말일 5일 전부터면 "준비하세요". 마감한 달이 없으면 시작하기 체크리스트가 대신 안내한다.
 */
export function settlementNotice(data: HouseholdData, today: string): SettlementNotice {
  const working = workingMonth(data);
  if (!working || !lastClosedMonth(data)) return null;
  const now = ymOfDateString(today);
  const unconfirmed = unconfirmedCount(reportFor(data, working));
  if (compareYm(working.month, now) < 0) return { kind: "overdue", month: working.month, unconfirmed };
  const daysLeft = dayOf(monthEndDate(now)) - dayOf(today);
  if (working.month === now && daysLeft <= 5) return { kind: "prepare", month: working.month, unconfirmed, daysLeft };
  return null;
}

export type SetupStepKey = "assets" | "liabilities" | "plan" | "close";

export interface SetupStep {
  key: SetupStepKey;
  done: boolean;
  /** 부채가 없는 집도 있으므로 건너뛸 수 있다 */
  optional: boolean;
}

/** 첫 마감 전까지 보여 주는 시작하기 단계. 마감한 달이 있으면 null */
export function setupChecklist(data: HouseholdData): SetupStep[] | null {
  if (lastClosedMonth(data)) return null;
  return [
    { key: "assets", done: data.assets.length > 0, optional: false },
    { key: "liabilities", done: data.liabilities.length > 0, optional: true },
    { key: "plan", done: data.planItems.some((item) => item.kind === "income"), optional: false },
    { key: "close", done: false, optional: false },
  ];
}

/** 지금 할 단계: 끝나지 않은 첫 필수 단계 */
export function nextSetupStep(steps: SetupStep[]): SetupStepKey | null {
  return steps.find((step) => !step.done && !step.optional)?.key ?? null;
}

// ───────────────────────── 지난 정산 결과 ─────────────────────────

export interface SettlementResult {
  month: Ym;
  report: MonthReport;
  /** 저축 목표 달성률 = 실제 저축 ÷ 계획 저축 (%). 계획 저축이 0 이하면 null */
  achievement: number | null;
  /** 공동 주머니 소비 vs 계획 소비 */
  joint: { actual: Won; budget: Won; percent: number | null } | null;
}

/** 마지막으로 마감한 달(기준 월 제외)의 동결 결과 */
export function lastSettlement(data: HouseholdData): SettlementResult | null {
  const closed = lastClosedMonth(data);
  if (!closed) return null;
  const report = reportFor(data, closed);
  if (report.isBaseline) return null;
  const joint = report.pockets.find((pocket) => pocket.pocket === JOINT);
  return {
    month: closed.month,
    report,
    achievement: percentOf(report.savings, report.plan.savings),
    joint: joint
      ? {
          actual: joint.consumption,
          budget: joint.plannedConsumption,
          percent: percentOf(joint.consumption, joint.plannedConsumption),
        }
      : null,
  };
}

// ───────────────────────── 자산 추이 ─────────────────────────

export type TrendMetric = "netWorth" | "assets" | "liabilities";
export type TrendRange = "6" | "12" | "all";

export interface TrendView {
  rows: { month: Ym; value: Won }[];
  /** 정산 전이라 잠정인 달 */
  provisional: Ym[];
}

export function trendView(points: HistoryPoint[], metric: TrendMetric, range: TrendRange): TrendView {
  const sliced = range === "all" ? points : points.slice(-Number(range));
  return {
    rows: sliced.map((point) => ({ month: point.month, value: point.report.closing[metric] })),
    provisional: sliced.filter((point) => point.provisional).map((point) => point.month),
  };
}

// ───────────────────────── 다가오는 일 ─────────────────────────

export interface PayDayItem {
  key: string;
  /** 이번 달의 날짜 (말일을 넘는 납부일은 말일로) */
  day: number;
  kind: Extract<PlanLineKind, "income" | "expense" | "debt">;
  name: string;
  pocket: PocketId;
  amount: Won;
}

export type AheadItem =
  | { key: string; kind: "debt_end"; month: Ym; name: string; /** 끝나면 풀리는 월 납부액 */ freed: Won }
  | { key: string; kind: "maturity"; month: Ym; date: string; name: string; value: Won }
  | { key: string; kind: "event"; month: Ym; name: string; eventKind: FutureEventKind; amount: Won | null };

export interface UpcomingGoal {
  goalId: string;
  name: string;
  percent: number;
  remaining: Won;
  expectedMonth: Ym | null;
}

export interface Upcoming {
  thisMonth: PayDayItem[];
  ahead: AheadItem[];
  goals: UpcomingGoal[];
}

/** 앞으로 몇 개월 안의 일을 보여 줄지 */
export const AHEAD_MONTHS = 12;
const EVENT_LIMIT = 3;
const GOAL_LIMIT = 2;

function eventAmount(event: FutureEvent): Won | null {
  switch (event.kind) {
    case "one_time":
      return (event.params as OneTimeParams).amount;
    case "income_change":
    case "expense_change":
      return (event.params as IncomeChangeParams | ExpenseChangeParams).monthlyDelta;
    default:
      return null;
  }
}

/**
 * 다가오는 일.
 * - 이번 달: 오늘 이후의 급여일·고정지출·부채 납부일 (계획 줄의 payDay)
 * - 앞으로: 끝나는 부채, 만기 자산, 기본 시나리오의 미래 이벤트 (AHEAD_MONTHS 안)
 * - 목표: 진행 중인 목표 중 달성률 상위
 */
export function upcoming(data: HouseholdData, args: { today: string; plan: MonthPlan; goals: GoalsView }): Upcoming {
  const { today, plan, goals } = args;
  const now = ymOfDateString(today);
  const horizon = addMonths(now, AHEAD_MONTHS);
  const lastDay = dayOf(monthEndDate(now));
  const within = (month: Ym) => compareYm(month, now) >= 0 && compareYm(month, horizon) <= 0;

  const thisMonth: PayDayItem[] = [];
  for (const line of plan.lines) {
    if (line.kind !== "income" && line.kind !== "expense" && line.kind !== "debt") continue;
    if (line.payDay == null) continue;
    const day = Math.min(line.payDay, lastDay);
    if (day <= dayOf(today)) continue;
    thisMonth.push({ key: line.key, day, kind: line.kind, name: line.name, pocket: line.pocket, amount: line.amount });
  }
  thisMonth.sort((a, b) => a.day - b.day);

  const ahead: AheadItem[] = [];

  // 예정대로 갚을 때 끝나는 부채. 마지막 회차(잔액 정리분)가 아니라 평소 회차를 "풀리는 금액"으로 본다.
  const base = projectionBase(data);
  for (const liability of data.liabilities) {
    const balance = base.liabilityBalances[liability.id] ?? 0;
    if (balance <= 0) continue;
    const payoff = payoffSummary(liability, base.startMonth, balance, diffMonths(base.startMonth, horizon) + 1);
    if (!payoff.endMonth || !within(payoff.endMonth)) continue;
    ahead.push({
      key: `debt:${liability.id}`,
      kind: "debt_end",
      month: payoff.endMonth,
      name: liability.name,
      freed: payoff.freed,
    });
  }

  const assetValues = currentPosition(data).assetValues;
  for (const asset of data.assets) {
    if (!asset.maturity_date) continue;
    const value = assetValues[asset.id] ?? 0;
    const month = ymOfDateString(asset.maturity_date);
    if (value <= 0 || !within(month)) continue;
    ahead.push({ key: `asset:${asset.id}`, kind: "maturity", month, date: asset.maturity_date, name: asset.name, value });
  }

  const scenario = baseScenario(data);
  const events = scenario ? eventsForScenario(scenario, data.events) : data.events.filter((e) => e.scenario_id === null);
  const nearEvents = events
    .filter((event) => compareYm(event.month, now) >= 0)
    .sort((a, b) => compareYm(a.month, b.month))
    .slice(0, EVENT_LIMIT);
  for (const event of nearEvents) {
    ahead.push({
      key: `event:${event.id}`,
      kind: "event",
      month: event.month,
      name: event.name,
      eventKind: event.kind,
      amount: eventAmount(event),
    });
  }
  ahead.sort((a, b) => compareYm(a.month, b.month));

  const goalNames = new Map(data.goals.map((goal) => [goal.id, goal.name]));
  const topGoals = goals.progress
    .filter((progress) => !progress.achieved)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, GOAL_LIMIT)
    .map((progress) => ({
      goalId: progress.goalId,
      name: goalNames.get(progress.goalId) ?? "",
      percent: progress.percent,
      remaining: progress.remaining,
      expectedMonth: progress.expectedMonth,
    }));

  return { thisMonth, ahead, goals: topGoals };
}

export function isUpcomingEmpty(value: Upcoming): boolean {
  return value.thisMonth.length === 0 && value.ahead.length === 0 && value.goals.length === 0;
}
