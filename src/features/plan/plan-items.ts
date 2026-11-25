/**
 * 월급·배분 화면에서 계획 항목을 다루는 순수 함수. 계산(합계·사용 가능 금액)은 lib/finance 가 한다.
 */
import { isPlanItemActive } from "@/lib/finance/plan";
import type { PlanItem, Ym } from "@/lib/finance/types";
import { formatYmShort } from "@/lib/format";
import { addMonths, compareYm } from "@/lib/month";

/** "1·7월" */
export function monthsLabel(months: number[]): string {
  return `${[...months].sort((x, y) => x - y).join("·")}월`;
}

/** 적용 기간 표기: "26.12부터", "26.10까지", "26.01 ~ 26.06". 제한이 없으면 null */
export function periodLabel(item: Pick<PlanItem, "start_month" | "end_month">): string | null {
  const { start_month: start, end_month: end } = item;
  if (start && end) return `${formatYmShort(start)} ~ ${formatYmShort(end)}`;
  if (start) return `${formatYmShort(start)}부터`;
  if (end) return `${formatYmShort(end)}까지`;
  return null;
}

/** 그 달에 적용되지 않는 이유. 적용되면 null */
export function inactiveReason(item: PlanItem, month: Ym): string | null {
  if (isPlanItemActive(item, month)) return null;
  if (!item.is_active) return "사용 안 함";
  if (item.start_month && compareYm(month, item.start_month) < 0) return `${formatYmShort(item.start_month)}부터 적용`;
  if (item.end_month && compareYm(month, item.end_month) > 0) return `${formatYmShort(item.end_month)}에 종료`;
  if (item.months_of_year) return `${monthsLabel(item.months_of_year)}에만`;
  return null;
}

/**
 * "○월부터 변경"이 의미 있는가: 항목이 from 이전 달에도 적용되고 있어야 나눌 수 있다.
 * (from 이전에 시작하지 않았거나, from 이전에 이미 끝났으면 그냥 고치면 된다)
 */
export function canSplitAt(item: Pick<PlanItem, "start_month" | "end_month">, from: Ym): boolean {
  if (item.start_month && compareYm(item.start_month, from) >= 0) return false;
  if (item.end_month && compareYm(item.end_month, from) < 0) return false;
  return true;
}

/**
 * 금액 등을 from 달부터 바꾼다: 기존 항목은 전월로 끝내고, 같은 설정의 새 항목을 from 부터 시작한다.
 * 기존 항목의 종료 월(있다면)은 새 항목이 이어받는다.
 */
export function splitPlanItem(item: PlanItem, from: Ym): { endPrevious: Pick<PlanItem, "end_month">; nextStart: Ym; nextEnd: Ym | null } {
  return { endPrevious: { end_month: addMonths(from, -1) }, nextStart: from, nextEnd: item.end_month };
}

/** 특정 월만(months_of_year) 표기용: 1~12 */
export const MONTH_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

