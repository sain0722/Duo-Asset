import type { HistoryPoint } from "@/lib/data/derive";
import type { Won } from "@/lib/finance/types";

const HEADER = ["월", "상태", "수입", "소비", "저축", "저축률(%)", "원금 상환", "투자 평가손익", "총자산", "총부채", "순자산"];

/** 엑셀이 UTF-8 로 읽게 하는 표시. 없으면 한글이 깨진다. */
const BOM = "﻿";

function statusOf(point: HistoryPoint): string {
  if (point.report.isBaseline) return "기준 월";
  if (!point.provisional) return "마감";
  return point.report.complete ? "마감 전" : "정산 전";
}

function cell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * 월별 요약 CSV. 금액은 쉼표 없는 원 단위 정수(엑셀에서 숫자로 읽힌다).
 * 기준 월과 정산 전(미확인 남음)인 달의 흐름 지표는 빈칸으로 둔다 — 0원과 구분해야 한다.
 * 잔액(총자산·총부채·순자산)은 모든 달에 적는다.
 */
export function buildMonthlyCsv(points: HistoryPoint[]): string {
  const rows = points.map((point) => {
    const { report } = point;
    const hasFlow = !report.isBaseline && report.complete;
    const flow = (amount: Won) => (hasFlow ? amount : null);
    return [
      point.month,
      statusOf(point),
      flow(report.income),
      flow(report.consumption),
      flow(report.savings),
      hasFlow ? report.savingsRate : null,
      flow(report.principalRepaid),
      flow(report.investmentGain),
      report.closing.assets,
      report.closing.liabilities,
      report.closing.netWorth,
    ].map(cell);
  });
  return BOM + [HEADER, ...rows].map((row) => row.join(",")).join("\r\n") + "\r\n";
}
