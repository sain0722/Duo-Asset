import { describe, expect, it } from "vitest";

import { computeMonthReport, summarizePlan } from "@/lib/finance";
import { actual, asset, assetSnap, entry, member, monthInput, planItem } from "@/lib/finance/testing";

import { jointHistory, jointMonthSummary } from "./joint-summary";

/* 가상의 값: 두 사람이 공용통장에 넣고, 공동지출 후 일부를 공동 적금으로 옮긴다. */
function scenario(options: { confirmAll: boolean }) {
  const a = member("가람");
  const b = member("나래");
  const jointCash = asset({ kind: "cash", name: "공용통장" });
  const jointSavings = asset({ kind: "savings", name: "공동 적금" });
  const aCash = asset({ kind: "cash", owner_member_id: a.id });
  const bCash = asset({ kind: "cash", owner_member_id: b.id });

  const aIncome = planItem({ kind: "income", amount: 3_000_000, member_id: a.id, income_type: "salary" });
  const bIncome = planItem({ kind: "income", amount: 2_000_000, member_id: b.id, income_type: "salary" });
  const aIn = planItem({ kind: "contribution", amount: 1_500_000, member_id: a.id });
  const bIn = planItem({ kind: "contribution", amount: 1_000_000, member_id: b.id });
  const rent = planItem({ kind: "expense", amount: 700_000, name: "관리비" });
  const living = planItem({ kind: "expense", amount: 1_000_000, name: "생활비" });
  const toSavings = planItem({ kind: "saving", amount: 500_000, asset_id: jointSavings.id });

  const input = monthInput({
    members: [a, b],
    assets: [jointCash, jointSavings, aCash, bCash],
    planItems: [aIncome, bIncome, aIn, bIn, rent, living, toSavings],
    prevAssets: [assetSnap(jointCash, 2_000_000), assetSnap(jointSavings, 5_000_000), assetSnap(aCash, 1_000_000), assetSnap(bCash, 1_000_000)],
    curAssets: [
      // 입금 250만 − 관리비 70만 − 생활비 105만 − 적금 50만 − 개인에게 보낸 5만 = +20만
      assetSnap(jointCash, 2_200_000),
      assetSnap(jointSavings, 5_500_000),
      ...(options.confirmAll ? [assetSnap(aCash, 1_600_000), assetSnap(bCash, 1_050_000)] : []),
    ],
    entries: [
      actual(aIncome, 3_000_000),
      actual(bIncome, 2_000_000),
      actual(aIn, 1_500_000),
      ...(options.confirmAll ? [actual(bIn, 1_000_000)] : []),
      actual(rent, 700_000),
      entry({ kind: "transfer", amount: 50_000, member_id: null, to_member_id: b.id, name: "경조사비 정산" }),
    ],
  });
  const report = computeMonthReport(input);
  const plan = summarizePlan(input.month, [a, b], input.planLines);
  return { a, b, report, plan };
}

describe("jointMonthSummary", () => {
  it("공용통장 입금과 적금 이동을 소비와 분리한다", () => {
    const { a, b, report, plan } = scenario({ confirmAll: true });
    const summary = jointMonthSummary(report, plan.joint, [a.id, b.id]);

    expect(summary.complete).toBe(true);
    expect(summary.contributions).toEqual([
      { pocket: a.id, planned: 1_500_000, actual: 1_500_000 },
      { pocket: b.id, planned: 1_000_000, actual: 1_000_000 },
    ]);
    expect(summary.actualContributions).toBe(2_500_000);
    expect(summary.openingBalance).toBe(2_000_000);
    expect(summary.closingBalance).toBe(2_200_000);

    const flows = summary.flows!;
    expect(flows.movedToAssets).toBe(500_000);
    expect(flows.transfersOut).toBe(50_000);
    expect(flows.movedOut).toBe(550_000);
    // 공동저축 = 공용통장 증가 20만 + 적금 50만
    expect(flows.savings).toBe(700_000);
    // 공동 소비 = 입금 250만 − 나간 이동 5만 − 자산 순투입 70만
    expect(flows.consumption).toBe(1_750_000);
    expect(flows.classified).toBe(700_000);
    expect(flows.unclassified).toBe(1_050_000);
    expect(flows.otherInflow).toBe(0);

    // 공용통장 잔액 변화 = 입금 − 소비 − 다른 계좌로 이동 − 원금
    expect(summary.closingBalance! - summary.openingBalance).toBe(
      summary.actualContributions! + flows.otherInflow - flows.consumption - flows.movedOut - flows.principalPaid,
    );

    expect(summary.plan).toEqual({
      inflow: 2_500_000,
      consumption: 1_700_000,
      principal: 0,
      designatedSavings: 500_000,
      savings: 800_000,
    });
  });

  it("미확인 납입은 0원으로 채우지 않는다", () => {
    const { a, b, report, plan } = scenario({ confirmAll: false });
    const summary = jointMonthSummary(report, plan.joint, [a.id, b.id]);

    expect(summary.complete).toBe(false);
    expect(summary.contributions[1]).toEqual({ pocket: b.id, planned: 1_000_000, actual: null });
    expect(summary.actualContributions).toBeNull();
    // 공용통장 자체는 확인했으므로 잔액은 보여 줄 수 있다
    expect(summary.closingBalance).toBe(2_200_000);
  });

  it("기준 월은 흐름을 계산하지 않는다", () => {
    const a = member("가람");
    const jointCash = asset({ kind: "cash" });
    const input = monthInput({ isBaseline: true, members: [a], assets: [jointCash], curAssets: [assetSnap(jointCash, 900_000)] });
    const report = computeMonthReport(input);
    const summary = jointMonthSummary(report, summarizePlan(input.month, [a], input.planLines).joint, [a.id]);

    expect(summary.flows).toBeNull();
    expect(summary.actualContributions).toBeNull();
    expect(summary.closingBalance).toBe(900_000);
  });

  it("공용통장 잔액을 확인하지 않았으면 월말 잔액은 미확인이다", () => {
    const a = member("가람");
    const jointCash = asset({ kind: "cash" });
    const input = monthInput({ members: [a], assets: [jointCash], prevAssets: [assetSnap(jointCash, 900_000)] });
    const report = computeMonthReport(input);
    const summary = jointMonthSummary(report, summarizePlan(input.month, [a], input.planLines).joint, [a.id]);

    expect(summary.openingBalance).toBe(900_000);
    expect(summary.closingBalance).toBeNull();
  });
});

describe("jointHistory", () => {
  it("정산 전인 달의 흐름은 비우고 잔액은 확인된 값만 남긴다", () => {
    const done = scenario({ confirmAll: true }).report;
    const pending = scenario({ confirmAll: false }).report;
    const rows = jointHistory(
      [
        { month: "2026-02", provisional: false, report: { ...done, month: "2026-02" } },
        { month: "2026-03", provisional: false, report: done },
        { month: "2026-04", provisional: true, report: { ...pending, month: "2026-04" } },
      ],
      2,
    );

    expect(rows).toEqual([
      { month: "2026-03", contributions: 2_500_000, consumption: 1_750_000, savings: 700_000, closingBalance: 2_200_000 },
      { month: "2026-04", contributions: null, consumption: null, savings: null, closingBalance: 2_200_000 },
    ]);
  });
});
