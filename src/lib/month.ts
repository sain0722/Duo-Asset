import type { Ym } from "@/lib/finance/types";

/** 서비스 기준 시간대. "이번 달"은 기기 설정과 무관하게 이 시간대로 정한다. */
export const TIME_ZONE = "Asia/Seoul";

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isYm(value: string): value is Ym {
  return YM_PATTERN.test(value);
}

/** 주어진 시각이 Asia/Seoul 기준으로 속한 월 */
export function ymOf(date: Date): Ym {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${year}-${month}`;
}

export function currentYm(now: Date = new Date()): Ym {
  return ymOf(now);
}

/** Asia/Seoul 기준 오늘 날짜 'YYYY-MM-DD' */
export function todayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function ymParts(ym: Ym): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
}

function toIndex(ym: Ym): number {
  const { year, month } = ymParts(ym);
  return year * 12 + (month - 1);
}

function fromIndex(index: number): Ym {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function addMonths(ym: Ym, count: number): Ym {
  return fromIndex(toIndex(ym) + count);
}

/** to − from (개월 수). 같은 달이면 0 */
export function diffMonths(from: Ym, to: Ym): number {
  return toIndex(to) - toIndex(from);
}

export function compareYm(a: Ym, b: Ym): number {
  return toIndex(a) - toIndex(b);
}

/** start 부터 end 까지(양 끝 포함)의 월 목록 */
export function ymRange(start: Ym, end: Ym): Ym[] {
  const result: Ym[] = [];
  for (let i = toIndex(start); i <= toIndex(end); i++) result.push(fromIndex(i));
  return result;
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function ymOfDateString(date: string): Ym {
  return date.slice(0, 7);
}

/** 그 달의 마지막 날 'YYYY-MM-DD' */
export function monthEndDate(ym: Ym): string {
  const { year, month } = ymParts(ym);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${ym}-${String(lastDay).padStart(2, "0")}`;
}
