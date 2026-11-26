/**
 * 부채·고정지출 화면 전용 파생 값. 순수 함수만 둔다 (React·Supabase import 금지).
 * 상환 일정 자체는 lib/finance 의 buildSchedule 이 계산하고, 여기서는 화면에 맞게 고르고 묶는다.
 */
import { payoffSummary, percentOf, scheduledPayment } from "@/lib/finance";
import type { Liability, LiabilityLine, MonthPlan, PlanItem, PocketId, ScheduleRow, Won, Ym } from "@/lib/finance/types";
import { pocketOf } from "@/lib/finance/meta";
import type { HistoryPoint } from "@/lib/data/derive";
import { addMonths, compareYm } from "@/lib/month";

// ───────────────────────── 이번 달 예정 상환 ─────────────────────────

/** 그 달 계획의 부채 상환 줄 합계 (원금 / 이자 / 합) */
export function debtPlanTotals(plan: MonthPlan): { principal: Won; interest: Won; payment: Won } {
  const debt = plan.lines.filter((line) => line.kind === "debt");
  const principal = debt.reduce((total, line) => total + (line.principal ?? 0), 0);
  const interest = debt.reduce((total, line) => total + (line.interest ?? 0), 0);
  return { principal, interest, payment: principal + interest };
}

export type LiabilityTerms = Pick<
  Liability,
  "kind" | "original_principal" | "annual_rate" | "term_months" | "start_month" | "monthly_payment"
>;

/**
 * 전부터 있던 부채를 정산 중인 달에 등록할 때 "이번 달 갚은 원금"의 기본값.
 * 계획은 월초 잔액(= 월말 잔액 + 갚은 원금)으로 그달 예정 원금을 잡으므로, 둘이 맞는 값을 찾는다.
 * 원리금균등처럼 예정 원금이 월초 잔액에 따라 달라지는 방식도 몇 번 되풀이하면 원 단위로 맞는다.
 * 일정과 남은 원금이 맞지 않아(예: 일정상 이번 달이 마지막 회차인데 원금이 남았다) 값이 정해지지 않으면 null.
 */
export function scheduledRepayment(terms: LiabilityTerms, month: Ym, balance: Won): Won | null {
  // scheduledPayment 는 상환 조건만 읽는다
  const liability = terms as Liability;
  let repaid = 0;
  for (let i = 0; i < 8; i += 1) {
    const next = scheduledPayment(liability, month, balance + repaid).principal;
    if (next === repaid) return repaid;
    repaid = next;
  }
  return null;
}

/** 최초 원금 중 갚은 비율 % (소수 1자리) */
export function repaidPercent(originalPrincipal: Won, balance: Won): number | null {
  return percentOf(Math.max(originalPrincipal - balance, 0), originalPrincipal);
}

// ───────────────────────── 앞으로의 일정 ─────────────────────────

/**
 * 남은 일정을 어디서부터 그릴지.
 * 이번 달 잔액을 이미 확인했다면 그 잔액에서 다음 달부터, 아니면 월초 잔액에서 이번 달부터.
 */
export function scheduleStart(line: Pick<LiabilityLine, "confirmed" | "balance" | "openBalance">, asOf: Ym): { from: Ym; balance: Won } {
  return line.confirmed ? { from: addMonths(asOf, 1), balance: line.balance } : { from: asOf, balance: line.openBalance };
}

export interface PayoffInfo {
  schedule: ScheduleRow[];
  /** 잔액이 0이 되는 마지막 납부 월. 끝나지 않으면 null */
  endMonth: Ym | null;
  /**
   * 끝나면 풀리는 월 납부액: 마지막(잔액 정리) 회차가 아니라 평소 회차 기준.
   * 만기일시상환은 매월 내던 이자만 풀린다 (시뮬레이션과 같은 규칙).
   */
  freed: Won;
}

export function payoffInfo(liability: Liability, from: Ym, balance: Won): PayoffInfo {
  return payoffSummary(liability, from, balance);
}

// ───────────────────────── 여유 자금 변화 ─────────────────────────

export interface Release {
  key: string;
  source: "debt" | "expense";
  name: string;
  pocket: PocketId;
  /** 마지막으로 내는 달 */
  endMonth: Ym;
  /** 이 달부터 매월 여유가 생긴다 */
  freedFrom: Ym;
  /** 매월 풀리는 금액 */
  amount: Won;
}

export interface TimelineEntry extends Release {
  /** 이 시점까지 풀린 월 여유 자금 합 */
  cumulative: Won;
}

/**
 * 끝나는 날이 정해진 고정지출: 사용 중이고, 종료 월이 기준 달 이후이고, 매월 나가는 것.
 * (특정 달에만 나가는 항목은 "매월 여유"로 바꿔 말할 수 없어 뺀다)
 */
export function expenseReleases(planItems: PlanItem[], asOf: Ym): Release[] {
  return planItems
    .filter(
      (item) =>
        item.kind === "expense" &&
        item.is_active &&
        item.end_month !== null &&
        item.months_of_year === null &&
        item.amount > 0 &&
        compareYm(item.end_month, asOf) >= 0,
    )
    .map((item) => ({
      key: `plan:${item.id}`,
      source: "expense" as const,
      name: item.name,
      pocket: pocketOf(item.member_id),
      endMonth: item.end_month!,
      freedFrom: addMonths(item.end_month!, 1),
      amount: item.amount,
    }));
}

/** 끝나는 순서대로 늘어놓고 누적 여유를 붙인다 */
export function releaseTimeline(releases: Release[]): TimelineEntry[] {
  let cumulative = 0;
  return releases
    .toSorted((a, b) => compareYm(a.endMonth, b.endMonth) || b.amount - a.amount)
    .map((release) => {
      cumulative += release.amount;
      return { ...release, cumulative };
    });
}

// ───────────────────────── 예정 vs 실제 ─────────────────────────

export interface LiabilityHistoryRow {
  month: Ym;
  provisional: boolean;
  isBaseline: boolean;
  confirmed: boolean;
  balance: Won;
  /** 실제 순상환 (음수면 추가 차입). 미확인이면 null */
  principalPaid: Won | null;
  plannedPrincipal: Won;
  plannedInterest: Won;
  /** 실제 이자·지급액. 미확인이면 null */
  interestPaid: Won | null;
}

/** 한 부채의 월별 예정·실제 (오름차순). 기준 월은 비교할 이전 잔액이 없어 뺀다. */
export function liabilityHistory(points: HistoryPoint[], liabilityId: string): LiabilityHistoryRow[] {
  return points.flatMap((point) => {
    if (point.report.isBaseline) return [];
    const line = point.report.liabilityLines.find((candidate) => candidate.liabilityId === liabilityId);
    if (!line) return [];
    return [
      {
        month: point.month,
        provisional: point.provisional,
        isBaseline: point.report.isBaseline,
        confirmed: line.confirmed,
        balance: line.balance,
        // 잔액을 확인하지 않은 달의 순상환 0은 가정일 뿐이다
        principalPaid: line.confirmed ? line.principalPaid : null,
        plannedPrincipal: line.plannedPrincipal,
        plannedInterest: line.plannedInterest,
        interestPaid: line.interestPaid,
      },
    ];
  });
}
