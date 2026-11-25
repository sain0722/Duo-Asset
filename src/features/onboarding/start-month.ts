import type { Ym } from "@/lib/finance/types";
import { addMonths, currentYm, todayInSeoul } from "@/lib/month";

/** 이 날짜 전이면 지난달을 기준 월로 권한다 — 지난달 말 잔액을 아직 확인할 수 있는 때다. */
const EARLY_MONTH_DAY = 10;

export interface StartMonthChoice {
  thisMonth: Ym;
  lastMonth: Ym;
  /** 처음 선택돼 있을 값 */
  suggested: Ym;
}

/** 기준 월 선택지: 이번 달과 지난달 (서울 기준) */
export function startMonthChoice(now: Date = new Date()): StartMonthChoice {
  const thisMonth = currentYm(now);
  const lastMonth = addMonths(thisMonth, -1);
  const day = Number(todayInSeoul(now).slice(8, 10));
  return { thisMonth, lastMonth, suggested: day < EARLY_MONTH_DAY ? lastMonth : thisMonth };
}
