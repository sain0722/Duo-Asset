import type { Ym } from "@/lib/finance/types";
import { addMonths, currentYm } from "@/lib/month";

export interface StartMonthChoice {
  thisMonth: Ym;
  lastMonth: Ym;
  /** 처음 선택돼 있을 값 */
  suggested: Ym;
}

/**
 * 기준 월 선택지: 지난달과 이번 달 (서울 기준).
 * 기준 월의 잔액은 그 달 말일 잔액이고, 달이 끝나야 마감할 수 있다.
 * 그래서 이미 끝난 지난달을 권한다 — 지난달 말 잔액을 넣고 바로 시작하면 이번 달 정산부터 분석이 나온다.
 */
export function startMonthChoice(now: Date = new Date()): StartMonthChoice {
  const thisMonth = currentYm(now);
  const lastMonth = addMonths(thisMonth, -1);
  return { thisMonth, lastMonth, suggested: lastMonth };
}
