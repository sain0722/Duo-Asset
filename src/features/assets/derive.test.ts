import { describe, expect, it } from "vitest";

import type { HistoryPoint } from "@/lib/data/derive";
import type { Asset, AssetLine, MonthReport } from "@/lib/finance/types";

import {
  assetHistory,
  compositionHistory,
  compositionOf,
  daysUntil,
  ddayLabel,
  disposalSnapshot,
  groupAssets,
  positionChange,
  valuationOf,
} from "./derive";

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: "a",
    household_id: "h",
    name: "자산",
    kind: "cash",
    owner_member_id: null,
    liquidity: "liquid",
    maturity_date: null,
    memo: "",
    is_active: true,
    sort_order: 0,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function line(overrides: Partial<AssetLine>): AssetLine {
  return {
    assetId: "a",
    name: "자산",
    kind: "cash",
    pocket: "joint",
    liquidity: "liquid",
    openValue: 0,
    openPrincipal: 0,
    value: 0,
    principal: 0,
    contributed: 0,
    gain: 0,
    adjustment: 0,
    confirmed: true,
    ...overrides,
  };
}

function point(month: string, report: Partial<MonthReport>, provisional = false): HistoryPoint {
  const closing = { assets: 0, liabilities: 0, netWorth: 0, liquid: 0, financial: 0, byKind: {} };
  return { month, provisional, report: { isBaseline: false, assetLines: [], closing, ...report } as MonthReport };
}

describe("valuationOf", () => {
  it("평가손익 = 평가금액 − 순투입액, 수익률은 순투입액 대비", () => {
    expect(valuationOf(18_500_000, 16_000_000)).toEqual({ gain: 2_500_000, rate: 15.6 });
    expect(valuationOf(24_000_000, 32_000_000)).toEqual({ gain: -8_000_000, rate: -25 });
  });

  it("순투입액이 0 이하이면 수익률을 계산하지 않는다", () => {
    expect(valuationOf(1_000_000, 0).rate).toBeNull();
    expect(valuationOf(1_000_000, -500_000).rate).toBeNull();
  });
});

describe("만기", () => {
  it("날짜 차이를 일수로", () => {
    expect(daysUntil("2026-12-25", "2026-11-25")).toBe(30);
    expect(daysUntil("2027-03-01", "2027-02-28")).toBe(1);
    expect(daysUntil("2026-11-20", "2026-11-25")).toBe(-5);
  });

  it("D-day 표기", () => {
    expect(ddayLabel(30)).toBe("D-30");
    expect(ddayLabel(0)).toBe("D-day");
    expect(ddayLabel(-5)).toBe("D+5");
  });
});

describe("compositionOf", () => {
  it("유형을 고정된 6묶음으로 합치고 비율을 구한다", () => {
    const parts = compositionOf({ cash: 3_000_000, deposit: 2_000_000, investment: 5_000_000, vehicle: 10_000_000 });
    expect(parts.map((p) => p.id)).toEqual(["cash", "investment", "pension", "housing", "lease", "other"]);
    expect(parts[0]).toMatchObject({ amount: 5_000_000, percent: 25, index: 0 });
    expect(parts[2]).toMatchObject({ amount: 0, percent: 0 });
    expect(parts[5]).toMatchObject({ amount: 10_000_000, percent: 50 });
  });

  it("음수 묶음은 비율의 분모에서 빼고, 자산이 없으면 비율이 없다", () => {
    const parts = compositionOf({ cash: -1_000_000, investment: 4_000_000 });
    expect(parts[0].percent).toBe(0);
    expect(parts[1].percent).toBe(100);
    expect(compositionOf({}).every((p) => p.percent === null)).toBe(true);
  });

  it("월별 구성", () => {
    const rows = compositionHistory([
      point("2026-10", { closing: { assets: 0, liabilities: 0, netWorth: 0, liquid: 0, financial: 0, byKind: { cash: 100, pension: 50 } } }),
    ]);
    expect(rows).toEqual([{ month: "2026-10", cash: 100, investment: 0, pension: 50, housing: 0, lease: 0, other: 0 }]);
  });
});

describe("groupAssets", () => {
  const assets = [
    asset({ id: "s", kind: "investment", owner_member_id: "m1", sort_order: 2 }),
    asset({ id: "c1", kind: "cash", owner_member_id: "m1", sort_order: 1 }),
    asset({ id: "c2", kind: "cash", owner_member_id: null, sort_order: 0 }),
    asset({ id: "old", kind: "deposit", owner_member_id: null, is_active: false }),
  ];
  const lines = [
    line({ assetId: "s", value: 500 }),
    line({ assetId: "c1", value: 100 }),
    line({ assetId: "c2", value: 300 }),
  ];

  it("유형 순서로 묶고 묶음 합계를 낸다. 보관 자산은 따로", () => {
    const { groups, archived } = groupAssets(assets, lines, "all");
    expect(groups.map((g) => [g.kind, g.total, g.rows.map((r) => r.asset.id)])).toEqual([
      ["cash", 400, ["c2", "c1"]],
      ["investment", 500, ["s"]],
    ]);
    expect(archived.map((r) => [r.asset.id, r.line])).toEqual([["old", null]]);
  });

  it("주머니로 거른다 (공동은 joint)", () => {
    expect(groupAssets(assets, lines, "m1").groups.map((g) => g.total)).toEqual([100, 500]);
    const joint = groupAssets(assets, lines, "joint");
    expect(joint.groups.map((g) => g.rows.map((r) => r.asset.id))).toEqual([["c2"]]);
    expect(joint.archived).toHaveLength(1);
  });
});

describe("assetHistory", () => {
  it("그 자산이 있는 달만 오름차순으로", () => {
    const rows = assetHistory(
      [
        point("2026-09", { isBaseline: true, assetLines: [] }),
        point("2026-10", { assetLines: [line({ assetId: "a", value: 110, principal: 100, contributed: 100, gain: 10 })] }),
        point("2026-11", { assetLines: [line({ assetId: "a", value: 110, principal: 100, confirmed: false })] }, true),
      ],
      "a",
    );
    expect(rows.map((r) => [r.month, r.value, r.confirmed, r.provisional])).toEqual([
      ["2026-10", 110, true, false],
      ["2026-11", 110, false, true],
    ]);
  });
});

describe("positionChange", () => {
  const totals = (assets: number) => ({ assets, liabilities: 0, netWorth: assets, liquid: 0, financial: 0, byKind: {} });
  it("비교 기준 달 말 대비", () => {
    expect(positionChange({ totals: totals(130), compare: { totals: totals(100), since: "2026-09" } }, (t) => t.assets)).toEqual({
      amount: 30,
      since: "2026-09",
    });
  });
  it("비교할 달이 없으면 null", () => {
    expect(positionChange({ totals: totals(130), compare: null }, (t) => t.assets)).toBeNull();
    expect(positionChange(null, (t) => t.assets)).toBeNull();
  });
});

describe("disposalSnapshot", () => {
  it("평가형: 받은 금액만큼 순투입액을 줄이고, 차액은 평가 변동", () => {
    // 월초 평가 1,850만 / 순투입 1,600만, 1,900만 원에 매도
    const snapshot = disposalSnapshot(
      "investment",
      { openValue: 18_500_000, openPrincipal: 16_000_000, principal: 16_000_000, contributed: 0 },
      19_000_000,
    );
    expect(snapshot).toEqual({ value: 0, principal: -3_000_000, gain: 500_000 });
  });

  it("이번 달에 더 넣은 돈은 순투입으로 남는다", () => {
    const snapshot = disposalSnapshot(
      "investment",
      { openValue: 10_000_000, openPrincipal: 10_000_000, principal: 10_300_000, contributed: 300_000 },
      10_300_000,
    );
    expect(snapshot).toEqual({ value: 0, principal: 0, gain: 0 });
  });

  it("잔액형: 평가금액·순투입액 모두 0", () => {
    expect(
      disposalSnapshot("deposit", { openValue: 10_000_000, openPrincipal: 10_000_000, principal: 10_000_000, contributed: 0 }, 10_120_000),
    ).toEqual({ value: 0, principal: 0, gain: 0 });
  });
});
