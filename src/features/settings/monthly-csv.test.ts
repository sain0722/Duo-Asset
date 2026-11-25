import { describe, expect, it } from "vitest";

import type { HistoryPoint } from "@/lib/data/derive";
import type { MonthReport, Ym } from "@/lib/finance/types";

import { buildMonthlyCsv } from "./monthly-csv";

// 가상의 값
function point(month: Ym, options: { provisional?: boolean; complete?: boolean; isBaseline?: boolean } = {}): HistoryPoint {
  const report = {
    month,
    isBaseline: options.isBaseline ?? false,
    complete: options.complete ?? true,
    income: 5_000_000,
    consumption: 3_000_000,
    savings: 1_500_000,
    savingsRate: 30,
    principalRepaid: 500_000,
    investmentGain: -120_000,
    closing: { assets: 300_000_000, liabilities: 100_000_000, netWorth: 200_000_000 },
  } as unknown as MonthReport;
  return { month, provisional: options.provisional ?? false, report };
}

function lines(csv: string): string[] {
  return csv.slice(1).trimEnd().split("\r\n");
}

describe("buildMonthlyCsv", () => {
  it("BOM 과 머리글로 시작하고 CRLF 로 줄을 나눈다", () => {
    const csv = buildMonthlyCsv([]);
    expect(csv.startsWith("﻿월,상태,수입,")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines(csv)).toHaveLength(1);
  });

  it("마감된 달은 모든 값을 쉼표 없는 정수로 적는다", () => {
    const [, row] = lines(buildMonthlyCsv([point("2026-09")]));
    expect(row).toBe("2026-09,마감,5000000,3000000,1500000,30,500000,-120000,300000000,100000000,200000000");
  });

  it("정산 전인 달은 흐름 지표를 빈칸으로 두고 잔액만 적는다", () => {
    const [, row] = lines(buildMonthlyCsv([point("2026-11", { provisional: true, complete: false })]));
    expect(row).toBe("2026-11,정산 전,,,,,,,300000000,100000000,200000000");
  });

  it("기준 월은 흐름 지표가 없다", () => {
    const [, row] = lines(buildMonthlyCsv([point("2026-05", { isBaseline: true })]));
    expect(row).toBe("2026-05,기준 월,,,,,,,300000000,100000000,200000000");
  });

  it("열려 있지만 확인이 끝난 달은 '마감 전'으로 값을 적는다", () => {
    const [, row] = lines(buildMonthlyCsv([point("2026-10", { provisional: true, complete: true })]));
    expect(row.startsWith("2026-10,마감 전,5000000,")).toBe(true);
  });

  it("저축률이 없으면(수입 0) 빈칸, 실제 0원은 0 으로 적는다", () => {
    const p = point("2026-08");
    const report = { ...p.report, income: 0, consumption: 0, savings: 0, savingsRate: null, principalRepaid: 0, investmentGain: 0 };
    const [, row] = lines(buildMonthlyCsv([{ ...p, report }]));
    expect(row).toBe("2026-08,마감,0,0,0,,0,0,300000000,100000000,200000000");
  });
});
