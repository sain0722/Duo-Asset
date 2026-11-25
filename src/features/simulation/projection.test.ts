import { describe, expect, it } from "vitest";

import { DEFAULT_ASSUMPTIONS, resolveAssumptions } from "@/lib/finance";
import { asset, planItem } from "@/lib/finance/testing";
import type { SimulationPoint } from "@/lib/finance/types";
import { addMonths } from "@/lib/month";

import { horizonRows, plannedMonthlyInvestment, storedAssumptions } from "./projection";

function points(count: number, start = "2026-12", step = 1_000_000): SimulationPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    month: addMonths(start, i),
    cash: 0,
    invested: 0,
    fixed: 0,
    assets: 0,
    liabilities: 0,
    netWorth: (i + 1) * step,
    income: 0,
    consumption: 0,
    savings: 0,
    debtPayment: 0,
  }));
}

describe("n년 뒤 요약", () => {
  it("12n번째 달 말 값을 쓰고, 기간을 넘는 해는 뺀다", () => {
    const rows = horizonRows(points(60), null, [1, 5, 10]);
    expect(rows).toEqual([
      { years: 1, month: "2027-11", netWorth: 12_000_000, diff: null },
      { years: 5, month: "2031-11", netWorth: 60_000_000, diff: null },
    ]);
  });

  it("기본 시나리오와의 차이를 계산한다", () => {
    const [row] = horizonRows(points(12, "2026-12", 2_000_000), points(12), [1]);
    expect(row.diff).toBe(12_000_000);
  });
});

describe("가정 저장", () => {
  it("기본값과 다른 값만 남긴다", () => {
    expect(storedAssumptions(DEFAULT_ASSUMPTIONS)).toEqual({});
    const values = resolveAssumptions({ investReturnPct: 7, monthlyInvestment: 500_000 });
    expect(storedAssumptions(values)).toEqual({ investReturnPct: 7, monthlyInvestment: 500_000 });
  });

  it("월 투자액 0원은 '계획대로'(null)와 다른 값이다", () => {
    expect(storedAssumptions({ ...DEFAULT_ASSUMPTIONS, monthlyInvestment: 0 })).toEqual({ monthlyInvestment: 0 });
  });
});

describe("계획의 월 투자액", () => {
  const stock = asset({ kind: "investment" });
  const pension = asset({ kind: "pension" });
  const savings = asset({ kind: "savings" });

  it("투자·연금 자산으로 가는 저축 항목만 더한다", () => {
    const items = [
      planItem({ kind: "saving", amount: 300_000, asset_id: stock.id }),
      planItem({ kind: "saving", amount: 100_000, asset_id: pension.id }),
      planItem({ kind: "saving", amount: 500_000, asset_id: savings.id }),
      planItem({ kind: "saving", amount: 200_000, asset_id: null }),
      planItem({ kind: "expense", amount: 50_000, asset_id: stock.id }),
      planItem({ kind: "saving", amount: 900_000, asset_id: stock.id, end_month: "2026-10" }),
    ];
    expect(plannedMonthlyInvestment(items, [stock, pension, savings], "2026-11")).toBe(400_000);
  });
});
