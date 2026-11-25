import type { Won, Ym } from "@/lib/finance/types";
import { ymParts } from "@/lib/month";

const MINUS = "−"; // U+2212. 하이픈보다 숫자와 폭이 잘 맞는다.

function signPrefix(amount: number, showPlus: boolean): string {
  if (amount < 0) return MINUS;
  if (amount > 0 && showPlus) return "+";
  return "";
}

/** 4800000 → "4,800,000원" */
export function formatWon(amount: Won, options: { sign?: boolean } = {}): string {
  const body = Math.abs(amount).toLocaleString("ko-KR");
  return `${signPrefix(amount, options.sign ?? false)}${body}원`;
}

/** 4800000 → "4,800,000" (단위 없이) */
export function formatNumber(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

/**
 * 한국어 단위 표기 (정확한 값).
 * 123456789 → "1억 2,345만 6,789원", 4800000 → "480만 원", 0 → "0원"
 */
export function formatKoreanWon(amount: Won, options: { sign?: boolean } = {}): string {
  const abs = Math.abs(amount);
  const eok = Math.floor(abs / 100_000_000);
  const man = Math.floor((abs % 100_000_000) / 10_000);
  const rest = abs % 10_000;

  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest > 0 || parts.length === 0) parts.push(rest.toLocaleString("ko-KR"));

  const prefix = signPrefix(amount, options.sign ?? false);
  // "480만 원"처럼 단위로 끝나면 띄우고, "6,789원"처럼 숫자로 끝나면 붙인다.
  const endsWithNumber = rest > 0 || (eok === 0 && man === 0);
  return `${prefix}${parts.join(" ")}${endsWithNumber ? "" : " "}원`;
}

/**
 * 요약 표기: 만 원 미만을 반올림한다.
 * 123456789 → "1억 2,346만 원", 692000 → "69만 원", 6789 → "6,789원"
 */
export function formatCompactWon(amount: Won, options: { sign?: boolean } = {}): string {
  const abs = Math.abs(amount);
  if (abs < 10_000) return formatKoreanWon(amount, options);
  const rounded = Math.round(abs / 10_000) * 10_000;
  return formatKoreanWon(amount < 0 ? -rounded : rounded, options);
}

/** 40.25 → "40.3%" */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** "2026-11" → "2026년 11월" */
export function formatYm(ym: Ym): string {
  const { year, month } = ymParts(ym);
  return `${year}년 ${month}월`;
}

/** "2026-11" → "11월" */
export function formatMonthOnly(ym: Ym): string {
  return `${ymParts(ym).month}월`;
}

/** "2026-11" → "26.11" (차트 축 등 좁은 곳) */
export function formatYmShort(ym: Ym): string {
  return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`;
}

/** "2026-11-25" → "2026.11.25" */
export function formatDate(date: string): string {
  return date.slice(0, 10).replaceAll("-", ".");
}

/**
 * 입력 문자열을 원 단위 정수로.
 * - 비어 있으면 null (미입력 ≠ 0)
 * - "4,800,000", "4800000원", "1,234,567.00"(소수점 이하는 버림), "480만", "1억 2,000만", "1.5억" 을 읽는다
 * - 해석할 수 없는 글자가 섞이면 틀린 숫자를 만들지 않고 null 을 돌려준다
 */
export function parseWonInput(text: string): Won | null {
  const cleaned = text.replace(/[\s,원]/g, "");
  if (cleaned === "") return null;
  const negative = /^[-−]/.test(cleaned);
  const body = cleaned.replace(/^[-−+]/, "");

  let value: number;
  if (/^\d+(\.\d+)?$/.test(body)) {
    value = Math.trunc(Number(body));
  } else {
    const match = body.match(/^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?(\d+)?$/);
    if (!match || (match[1] === undefined && match[2] === undefined)) return null;
    value = Math.round(
      Number(match[1] ?? 0) * 100_000_000 + Number(match[2] ?? 0) * 10_000 + Number(match[3] ?? 0),
    );
  }
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}
