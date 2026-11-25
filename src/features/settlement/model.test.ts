import { describe, expect, it } from "vitest";

import { computeMonthReport } from "@/lib/finance";
import { actual, asset, assetSnap, liability, liabilitySnap, member, monthInput, planItem } from "@/lib/finance/testing";

import {
  assetValueChange,
  balanceWithPlannedSaving,
  checklist,
  planComparison,
  plannedSavingsByAsset,
  pocketUsage,
  principalAfter,
  progressOf,
  resultWarnings,
  savingsAchievement,
  scheduledBalance,
} from "./model";

/* 금액은 모두 가상의 값이다. */
function fixture() {
  const a = member("가");
  const b = member("나");
  const cash = asset({ kind: "cash", owner_member_id: a.id });
  const savings = asset({ kind: "savings", owner_member_id: b.id });
  const stock = asset({ kind: "investment", owner_member_id: a.id });
  const loan = liability({ kind: "installment", original_principal: 1_200_000, monthly_payment: 100_000, term_months: 12, payer_member_id: a.id });
  const salary = planItem({ kind: "income", amount: 3_000_000, member_id: a.id });
  const contribution = planItem({ kind: "contribution", amount: 1_000_000, member_id: a.id });
  const saving = planItem({ kind: "saving", amount: 200_000, member_id: b.id, asset_id: savings.id });
  const saving2 = planItem({ kind: "saving", amount: 50_000, member_id: b.id, asset_id: savings.id });
  return { a, b, cash, savings, stock, loan, salary, contribution, saving, saving2 };
}

describe("checklist", () => {
  it("수입·자산·부채·납입 줄을 확인 여부와 함께 순서대로 모은다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash, f.savings],
        liabilities: [f.loan],
        planItems: [f.salary, f.contribution],
        prevAssets: [assetSnap(f.cash, 1_000_000), assetSnap(f.savings, 500_000)],
        prevLiabilities: [liabilitySnap(f.loan, 600_000)],
        curAssets: [assetSnap(f.cash, 1_100_000)],
        entries: [actual(f.salary, 3_000_000)],
      }),
    );
    const items = checklist(report);
    expect(items.map((item) => [item.section, item.done])).toEqual([
      ["income", true],
      ["assets", true],
      ["assets", false],
      ["liabilities", false],
      ["transfers", false],
    ]);
    expect(progressOf(items)).toEqual({ done: 2, total: 5 });
    expect(progressOf(items, "assets")).toEqual({ done: 1, total: 2 });
    // 미확인이 하나라도 있으면 결과도 미완료다
    expect(report.complete).toBe(false);
  });

  it("자산은 화면처럼 주머니 순서로 정렬한다", () => {
    const f = fixture();
    const joint = asset({ kind: "cash", owner_member_id: null });
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [joint, f.savings, f.cash],
        prevAssets: [assetSnap(joint, 1), assetSnap(f.savings, 1), assetSnap(f.cash, 1)],
      }),
    );
    const ids = checklist(report, [f.a.id, f.b.id, "joint"]).map((item) => item.pocket);
    expect(ids).toEqual([f.a.id, f.b.id, "joint"]);
  });

  it("모두 확인하면 report.complete 와 같아진다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash],
        planItems: [f.salary],
        prevAssets: [assetSnap(f.cash, 1_000_000)],
        curAssets: [assetSnap(f.cash, 1_000_000)],
        entries: [actual(f.salary, 0)],
      }),
    );
    const progress = progressOf(checklist(report));
    expect(progress.done).toBe(progress.total);
    expect(report.complete).toBe(true);
  });
});

describe("자산·부채 줄 계산", () => {
  it("연결된 저축 계획을 자산별로 합한다", () => {
    const f = fixture();
    const report = computeMonthReport(monthInput({ members: [f.a, f.b], planItems: [f.saving, f.saving2, f.salary] }));
    expect(plannedSavingsByAsset(report.planLines)).toEqual({ [f.savings.id]: 250_000 });
  });

  it("평가형 자산의 순투입액은 월초 순투입액에 순입금을 더한다 (음수 가능)", () => {
    expect(principalAfter({ openPrincipal: 16_000_000 }, 300_000)).toBe(16_300_000);
    expect(principalAfter({ openPrincipal: 1_000_000 }, -1_500_000)).toBe(-500_000);
  });

  it("예정대로 확인한 잔액과 전월 대비 변화", () => {
    expect(balanceWithPlannedSaving({ openValue: 6_000_000 }, 500_000)).toBe(6_500_000);
    expect(assetValueChange({ value: 900_000, openValue: 1_000_000 })).toBe(-100_000);
  });

  it("부채 예정 잔액은 예정 원금만큼 줄고 0 아래로 내려가지 않는다", () => {
    expect(scheduledBalance({ openBalance: 600_000, plannedPrincipal: 100_000 })).toBe(500_000);
    expect(scheduledBalance({ openBalance: 50_000, plannedPrincipal: 100_000 })).toBe(0);
  });
});

describe("결과", () => {
  it("계획 대비 실적과 달성률", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash],
        planItems: [f.salary, planItem({ kind: "saving", amount: 800_000, member_id: f.a.id, asset_id: f.cash.id })],
        prevAssets: [assetSnap(f.cash, 1_000_000)],
        curAssets: [assetSnap(f.cash, 2_000_000)],
        entries: [actual(f.salary, 3_100_000)],
      }),
    );
    const rows = planComparison(report);
    const income = rows.find((row) => row.key === "income")!;
    expect(income).toMatchObject({ planned: 3_000_000, actual: 3_100_000, diff: 100_000 });
    const savings = rows.find((row) => row.key === "savings")!;
    expect(savings.actual).toBe(1_000_000);
    expect(savings.diff).toBe(savings.actual - savings.planned);
    expect(report.plan.savings).toBe(800_000);
    expect(savingsAchievement(report)).toBe(125);
  });

  it("계획 저축·계획 소비가 0이면 비율을 만들지 않는다", () => {
    expect(pocketUsage({ consumption: 100, plannedConsumption: 0 })).toBeNull();
    expect(pocketUsage({ consumption: 50, plannedConsumption: 200 })).toBe(25);
  });

  it("미확인 경고는 결과 경고에서 뺀다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash],
        prevAssets: [assetSnap(f.cash, 1_000_000)],
        curAssets: [assetSnap(f.cash, 3_000_000)],
      }),
    );
    // 수입 없이 잔액만 늘면 소비가 음수 → 경고
    expect(resultWarnings(report).map((w) => w.code)).toContain("negative_consumption");
    expect(resultWarnings(report).every((w) => !w.code.startsWith("unconfirmed_"))).toBe(true);
  });
});
