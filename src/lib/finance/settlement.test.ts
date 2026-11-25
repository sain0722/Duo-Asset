import { describe, expect, it } from "vitest";
import { balanceTotals, computeMonthReport, percentOf } from "./settlement";
import {
  actual,
  asset,
  assetSnap,
  entry,
  liability,
  liabilitySnap,
  member,
  monthInput,
  planItem,
} from "./testing";
import type { MonthReport } from "./types";
import { JOINT } from "./types";

/** 어떤 입력에서도 성립해야 하는 항등식 (docs/finance-rules.md 4절) */
function expectIdentities(report: MonthReport) {
  expect(report.netWorthChange).toBe(
    report.savings + report.principalRepaid + report.investmentGain + report.otherValuation + report.adjustment,
  );
  expect(report.income).toBe(report.consumption + report.savings + report.principalRepaid);
  const contributed = report.assetLines.reduce((total, line) => total + line.contributed, 0);
  expect(report.savings).toBe(contributed - report.newBorrowing);
  if (!report.isBaseline) {
    expect(report.pockets.reduce((total, p) => total + p.consumption, 0)).toBe(report.consumption);
  }
  expect(report.closing.netWorth - report.opening.netWorth).toBe(report.netWorthChange);
}

/** 가상의 부부. 금액은 예시다. */
function household() {
  const haneul = member("하늘");
  const bada = member("바다");

  const hAccount = asset({ kind: "cash", owner_member_id: haneul.id, name: "하늘 통장" });
  const bAccount = asset({ kind: "cash", owner_member_id: bada.id, name: "바다 통장" });
  const jointAccount = asset({ kind: "cash", name: "공용통장" });
  const bSavings = asset({ kind: "savings", owner_member_id: bada.id, name: "바다 적금" });
  const stock = asset({ kind: "investment", owner_member_id: haneul.id, name: "증권 계좌" });
  const car = asset({ kind: "vehicle", owner_member_id: haneul.id, name: "자동차", liquidity: "locked" });

  const carLoan = liability({
    kind: "installment",
    name: "자동차 할부",
    payer_member_id: haneul.id,
    original_principal: 24_000_000,
    monthly_payment: 400_000,
    term_months: 60,
    start_month: "2025-05",
  });
  const parentsLoan = liability({
    kind: "interest_only",
    name: "부모님 차용금",
    payer_member_id: haneul.id,
    original_principal: 30_000_000,
    monthly_payment: 400_000,
  });

  const hSalary = planItem({ kind: "income", amount: 4_200_000, member_id: haneul.id, name: "하늘 급여" });
  const hBenefit = planItem({ kind: "benefit", amount: 300_000, member_id: haneul.id, name: "식비 카드" });
  const hContribution = planItem({ kind: "contribution", amount: 2_000_000, member_id: haneul.id });
  const bSalary = planItem({ kind: "income", amount: 3_000_000, member_id: bada.id, name: "바다 급여" });
  const bContribution = planItem({ kind: "contribution", amount: 1_500_000, member_id: bada.id });
  const bSaving = planItem({ kind: "saving", amount: 500_000, member_id: bada.id, asset_id: bSavings.id });
  const living = planItem({ kind: "expense", amount: 1_800_000, name: "공동생활비" });

  const prevAssets = [
    assetSnap(hAccount, 1_000_000),
    assetSnap(bAccount, 800_000),
    assetSnap(jointAccount, 2_000_000),
    assetSnap(bSavings, 3_000_000),
    assetSnap(stock, 10_000_000, 9_000_000),
    assetSnap(car, 20_000_000, 30_000_000),
  ];
  const prevLiabilities = [liabilitySnap(carLoan, 20_000_000), liabilitySnap(parentsLoan, 30_000_000)];

  return {
    haneul,
    bada,
    hAccount,
    bAccount,
    jointAccount,
    bSavings,
    stock,
    car,
    carLoan,
    parentsLoan,
    hSalary,
    hBenefit,
    hContribution,
    bSalary,
    bContribution,
    bSaving,
    living,
    members: [haneul, bada],
    assets: [hAccount, bAccount, jointAccount, bSavings, stock, car],
    liabilities: [carLoan, parentsLoan],
    planItems: [hSalary, hBenefit, hContribution, bSalary, bContribution, bSaving, living],
    prevAssets,
    prevLiabilities,
  };
}

/** 한 달을 계획과 비슷하게 보낸 경우의 실제 입력 */
function typicalMonth(h: ReturnType<typeof household>) {
  return monthInput({
    members: h.members,
    assets: h.assets,
    liabilities: h.liabilities,
    planItems: h.planItems,
    prevAssets: h.prevAssets,
    prevLiabilities: h.prevLiabilities,
    curAssets: [
      // 하늘: +급여 420 −공용 200 −할부 40 −부모님 40 −주식 추가매수 30 −개인 지출 90 = +20
      assetSnap(h.hAccount, 1_200_000),
      // 바다: +급여 300 −공용 150 −적금 50 −개인 지출 70 = +30
      assetSnap(h.bAccount, 1_100_000),
      // 공용: +350 −공동 지출 190 = +160
      assetSnap(h.jointAccount, 3_600_000),
      assetSnap(h.bSavings, 3_500_000),
      assetSnap(h.stock, 10_800_000, 9_300_000),
      assetSnap(h.car, 19_700_000, 30_000_000),
    ],
    curLiabilities: [
      liabilitySnap(h.carLoan, 19_600_000),
      liabilitySnap(h.parentsLoan, 30_000_000, { interest_paid: 400_000 }),
    ],
    entries: [
      actual(h.hSalary, 4_200_000),
      actual(h.bSalary, 3_000_000),
      actual(h.hContribution, 2_000_000),
      actual(h.bContribution, 1_500_000),
    ],
  });
}

describe("월 정산: 기본 흐름", () => {
  const h = household();
  const report = computeMonthReport(typicalMonth(h));

  it("수입·소비·저축·원금상환을 잔액 변화에서 계산한다", () => {
    expect(report.complete).toBe(true);
    expect(report.income).toBe(7_200_000);
    expect(report.consumption).toBe(3_900_000);
    expect(report.principalRepaid).toBe(400_000);
    expect(report.newBorrowing).toBe(0);
    expect(report.savings).toBe(2_900_000);
    expect(report.savingsRate).toBe(40.3);
    expectIdentities(report);
  });

  it("투자 평가손익과 자동차 감가는 저축과 분리된다", () => {
    expect(report.investmentGain).toBe(500_000);
    expect(report.otherValuation).toBe(-300_000);
    expect(report.netWorthChange).toBe(3_500_000);
  });

  it("개인 지출과 공동 지출이 주머니별로 나뉜다", () => {
    const pocket = (id: string) => report.pockets.find((p) => p.pocket === id)!;
    // 자동차 할부 원금은 하늘 주머니의 원금 상환일 뿐 소비가 아니고, 공동 소비에도 섞이지 않는다
    expect(pocket(h.haneul.id).principalPaid).toBe(400_000);
    expect(pocket(h.haneul.id).consumption).toBe(1_300_000);
    expect(pocket(h.bada.id).consumption).toBe(700_000);
    expect(pocket(JOINT).consumption).toBe(1_900_000);
    expect(pocket(JOINT).principalPaid).toBe(0);
  });

  it("확인된 지출만 분류하고 나머지는 미분류로 남긴다", () => {
    const haneul = report.pockets.find((p) => p.pocket === h.haneul.id)!;
    // 부모님께 드린 40만 원(원금 미상환 차용금 지급)은 확인된 지출
    expect(haneul.classified).toBe(400_000);
    expect(haneul.unclassified).toBe(900_000);
    const joint = report.pockets.find((p) => p.pocket === JOINT)!;
    expect(joint.classified).toBe(0);
    expect(joint.unclassified).toBe(1_900_000);
    expect(joint.plannedConsumption).toBe(1_800_000);
  });

  it("비현금 복지는 수입에 포함하지 않는다", () => {
    expect(report.plan.benefits).toBe(300_000);
    expect(report.plan.income).toBe(7_200_000);
    expect(report.incomeLines.some((line) => line.name === "식비 카드")).toBe(false);
  });

  it("원금 미상환 차용금은 잔액이 그대로이고 지급액은 소비다", () => {
    const line = report.liabilityLines.find((l) => l.liabilityId === h.parentsLoan.id)!;
    expect(line.principalPaid).toBe(0);
    expect(line.plannedPrincipal).toBe(0);
    expect(line.plannedInterest).toBe(400_000);
    expect(line.interestPaid).toBe(400_000);
    expect(report.closing.liabilities).toBe(49_600_000);
  });
});

describe("월 정산: 내부 이동", () => {
  it("같은 주머니 안에서 계좌를 옮겨도 총자산·소비·저축은 변하지 않는다", () => {
    const h = household();
    const before = computeMonthReport(typicalMonth(h));
    // 하늘 통장에서 증권 계좌로 50만 원을 더 옮긴 경우
    const input = typicalMonth(h);
    input.assetSnapshots = input.assetSnapshots.map((s) => {
      if (s.asset_id === h.hAccount.id) return { ...s, value: s.value - 500_000, principal: s.principal - 500_000 };
      if (s.asset_id === h.stock.id) return { ...s, value: s.value + 500_000, principal: s.principal + 500_000 };
      return s;
    });
    const after = computeMonthReport(input);
    expect(after.closing.assets).toBe(before.closing.assets);
    expect(after.consumption).toBe(before.consumption);
    expect(after.savings).toBe(before.savings);
    expect(after.investmentGain).toBe(before.investmentGain);
    expectIdentities(after);
  });

  it("공용통장 납입은 소비가 아니다: 납입액이 달라져도 가구 소비는 같다", () => {
    const h = household();
    const before = computeMonthReport(typicalMonth(h));
    // 하늘이 공용통장에 30만 원을 더 넣었다
    const input = typicalMonth(h);
    input.assetSnapshots = input.assetSnapshots.map((s) => {
      if (s.asset_id === h.hAccount.id) return { ...s, value: s.value - 300_000, principal: s.principal - 300_000 };
      if (s.asset_id === h.jointAccount.id) return { ...s, value: s.value + 300_000, principal: s.principal + 300_000 };
      return s;
    });
    input.entries = input.entries.map((e) =>
      e.plan_item_id === h.hContribution.id ? { ...e, amount: 2_300_000 } : e,
    );
    const after = computeMonthReport(input);
    expect(after.consumption).toBe(before.consumption);
    expect(after.savings).toBe(before.savings);
    expect(after.closing.assets).toBe(before.closing.assets);
    // 주머니별 소비도 그대로
    for (const pocket of before.pockets) {
      expect(after.pockets.find((p) => p.pocket === pocket.pocket)!.consumption).toBe(pocket.consumption);
    }
    expectIdentities(after);
  });

  it("적금 납입은 자산 간 이동이라 한 번만 집계된다", () => {
    const h = household();
    const report = computeMonthReport(typicalMonth(h));
    const savings = report.assetLines.find((l) => l.assetId === h.bSavings.id)!;
    expect(savings.contributed).toBe(500_000);
    expect(savings.gain).toBe(0);
    // 적금 50만 원은 바다의 소비에 들어가지 않는다
    expect(report.pockets.find((p) => p.pocket === h.bada.id)!.consumption).toBe(700_000);
    expect(report.closing.assets).toBe(39_900_000);
  });

  it("주머니 간 이동을 기록하면 가구 합계는 그대로, 주머니별 소비만 바뀐다", () => {
    const h = household();
    const input = typicalMonth(h);
    // 공용통장에서 바다 적금으로 20만 원을 옮겼는데 이동을 기록하지 않은 경우
    input.assetSnapshots = input.assetSnapshots.map((s) => {
      if (s.asset_id === h.jointAccount.id) return { ...s, value: s.value - 200_000, principal: s.principal - 200_000 };
      if (s.asset_id === h.bSavings.id) return { ...s, value: s.value + 200_000, principal: s.principal + 200_000 };
      return s;
    });
    const missing = computeMonthReport(input);
    expect(missing.consumption).toBe(3_900_000);
    expect(missing.pockets.find((p) => p.pocket === JOINT)!.consumption).toBe(2_100_000);
    expect(missing.pockets.find((p) => p.pocket === h.bada.id)!.consumption).toBe(500_000);

    // 이동을 기록하면 주머니별 소비가 바로잡힌다
    input.entries.push(entry({ kind: "transfer", amount: 200_000, member_id: null, to_member_id: h.bada.id }));
    const recorded = computeMonthReport(input);
    expect(recorded.consumption).toBe(3_900_000);
    expect(recorded.pockets.find((p) => p.pocket === JOINT)!.consumption).toBe(1_900_000);
    expect(recorded.pockets.find((p) => p.pocket === h.bada.id)!.consumption).toBe(700_000);
    expectIdentities(recorded);
  });
});

describe("월 정산: 부채", () => {
  it("원금 상환은 현금과 부채를 함께 줄이고 순자산은 그대로다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const loan = liability({ kind: "installment", original_principal: 10_000_000, monthly_payment: 1_000_000, payer_member_id: m.id });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account],
        liabilities: [loan],
        prevAssets: [assetSnap(account, 5_000_000)],
        prevLiabilities: [liabilitySnap(loan, 10_000_000)],
        curAssets: [assetSnap(account, 4_000_000)],
        curLiabilities: [liabilitySnap(loan, 9_000_000)],
      }),
    );
    expect(report.netWorthChange).toBe(0);
    expect(report.consumption).toBe(0);
    expect(report.principalRepaid).toBe(1_000_000);
    // 현금이 줄었으므로 저축액은 −100만, 원금 상환 +100만 → 순자산 변화 0
    expect(report.savings).toBe(-1_000_000);
    expectIdentities(report);
  });

  it("이자는 소비지출이고 순자산을 줄인다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const loan = liability({
      kind: "amortized",
      original_principal: 100_000_000,
      annual_rate: 4.8,
      term_months: 240,
      start_month: "2026-01",
      payer_member_id: m.id,
    });
    const salary = planItem({ kind: "income", amount: 5_000_000, member_id: m.id });
    // 이자 40만 + 원금 25만을 내고 나머지는 통장에 남았다
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account],
        liabilities: [loan],
        planItems: [salary],
        prevAssets: [assetSnap(account, 1_000_000)],
        prevLiabilities: [liabilitySnap(loan, 100_000_000)],
        curAssets: [assetSnap(account, 5_350_000)],
        curLiabilities: [liabilitySnap(loan, 99_750_000, { interest_paid: 400_000 })],
        entries: [actual(salary, 5_000_000)],
      }),
    );
    expect(report.consumption).toBe(400_000);
    expect(report.principalRepaid).toBe(250_000);
    expect(report.savings).toBe(4_350_000);
    expect(report.netWorthChange).toBe(4_600_000);
    expect(report.pockets[0].classified).toBe(400_000);
    expect(report.pockets[0].unclassified).toBe(0);
    expectIdentities(report);
  });

  it("대출로 자산을 취득하면 저축액은 변하지 않는다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const home = asset({ kind: "real_estate", name: "아파트", liquidity: "locked" });
    const mortgage = liability({ kind: "amortized", original_principal: 200_000_000, annual_rate: 4, term_months: 360, start_month: "2026-04" });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, home],
        liabilities: [mortgage],
        prevAssets: [assetSnap(account, 60_000_000)],
        // 잔금 2.5억: 대출 2억 + 현금 5천
        curAssets: [assetSnap(account, 10_000_000), assetSnap(home, 250_000_000)],
        curLiabilities: [liabilitySnap(mortgage, 200_000_000)],
      }),
    );
    expect(report.newBorrowing).toBe(200_000_000);
    expect(report.savings).toBe(0);
    expect(report.consumption).toBe(0);
    expect(report.netWorthChange).toBe(0);
    expectIdentities(report);
  });

  it("대환·입주처럼 한 대출을 갚고 다른 대출을 받는 달에도 저축액이 튀지 않는다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const presale = asset({ kind: "presale", liquidity: "locked" });
    const home = asset({ kind: "real_estate", liquidity: "locked" });
    const bridge = liability({ kind: "bullet", name: "중도금 대출", original_principal: 180_000_000, annual_rate: 4, term_months: 24, start_month: "2024-06" });
    const mortgage = liability({ kind: "amortized", name: "주택담보대출", original_principal: 250_000_000, annual_rate: 4, term_months: 360, start_month: "2026-04" });
    const salary = planItem({ kind: "income", amount: 7_000_000, member_id: m.id });
    // 입주: 중도금 대출 1.8억 상환, 주담대 2.5억 실행, 잔금 1억 납부. 평소처럼 400만 원 쓰고 300만 원 남겼다.
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, presale, home],
        liabilities: [bridge, mortgage],
        planItems: [salary],
        prevAssets: [assetSnap(account, 40_000_000), assetSnap(presale, 300_000_000)],
        prevLiabilities: [liabilitySnap(bridge, 180_000_000)],
        // 현금: +700 수입 −400 소비 +2.5억 대출 −1.8억 상환 −1억 잔금 = 4,000 + 300 − 3,000
        curAssets: [assetSnap(account, 13_000_000), assetSnap(presale, 0), assetSnap(home, 400_000_000)],
        curLiabilities: [liabilitySnap(bridge, 0), liabilitySnap(mortgage, 250_000_000)],
        entries: [actual(salary, 7_000_000)],
      }),
    );
    expect(report.consumption).toBe(4_000_000);
    expect(report.savings).toBe(3_000_000);
    // 부채는 순액으로: 2.5억 − 1.8억 = 7,000만 원 순차입
    expect(report.principalRepaid).toBe(0);
    expect(report.newBorrowing).toBe(70_000_000);
    expect(report.netWorthChange).toBe(3_000_000);
    // 부채별 줄에는 각각의 변화가 그대로 보인다
    expect(report.liabilityLines.find((l) => l.liabilityId === bridge.id)!.principalPaid).toBe(180_000_000);
    expect(report.liabilityLines.find((l) => l.liabilityId === mortgage.id)!.principalPaid).toBe(-250_000_000);
    expectIdentities(report);
  });

  it("빌린 돈을 써 버리면 소비가 늘고 저축은 음수가 된다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const loan = liability({ kind: "bullet", original_principal: 3_000_000, annual_rate: 5, term_months: 12, start_month: "2026-04", payer_member_id: m.id });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account],
        liabilities: [loan],
        prevAssets: [assetSnap(account, 1_000_000)],
        curAssets: [assetSnap(account, 1_000_000)],
        curLiabilities: [liabilitySnap(loan, 3_000_000)],
      }),
    );
    expect(report.consumption).toBe(3_000_000);
    expect(report.savings).toBe(-3_000_000);
    expect(report.netWorthChange).toBe(-3_000_000);
    expectIdentities(report);
  });
});

describe("월 정산: 투자자산", () => {
  const m = member("하늘");
  const account = asset({ kind: "cash", owner_member_id: m.id });
  const stock = asset({ kind: "investment", owner_member_id: m.id });
  const run = (curStock: [number, number], curCash: number) =>
    computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, stock],
        prevAssets: [assetSnap(account, 2_000_000), assetSnap(stock, 12_000_000, 10_000_000)],
        curAssets: [assetSnap(account, curCash), assetSnap(stock, curStock[0], curStock[1])],
      }),
    );

  it("평가금액만 오르면 평가손익이고 저축이 아니다", () => {
    const report = run([13_000_000, 10_000_000], 2_000_000);
    expect(report.investmentGain).toBe(1_000_000);
    expect(report.savings).toBe(0);
    expect(report.consumption).toBe(0);
    expectIdentities(report);
  });

  it("전량 매도해 인출하면 순투입액이 인출액만큼 줄고 저축·소비는 0이다", () => {
    // 1,200만 원에 팔아 통장으로: 순투입 1,000 − 1,200 = −200
    const report = run([0, -2_000_000], 14_000_000);
    expect(report.investmentGain).toBe(0);
    expect(report.savings).toBe(0);
    expect(report.consumption).toBe(0);
    expect(report.netWorthChange).toBe(0);
    expectIdentities(report);
  });

  it("손실이 나면 평가손익이 음수이고 저축에는 영향이 없다", () => {
    const report = run([9_000_000, 10_000_000], 2_000_000);
    expect(report.investmentGain).toBe(-3_000_000);
    expect(report.savings).toBe(0);
    expectIdentities(report);
  });
});

describe("월 정산: 미확인·기준 월·기초 조정·보관", () => {
  it("스냅샷이 없는 자산은 전월 값으로 가정하고 미확인으로 표시한다", () => {
    const h = household();
    const input = typicalMonth(h);
    input.assetSnapshots = input.assetSnapshots.filter((s) => s.asset_id !== h.stock.id);
    const report = computeMonthReport(input);
    expect(report.complete).toBe(false);
    const line = report.assetLines.find((l) => l.assetId === h.stock.id)!;
    expect(line.confirmed).toBe(false);
    expect(line.value).toBe(10_000_000);
    expect(report.warnings.some((w) => w.code === "unconfirmed_asset")).toBe(true);
    expectIdentities(report);
  });

  it("실제 0원과 미확인을 구분한다", () => {
    const h = household();
    const input = typicalMonth(h);
    // 바다 급여: 실제 값을 지운 경우(미확인) → 계획 금액을 잠정값으로 쓰고 미완료
    input.entries = input.entries.filter((e) => e.plan_item_id !== h.bSalary.id);
    const unconfirmed = computeMonthReport(input);
    expect(unconfirmed.complete).toBe(false);
    expect(unconfirmed.incomeLines.find((l) => l.key === h.bSalary.id)!.actual).toBeNull();
    expect(unconfirmed.income).toBe(7_200_000);

    // 바다 급여: 실제 0원 → 확정된 값으로 계산
    input.entries.push(actual(h.bSalary, 0));
    const zero = computeMonthReport(input);
    expect(zero.complete).toBe(true);
    expect(zero.incomeLines.find((l) => l.key === h.bSalary.id)!.actual).toBe(0);
    expect(zero.income).toBe(4_200_000);
    expectIdentities(zero);
  });

  it("기준 월은 잔액만 집계한다", () => {
    const h = household();
    const input = typicalMonth(h);
    input.isBaseline = true;
    input.prevAssetSnapshots = [];
    input.prevLiabilitySnapshots = [];
    const report = computeMonthReport(input);
    expect(report.isBaseline).toBe(true);
    expect(report.closing.assets).toBe(39_900_000);
    expect(report.closing.netWorth).toBe(39_900_000 - 49_600_000);
    expect(report.income).toBe(0);
    expect(report.consumption).toBe(0);
    expect(report.savings).toBe(0);
    expect(report.netWorthChange).toBe(0);
    expect(report.pockets).toEqual([]);
  });

  it("전부터 갖고 있던 자산·부채를 뒤늦게 등록하면 기초 조정으로 분리된다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const pension = asset({ kind: "pension", owner_member_id: m.id, liquidity: "locked" });
    const oldDebt = liability({ kind: "interest_only", original_principal: 5_000_000, monthly_payment: 0 });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, pension],
        liabilities: [oldDebt],
        prevAssets: [assetSnap(account, 1_000_000)],
        curAssets: [
          assetSnap(account, 1_000_000),
          assetSnap(pension, 21_000_000, 18_000_000, { opening_value: 20_000_000, opening_principal: 18_000_000 }),
        ],
        curLiabilities: [liabilitySnap(oldDebt, 5_000_000, { opening_balance: 5_000_000 })],
      }),
    );
    expect(report.adjustment).toBe(15_000_000);
    expect(report.savings).toBe(0);
    expect(report.consumption).toBe(0);
    expect(report.newBorrowing).toBe(0);
    expect(report.investmentGain).toBe(1_000_000);
    expect(report.netWorthChange).toBe(16_000_000);
    // 월초 합계는 전월 마감과 같아야 한다 (조정분 제외)
    expect(report.opening.assets).toBe(1_000_000);
    expect(report.opening.liabilities).toBe(0);
    expectIdentities(report);
  });

  it("새로 생긴 자산은 조정 없이 순투입으로 잡힌다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const deposit = asset({ kind: "deposit", owner_member_id: m.id });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, deposit],
        prevAssets: [assetSnap(account, 10_000_000)],
        curAssets: [assetSnap(account, 4_000_000), assetSnap(deposit, 6_000_000)],
      }),
    );
    expect(report.adjustment).toBe(0);
    expect(report.savings).toBe(0);
    expect(report.consumption).toBe(0);
    expectIdentities(report);
  });

  it("보관해도 금액이 남아 있으면 계속 집계하고, 0을 기록해야 정리된다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const closed = asset({ kind: "savings", owner_member_id: m.id, is_active: false });
    const base = {
      members: [m],
      assets: [account, closed],
      prevAssets: [assetSnap(account, 1_000_000), assetSnap(closed, 5_000_000)],
    };

    // 보관만 하고 잔액을 정리하지 않았다: 자산은 그대로 남고 미확인으로 표시된다 (가짜 소비가 생기지 않는다)
    const pending = computeMonthReport(monthInput({ ...base, curAssets: [assetSnap(account, 1_000_000)] }));
    expect(pending.complete).toBe(false);
    expect(pending.closing.assets).toBe(6_000_000);
    expect(pending.consumption).toBe(0);
    expectIdentities(pending);

    // 해지해서 통장으로 받았다고 기록하면 정리된다
    const settled = computeMonthReport(
      monthInput({ ...base, curAssets: [assetSnap(account, 6_000_000), assetSnap(closed, 0)] }),
    );
    expect(settled.complete).toBe(true);
    expect(settled.closing.assets).toBe(6_000_000);
    expect(settled.consumption).toBe(0);
    expect(settled.savings).toBe(0);
    expectIdentities(settled);

    // 다음 달부터는 줄 자체가 사라진다
    const next = computeMonthReport(
      monthInput({
        ...base,
        prevAssets: [assetSnap(account, 6_000_000), assetSnap(closed, 0)],
        curAssets: [assetSnap(account, 6_000_000)],
      }),
    );
    expect(next.assetLines.map((line) => line.assetId)).toEqual([account.id]);
    expect(next.complete).toBe(true);
  });

  it("장부가와 다른 값에 판 자산의 차액은 소비가 아니라 평가 변동이다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const car = asset({ kind: "vehicle", owner_member_id: m.id, liquidity: "locked" });
    // 장부 3,000만 원인 차를 1,500만 원에 팔았다: 순투입액을 받은 금액만큼 줄인다
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, car],
        prevAssets: [assetSnap(account, 1_000_000), assetSnap(car, 30_000_000, 40_000_000)],
        curAssets: [assetSnap(account, 16_000_000), assetSnap(car, 0, 25_000_000)],
      }),
    );
    expect(report.consumption).toBe(0);
    expect(report.savings).toBe(0);
    expect(report.otherValuation).toBe(-15_000_000);
    expectIdentities(report);
  });

  it("보관한 부채도 원금이 남아 있으면 계속 집계한다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const loan = liability({ kind: "interest_only", original_principal: 50_000_000, monthly_payment: 0, is_active: false });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account],
        liabilities: [loan],
        prevAssets: [assetSnap(account, 1_000_000)],
        prevLiabilities: [liabilitySnap(loan, 50_000_000)],
        curAssets: [assetSnap(account, 1_000_000)],
      }),
    );
    expect(report.complete).toBe(false);
    expect(report.closing.liabilities).toBe(50_000_000);
    expect(report.principalRepaid).toBe(0);
    expect(report.consumption).toBe(0);
  });

  it("소비지출이 음수면 수입 누락을 경고한다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account],
        prevAssets: [assetSnap(account, 1_000_000)],
        curAssets: [assetSnap(account, 1_500_000)],
      }),
    );
    expect(report.consumption).toBe(-500_000);
    expect(report.warnings.some((w) => w.code === "negative_consumption")).toBe(true);
    expectIdentities(report);
  });

  it("확인한 지출이 주머니에서 나간 돈보다 많으면 경고한다", () => {
    const h = household();
    const input = typicalMonth(h);
    // 공동 주머니에서 실제로 나간 돈은 190만 원인데 250만 원어치 지출을 확인했다
    input.entries.push(entry({ kind: "expense", amount: 2_500_000, member_id: null, name: "생활비" }));
    const report = computeMonthReport(input);
    const joint = report.pockets.find((p) => p.pocket === JOINT)!;
    expect(joint.unclassified).toBe(-600_000);
    expect(report.warnings.some((w) => w.code === "negative_unclassified" && w.pocket === JOINT)).toBe(true);
    // 가구 합계는 영향받지 않는다
    expect(report.consumption).toBe(3_900_000);
  });

  it("계획에 없던 수입·지출을 추가할 수 있다", () => {
    const h = household();
    const input = typicalMonth(h);
    input.entries.push(entry({ kind: "income", amount: 500_000, member_id: h.bada.id, name: "성과급" }));
    input.entries.push(entry({ kind: "expense", amount: 300_000, member_id: null, name: "가전 구입" }));
    input.assetSnapshots = input.assetSnapshots.map((s) =>
      s.asset_id === h.bAccount.id ? { ...s, value: s.value + 500_000, principal: s.principal + 500_000 } : s,
    );
    const report = computeMonthReport(input);
    expect(report.income).toBe(7_700_000);
    expect(report.consumption).toBe(3_900_000);
    const joint = report.pockets.find((p) => p.pocket === JOINT)!;
    expect(joint.classified).toBe(300_000);
    expect(joint.unclassified).toBe(1_600_000);
    expect(report.incomeLines.find((l) => l.name === "성과급")!.planned).toBeNull();
    expectIdentities(report);
  });
});

describe("월 정산: 항등식 (무작위 입력)", () => {
  // 시드 고정 난수 (mulberry32)
  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("어떤 잔액·수입·이동 조합에서도 항등식이 성립한다", () => {
    const random = rng(20261125);
    const won = (max: number) => Math.floor(random() * max);
    for (let round = 0; round < 200; round++) {
      const a = member("A");
      const b = member("B");
      const owners = [a.id, b.id, null];
      const kinds = ["cash", "savings", "investment", "pension", "vehicle", "real_estate"] as const;
      const assets = Array.from({ length: 6 }, (_, i) =>
        asset({ kind: kinds[i], owner_member_id: owners[i % 3], is_active: random() > 0.1 }),
      );
      const liabilities = Array.from({ length: 3 }, (_, i) =>
        liability({ kind: "installment", original_principal: 50_000_000, monthly_payment: 500_000, payer_member_id: owners[i] }),
      );
      const salary = planItem({ kind: "income", amount: won(6_000_000), member_id: a.id });
      const contribution = planItem({ kind: "contribution", amount: won(2_000_000), member_id: a.id });
      const report = computeMonthReport(
        monthInput({
          members: [a, b],
          assets,
          liabilities,
          planItems: [salary, contribution],
          prevAssets: assets.filter(() => random() > 0.2).map((x) => assetSnap(x, won(30_000_000), won(30_000_000))),
          prevLiabilities: liabilities.filter(() => random() > 0.3).map((x) => liabilitySnap(x, won(50_000_000))),
          curAssets: assets
            .filter(() => random() > 0.2)
            .map((x) =>
              assetSnap(
                x,
                won(30_000_000),
                won(30_000_000),
                random() > 0.7 ? { opening_value: won(10_000_000), opening_principal: won(10_000_000) } : {},
              ),
            ),
          curLiabilities: liabilities
            .filter(() => random() > 0.3)
            .map((x) => liabilitySnap(x, won(50_000_000), random() > 0.7 ? { opening_balance: won(50_000_000) } : {})),
          entries: [
            ...(random() > 0.3 ? [actual(salary, won(6_000_000))] : []),
            ...(random() > 0.3 ? [actual(contribution, won(2_000_000))] : []),
            entry({ kind: "transfer", amount: won(1_000_000), member_id: b.id, to_member_id: null }),
            entry({ kind: "expense", amount: won(500_000), member_id: a.id }),
          ],
        }),
      );
      expectIdentities(report);
    }
  });
});

// ───────────────────────── 추가 고정: 기준 월 · 공동 주머니 · 미확인 · 기초 조정 ─────────────────────────

describe("월 정산: 기준 월 (8절 6항)", () => {
  function fixture() {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id, name: "통장" });
    const stock = asset({ kind: "investment", owner_member_id: m.id, name: "증권 계좌" });
    const loan = liability({
      kind: "interest_only",
      name: "차용금",
      original_principal: 30_000_000,
      monthly_payment: 400_000,
      payer_member_id: m.id,
    });
    const salary = planItem({ kind: "income", amount: 4_000_000, member_id: m.id, name: "급여" });
    const contribution = planItem({ kind: "contribution", amount: 1_000_000, member_id: m.id });
    const base = { isBaseline: true, members: [m], assets: [account, stock], liabilities: [loan], planItems: [salary, contribution] };
    return { m, account, stock, loan, salary, contribution, base };
  }

  it("기준 월은 opening_* 를 무시한다: 기초 조정이 없고 월초 합계가 월말 합계와 같다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        ...f.base,
        curAssets: [
          assetSnap(f.account, 5_000_000, 5_000_000, { opening_value: 3_000_000, opening_principal: 3_000_000 }),
          assetSnap(f.stock, 12_000_000, 10_000_000, { opening_value: 9_000_000, opening_principal: 8_000_000 }),
        ],
        curLiabilities: [liabilitySnap(f.loan, 30_000_000, { opening_balance: 30_000_000 })],
      }),
    );
    expect(report.adjustment).toBe(0);
    for (const line of report.assetLines) {
      expect(line.adjustment).toBe(0);
      expect(line.openValue).toBe(line.value);
      expect(line.openPrincipal).toBe(line.principal);
      expect(line.contributed).toBe(0);
      expect(line.gain).toBe(0);
    }
    expect(report.liabilityLines[0]).toMatchObject({ openBalance: 30_000_000, balance: 30_000_000, principalPaid: 0, adjustment: 0 });
    expect(report.closing).toMatchObject({ assets: 17_000_000, liabilities: 30_000_000, netWorth: -13_000_000 });
    expect(report.opening).toEqual(report.closing);
    expect(report.netWorthChange).toBe(0);
    // 평가금액과 순투입액이 달라도 기준 월에는 평가손익을 만들지 않는다
    expect(report.investmentGain).toBe(0);
    expectIdentities(report);
  });

  it("기준 월에도 스냅샷이 없는 자산·부채가 있으면 미완료(complete = false)다", () => {
    const f = fixture();
    const noStock = computeMonthReport(
      monthInput({
        ...f.base,
        curAssets: [assetSnap(f.account, 5_000_000)],
        curLiabilities: [liabilitySnap(f.loan, 30_000_000)],
      }),
    );
    expect(noStock.complete).toBe(false);
    expect(noStock.warnings.map((w) => w.code)).toEqual(["unconfirmed_asset"]);
    expect(noStock.assetLines.find((l) => l.assetId === f.stock.id)).toMatchObject({ confirmed: false, value: 0 });

    const noLoan = computeMonthReport(
      monthInput({
        ...f.base,
        curAssets: [assetSnap(f.account, 5_000_000), assetSnap(f.stock, 12_000_000, 10_000_000)],
      }),
    );
    expect(noLoan.complete).toBe(false);
    expect(noLoan.warnings.map((w) => w.code)).toEqual(["unconfirmed_liability"]);
  });

  it("기준 월은 잔액만 모두 확인하면 완료다: 계획된 수입·납입의 실제 값은 요구하지 않는다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        ...f.base,
        curAssets: [assetSnap(f.account, 5_000_000), assetSnap(f.stock, 12_000_000, 10_000_000)],
        curLiabilities: [liabilitySnap(f.loan, 30_000_000)],
      }),
    );
    expect(report.complete).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  it("기준 월의 실제 이자는 스냅샷에 적혀 있어도 집계하지 않는다 (null)", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        ...f.base,
        curAssets: [assetSnap(f.account, 5_000_000), assetSnap(f.stock, 12_000_000, 10_000_000)],
        curLiabilities: [liabilitySnap(f.loan, 30_000_000, { interest_paid: 400_000 })],
      }),
    );
    expect(report.liabilityLines[0].interestPaid).toBeNull();
  });

  it("기준 월은 실제 수입·납입·이동·지출을 입력해도 흐름 지표와 주머니가 비어 있다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        ...f.base,
        curAssets: [assetSnap(f.account, 5_000_000), assetSnap(f.stock, 12_000_000, 10_000_000)],
        curLiabilities: [liabilitySnap(f.loan, 30_000_000, { interest_paid: 400_000 })],
        entries: [
          actual(f.salary, 4_000_000),
          actual(f.contribution, 1_000_000),
          entry({ kind: "transfer", amount: 200_000, member_id: f.m.id, to_member_id: null }),
          entry({ kind: "expense", amount: 300_000, member_id: f.m.id, name: "병원비" }),
        ],
      }),
    );
    expect(report).toMatchObject({
      isBaseline: true,
      income: 0,
      consumption: 0,
      savings: 0,
      savingsRate: null,
      principalRepaid: 0,
      newBorrowing: 0,
      investmentGain: 0,
      otherValuation: 0,
      adjustment: 0,
      netWorthChange: 0,
    });
    expect(report.incomeLines).toEqual([]);
    expect(report.contributionLines).toEqual([]);
    expect(report.transferLines).toEqual([]);
    expect(report.pockets).toEqual([]);
    // 잔액 지표는 집계한다
    expect(report.closing).toMatchObject({ assets: 17_000_000, liquid: 5_000_000, financial: 17_000_000 });
    expect(report.closing.byKind).toEqual({ cash: 5_000_000, investment: 12_000_000 });
  });
});

describe("월 정산: 공동 수입과 공용통장에서 내는 대출 (2절·5절)", () => {
  /**
   * 주택담보대출(원금균등 2.4억, 연 4.8%, 240개월, 2026-01 시작)을 공용통장에서 낸다.
   * 2026-03 월초 잔액 2억 3,800만 → 예정 원금 100만, 예정 이자 238,000,000 × 4.8% ÷ 12 = 952,000
   */
  function fixture() {
    const haneul = member("하늘");
    const bada = member("바다");
    const hAccount = asset({ kind: "cash", owner_member_id: haneul.id, name: "하늘 통장" });
    const bAccount = asset({ kind: "cash", owner_member_id: bada.id, name: "바다 통장" });
    const jointAccount = asset({ kind: "cash", name: "공용통장" });
    const home = asset({ kind: "real_estate", name: "아파트", liquidity: "locked" });
    const mortgage = liability({
      kind: "equal_principal",
      name: "주택담보대출",
      original_principal: 240_000_000,
      annual_rate: 4.8,
      term_months: 240,
      start_month: "2026-01",
    });
    const hSalary = planItem({ kind: "income", amount: 4_200_000, member_id: haneul.id, name: "하늘 급여" });
    const bSalary = planItem({ kind: "income", amount: 3_000_000, member_id: bada.id, name: "바다 급여" });
    const hContribution = planItem({ kind: "contribution", amount: 2_000_000, member_id: haneul.id });
    const bContribution = planItem({ kind: "contribution", amount: 1_500_000, member_id: bada.id });
    const rent = planItem({ kind: "income", amount: 300_000, income_type: "other", name: "공동 임대수입" });
    const living = planItem({ kind: "expense", amount: 1_800_000, name: "공동생활비" });

    const input = (interestPaid: number | null, rentEntry: boolean) =>
      monthInput({
        month: "2026-03",
        members: [haneul, bada],
        assets: [hAccount, bAccount, jointAccount, home],
        liabilities: [mortgage],
        planItems: [hSalary, bSalary, hContribution, bContribution, rent, living],
        prevAssets: [
          assetSnap(hAccount, 1_000_000),
          assetSnap(bAccount, 800_000),
          assetSnap(jointAccount, 5_000_000),
          assetSnap(home, 400_000_000, 380_000_000),
        ],
        prevLiabilities: [liabilitySnap(mortgage, 238_000_000)],
        curAssets: [
          // 하늘: +급여 420 −공용 200 −개인 지출 190 = +30
          assetSnap(hAccount, 1_300_000),
          // 바다: +급여 300 −공용 150 −개인 지출 120 = +30
          assetSnap(bAccount, 1_100_000),
          // 공용: +납입 350 +임대수입 30 −원금 100 −이자 95.2 −생활비 170 = +14.8
          assetSnap(jointAccount, 5_148_000),
          assetSnap(home, 400_000_000, 380_000_000),
        ],
        curLiabilities: [liabilitySnap(mortgage, 237_000_000, { interest_paid: interestPaid })],
        entries: [
          actual(hSalary, 4_200_000),
          actual(bSalary, 3_000_000),
          actual(hContribution, 2_000_000),
          actual(bContribution, 1_500_000),
          ...(rentEntry ? [actual(rent, 300_000)] : []),
        ],
      });
    return { haneul, bada, mortgage, rent, input };
  }
  const pocketOf = (report: MonthReport, id: string) => report.pockets.find((p) => p.pocket === id)!;

  it("공동 명의 수입은 공동 주머니의 수입이고 가구 수입에 한 번만 더해진다", () => {
    const f = fixture();
    const report = computeMonthReport(f.input(952_000, true));
    expect(report.complete).toBe(true);
    expect(report.incomeLines.find((l) => l.key === f.rent.id)).toMatchObject({ pocket: JOINT, planned: 300_000, actual: 300_000 });
    expect(pocketOf(report, JOINT).income).toBe(300_000);
    expect(pocketOf(report, f.haneul.id).income).toBe(4_200_000);
    expect(pocketOf(report, f.bada.id).income).toBe(3_000_000);
    expect(report.income).toBe(7_500_000);
    expect(report.plan.income).toBe(7_500_000);
  });

  it("공용통장에서 낸 원금은 공동 주머니의 원금 상환이고, 이자와 생활비만 공동 소비다", () => {
    const f = fixture();
    const report = computeMonthReport(f.input(952_000, true));
    const joint = pocketOf(report, JOINT);
    expect(joint).toMatchObject({
      transfersIn: 3_500_000,
      transfersOut: 0,
      assetContribution: 148_000,
      principalPaid: 1_000_000,
      // 수입 30 + 납입 350 − 순투입 14.8 − 원금 100 = 265.2 (= 이자 95.2 + 생활비 170)
      consumption: 2_652_000,
      classified: 952_000,
      unclassified: 1_700_000,
      // 계획 소비 = 공동지출 180 + 예정 이자 95.2
      plannedConsumption: 2_752_000,
    });
    // 개인 주머니에는 대출 원금·이자가 섞이지 않는다
    expect(pocketOf(report, f.haneul.id)).toMatchObject({ principalPaid: 0, consumption: 1_900_000, classified: 0 });
    expect(pocketOf(report, f.bada.id)).toMatchObject({ principalPaid: 0, consumption: 1_200_000, classified: 0 });
  });

  it("가구 합계: 소비 = 세 주머니의 합, 저축 = 수입 − 소비 − 원금 상환", () => {
    const f = fixture();
    const report = computeMonthReport(f.input(952_000, true));
    expect(report.consumption).toBe(5_752_000);
    expect(report.principalRepaid).toBe(1_000_000);
    expect(report.newBorrowing).toBe(0);
    // 750 − 575.2 − 100 = 74.8 = 세 통장 순투입 합 (30 + 30 + 14.8)
    expect(report.savings).toBe(748_000);
    // 748 ÷ 7,500 = 9.97…% → 10.0
    expect(report.savingsRate).toBe(10);
    // 순자산은 저축 74.8 + 원금 상환 100 만큼 늘어난다 (이자는 순자산을 줄였다)
    expect(report.netWorthChange).toBe(1_748_000);
    // 계획: 소비 = 사용 가능 금액 220 + 150 + 공동지출 180 + 이자 95.2, 저축 = 750 − 645.2 − 100
    expect(report.plan).toMatchObject({ consumption: 6_452_000, principalRepayment: 1_000_000, savings: 48_000 });
    expectIdentities(report);
  });

  it("공동 대출의 이자가 미확인이면 계획 이자를 지출로 확정하지 않고 미분류로 남긴다", () => {
    const f = fixture();
    const report = computeMonthReport(f.input(null, true));
    const joint = pocketOf(report, JOINT);
    expect(joint.consumption).toBe(2_652_000);
    expect(joint.classified).toBe(0);
    expect(joint.unclassified).toBe(2_652_000);
    expect(joint.expenseLines.find((l) => l.key === `liability:${f.mortgage.id}:interest`)).toMatchObject({
      planned: 952_000,
      actual: null,
      pocket: JOINT,
    });
    expect(report.liabilityLines[0]).toMatchObject({ plannedPrincipal: 1_000_000, plannedInterest: 952_000, interestPaid: null });
    // 가구 합계는 잔액에서 나오므로 이자 확인 여부와 무관하다
    expect(report.consumption).toBe(5_752_000);
    expectIdentities(report);
  });

  it("공동 수입이 미확인이면 계획 금액을 잠정값으로 쓰고 공동 주머니에 경고를 남긴다", () => {
    const f = fixture();
    const report = computeMonthReport(f.input(952_000, false));
    expect(report.complete).toBe(false);
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "unconfirmed_income", pocket: JOINT }));
    expect(report.incomeLines.find((l) => l.key === f.rent.id)!.actual).toBeNull();
    expect(pocketOf(report, JOINT).income).toBe(300_000);
    expect(report.income).toBe(7_500_000);
    expectIdentities(report);
  });
});

describe("월 정산: 미확인 처리 (1절 5항·5절·8절)", () => {
  it("공용통장 납입이 미확인이면 계획 금액을 잠정값으로 쓰고, 경고와 함께 미완료가 된다", () => {
    const h = household();
    const input = typicalMonth(h);
    input.entries = input.entries.filter((e) => e.plan_item_id !== h.hContribution.id);
    const report = computeMonthReport(input);

    expect(report.complete).toBe(false);
    expect(report.warnings).toEqual([
      { code: "unconfirmed_contribution", message: "하늘 공용통장 입금액 미확인", pocket: h.haneul.id },
    ]);
    expect(report.contributionLines.find((l) => l.key === h.hContribution.id)).toMatchObject({
      planned: 2_000_000,
      actual: null,
      pocket: h.haneul.id,
    });
    // 잠정값 = 계획 200만
    expect(report.pockets.find((p) => p.pocket === h.haneul.id)!.transfersOut).toBe(2_000_000);
    expect(report.pockets.find((p) => p.pocket === JOINT)!.transfersIn).toBe(3_500_000);
    expect(report.pockets.find((p) => p.pocket === h.haneul.id)!.consumption).toBe(1_300_000);
    expectIdentities(report);
  });

  it("공용통장 납입 0원을 확인한 것은 미확인과 다르다: 완료이고 실제 0원으로 계산한다", () => {
    const h = household();
    const input = typicalMonth(h);
    input.entries = input.entries.map((e) => (e.plan_item_id === h.hContribution.id ? { ...e, amount: 0 } : e));
    const report = computeMonthReport(input);

    expect(report.complete).toBe(true);
    expect(report.contributionLines.find((l) => l.key === h.hContribution.id)!.actual).toBe(0);
    expect(report.pockets.find((p) => p.pocket === h.haneul.id)!.transfersOut).toBe(0);
    expect(report.pockets.find((p) => p.pocket === JOINT)!.transfersIn).toBe(1_500_000);
    // 하늘 통장에서 실제로 빠진 200만 원은 이동으로 설명되지 않으므로 하늘의 소비로 보인다: 130 + 200
    expect(report.pockets.find((p) => p.pocket === h.haneul.id)!.consumption).toBe(3_300_000);
    // 공용통장은 들어온 돈(150)보다 잔액이 더 늘었다(160) → 음수 소비
    expect(report.pockets.find((p) => p.pocket === JOINT)!.consumption).toBe(-100_000);
    // 가구 소비는 그대로다
    expect(report.consumption).toBe(3_900_000);
    expectIdentities(report);
  });

  /** 하늘·바다·공용통장만 있는 단순한 가구. 계획은 모두 하늘 것이다. */
  function simple() {
    const a = member("하늘");
    const b = member("바다");
    const aAccount = asset({ kind: "cash", owner_member_id: a.id, name: "하늘 통장" });
    const bAccount = asset({ kind: "cash", owner_member_id: b.id, name: "바다 통장" });
    const jointAccount = asset({ kind: "cash", name: "공용통장" });
    const salary = planItem({ kind: "income", amount: 4_000_000, member_id: a.id, name: "하늘 급여" });
    const contribution = planItem({ kind: "contribution", amount: 1_000_000, member_id: a.id });
    const phone = planItem({ kind: "expense", amount: 100_000, member_id: a.id, name: "통신비" });
    return {
      a,
      b,
      aAccount,
      bAccount,
      jointAccount,
      salary,
      contribution,
      phone,
      members: [a, b],
      assets: [aAccount, bAccount, jointAccount],
      prevAssets: [assetSnap(aAccount, 1_000_000), assetSnap(bAccount, 1_000_000), assetSnap(jointAccount, 1_000_000)],
    };
  }

  it("실제 항목에서 주머니를 바꾸면 계획의 주머니가 아니라 그쪽 주머니로 집계한다", () => {
    const s = simple();
    // 하늘 급여가 바다 통장으로 들어왔고, 공용통장 납입도 바다가 했고, 통신비는 공용통장에서 나갔다
    const report = computeMonthReport(
      monthInput({
        members: s.members,
        assets: s.assets,
        planItems: [s.salary, s.contribution, s.phone],
        prevAssets: s.prevAssets,
        curAssets: [
          assetSnap(s.aAccount, 1_000_000),
          // 바다: +급여 400 −공용 100 −개인 지출 50 = +250
          assetSnap(s.bAccount, 3_500_000),
          // 공용: +100 −통신비 10 −기타 30 = +60
          assetSnap(s.jointAccount, 1_600_000),
        ],
        entries: [
          { ...actual(s.salary, 4_000_000), member_id: s.b.id },
          { ...actual(s.contribution, 1_000_000), member_id: s.b.id },
          { ...actual(s.phone, 100_000), member_id: null },
        ],
      }),
    );
    const pocket = (id: string) => report.pockets.find((p) => p.pocket === id)!;

    expect(report.complete).toBe(true);
    expect(report.incomeLines).toEqual([expect.objectContaining({ key: s.salary.id, pocket: s.b.id, planned: 4_000_000, actual: 4_000_000 })]);
    expect(report.contributionLines).toEqual([expect.objectContaining({ key: s.contribution.id, pocket: s.b.id, actual: 1_000_000 })]);

    expect(pocket(s.a.id)).toMatchObject({ income: 0, transfersOut: 0, consumption: 0, classified: 0 });
    expect(pocket(s.b.id)).toMatchObject({ income: 4_000_000, transfersOut: 1_000_000, assetContribution: 2_500_000, consumption: 500_000 });
    expect(pocket(JOINT)).toMatchObject({ transfersIn: 1_000_000, consumption: 400_000, classified: 100_000, unclassified: 300_000 });
    expect(pocket(JOINT).expenseLines.map((l) => l.key)).toEqual([s.phone.id]);
    expect(pocket(s.a.id).expenseLines).toEqual([]);

    expect(report.income).toBe(4_000_000);
    expect(report.consumption).toBe(900_000);
    expect(report.savings).toBe(3_100_000);
    expect(report.warnings).toEqual([]);
    expectIdentities(report);
  });

  it("주머니 소비가 음수면 그 주머니에 경고한다 (가구 소비가 양수여도)", () => {
    const s = simple();
    const bSalary = planItem({ kind: "income", amount: 3_000_000, member_id: s.b.id, name: "바다 급여" });
    // 바다가 하늘에게 50만 원을 보냈는데 이동을 기록하지 않았다
    const input = monthInput({
      members: s.members,
      assets: s.assets,
      planItems: [bSalary],
      prevAssets: s.prevAssets,
      curAssets: [
        assetSnap(s.aAccount, 1_500_000),
        // 바다: +급여 300 −하늘에게 50 −개인 지출 150 = +100
        assetSnap(s.bAccount, 2_000_000),
        assetSnap(s.jointAccount, 1_000_000),
      ],
      entries: [actual(bSalary, 3_000_000)],
    });
    const missing = computeMonthReport(input);
    expect(missing.pockets.find((p) => p.pocket === s.a.id)!.consumption).toBe(-500_000);
    expect(missing.pockets.find((p) => p.pocket === s.b.id)!.consumption).toBe(2_000_000);
    expect(missing.consumption).toBe(1_500_000);
    // 하늘 주머니에만 경고가 붙고, 가구 소비 음수 경고나 미분류 음수 경고는 없다
    expect(missing.warnings.map((w) => [w.code, w.pocket])).toEqual([["negative_pocket_consumption", s.a.id]]);
    // 경고는 마감을 막지 않는다 (미확인이 아니다)
    expect(missing.complete).toBe(true);

    // 이동을 기록하면 경고가 사라진다
    input.entries.push(entry({ kind: "transfer", amount: 500_000, member_id: s.b.id, to_member_id: s.a.id }));
    const recorded = computeMonthReport(input);
    expect(recorded.warnings).toEqual([]);
    expect(recorded.pockets.find((p) => p.pocket === s.a.id)!.consumption).toBe(0);
    expect(recorded.pockets.find((p) => p.pocket === s.b.id)!.consumption).toBe(1_500_000);
    expect(recorded.transferLines).toEqual([expect.objectContaining({ from: s.b.id, to: s.a.id, amount: 500_000 })]);
    expectIdentities(recorded);
  });

  it("초과 배분한 구성원의 주머니 계획 소비는 음수가 아니라 0이다", () => {
    const s = simple();
    // 수입 400 − 납입 100 − 통신비 10 − 저축 350 = −60
    const saving = planItem({ kind: "saving", amount: 3_500_000, member_id: s.a.id });
    const report = computeMonthReport(
      monthInput({
        members: s.members,
        assets: s.assets,
        planItems: [s.salary, s.contribution, s.phone, saving],
        prevAssets: s.prevAssets,
        curAssets: s.prevAssets,
        entries: [actual(s.salary, 0), actual(s.contribution, 0)],
      }),
    );
    // 고정지출 10 + 사용 가능 금액(음수는 0)
    expect(report.pockets.find((p) => p.pocket === s.a.id)!.plannedConsumption).toBe(100_000);
    expect(report.plan.consumption).toBe(100_000);
    expect(report.plan.savings).toBe(3_900_000);
  });
});

describe("월 정산: 이자의 미확인과 0원 (1절 5항·5절)", () => {
  const m = member("하늘");
  const account = asset({ kind: "cash", owner_member_id: m.id });
  const salary = planItem({ kind: "income", amount: 3_000_000, member_id: m.id });
  const run = (loan: ReturnType<typeof liability>, interestPaid: number | null, curCash: number) =>
    computeMonthReport(
      monthInput({
        members: [m],
        assets: [account],
        liabilities: [loan],
        planItems: [salary],
        prevAssets: [assetSnap(account, 1_000_000)],
        prevLiabilities: [liabilitySnap(loan, 20_000_000)],
        curAssets: [assetSnap(account, curCash)],
        curLiabilities: [liabilitySnap(loan, 20_000_000, { interest_paid: interestPaid })],
        entries: [actual(salary, 3_000_000)],
      }),
    );

  it("계획 이자가 없는 부채: 실제 이자 0원을 확인하면 지출 줄(0원)이 생기고, 미확인이면 줄이 없다", () => {
    const free = liability({ kind: "interest_only", name: "무이자 차용금", original_principal: 20_000_000, monthly_payment: 0, payer_member_id: m.id });

    const confirmedZero = run(free, 0, 3_000_000);
    expect(confirmedZero.liabilityLines[0]).toMatchObject({ plannedInterest: 0, interestPaid: 0 });
    expect(confirmedZero.pockets[0].expenseLines).toEqual([
      { key: `liability:${free.id}:interest`, name: "무이자 차용금 이자", pocket: m.id, planned: null, actual: 0 },
    ]);
    expect(confirmedZero.pockets[0].classified).toBe(0);

    const unconfirmed = run(free, null, 3_000_000);
    expect(unconfirmed.liabilityLines[0].interestPaid).toBeNull();
    expect(unconfirmed.pockets[0].expenseLines).toEqual([]);
    expect(unconfirmed.pockets[0].classified).toBe(0);
    // 이자 확인 여부는 마감 조건이 아니다
    expect(unconfirmed.complete).toBe(true);
  });

  it("계획 이자가 있는데 미확인이면 지출 줄은 보이지만 확인된 지출에 넣지 않는다", () => {
    const loan = liability({ kind: "interest_only", name: "차용금", original_principal: 20_000_000, monthly_payment: 250_000, payer_member_id: m.id });
    // 급여 300 − 실제로 나간 돈 100 = 통장 +200
    const report = run(loan, null, 3_000_000);
    expect(report.pockets[0].expenseLines).toEqual([
      { key: `liability:${loan.id}:interest`, name: "차용금 이자", pocket: m.id, planned: 250_000, actual: null },
    ]);
    expect(report.pockets[0].consumption).toBe(1_000_000);
    expect(report.pockets[0].classified).toBe(0);
    expect(report.pockets[0].unclassified).toBe(1_000_000);
    expect(report.complete).toBe(true);
  });

  it("실제 이자를 확인하면 계획 금액이 아니라 실제 금액만큼 확인된 지출이 된다", () => {
    const loan = liability({ kind: "interest_only", name: "차용금", original_principal: 20_000_000, monthly_payment: 250_000, payer_member_id: m.id });
    const paidLess = run(loan, 200_000, 3_000_000);
    expect(paidLess.pockets[0].classified).toBe(200_000);
    expect(paidLess.pockets[0].unclassified).toBe(800_000);

    const paidNothing = run(loan, 0, 3_000_000);
    expect(paidNothing.pockets[0].expenseLines[0]).toMatchObject({ planned: 250_000, actual: 0 });
    expect(paidNothing.pockets[0].classified).toBe(0);
    expect(paidNothing.pockets[0].unclassified).toBe(1_000_000);
  });
});

describe("월 정산: 기초 조정이 적용되는 조건 (3절)", () => {
  const m = member("하늘");
  const account = asset({ kind: "cash", owner_member_id: m.id, name: "통장" });
  const salary = planItem({ kind: "income", amount: 1_000_000, member_id: m.id });

  it("직전 달 기록이 있는 자산·부채의 opening_* 은 무시한다 (월초 값은 직전 달 말 값)", () => {
    const loan = liability({ kind: "installment", original_principal: 12_000_000, monthly_payment: 1_000_000, payer_member_id: m.id });
    // 통장 500 → 500 (급여 100, 할부 100 상환). 스냅샷에 예전에 적어 둔 opening_* 이 남아 있다.
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account],
        liabilities: [loan],
        planItems: [salary],
        prevAssets: [assetSnap(account, 5_000_000)],
        prevLiabilities: [liabilitySnap(loan, 10_000_000)],
        curAssets: [assetSnap(account, 5_000_000, 5_000_000, { opening_value: 2_000_000, opening_principal: 2_000_000 })],
        curLiabilities: [liabilitySnap(loan, 9_000_000, { opening_balance: 3_000_000 })],
        entries: [actual(salary, 1_000_000)],
      }),
    );
    expect(report.assetLines[0]).toMatchObject({ openValue: 5_000_000, openPrincipal: 5_000_000, adjustment: 0, contributed: 0 });
    expect(report.liabilityLines[0]).toMatchObject({ openBalance: 10_000_000, adjustment: 0, principalPaid: 1_000_000 });
    expect(report.adjustment).toBe(0);
    expect(report.opening).toMatchObject({ assets: 5_000_000, liabilities: 10_000_000, netWorth: -5_000_000 });
    expect(report.principalRepaid).toBe(1_000_000);
    expect(report.consumption).toBe(0);
    expect(report.savings).toBe(0);
    expectIdentities(report);
  });

  it("직전 달에 0원으로만 남아 있던 자산·부채를 다시 등록하면 opening_* 을 기초 조정으로 쓴다", () => {
    const pension = asset({ kind: "pension", owner_member_id: m.id, liquidity: "locked" });
    const oldDebt = liability({ kind: "interest_only", original_principal: 5_000_000, monthly_payment: 0, payer_member_id: m.id });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, pension],
        liabilities: [oldDebt],
        prevAssets: [assetSnap(account, 1_000_000), assetSnap(pension, 0, 0)],
        prevLiabilities: [liabilitySnap(oldDebt, 0)],
        curAssets: [
          assetSnap(account, 1_000_000),
          assetSnap(pension, 8_300_000, 8_000_000, { opening_value: 8_000_000, opening_principal: 8_000_000 }),
        ],
        curLiabilities: [liabilitySnap(oldDebt, 5_000_000, { opening_balance: 5_000_000 })],
      }),
    );
    expect(report.adjustment).toBe(3_000_000);
    expect(report.investmentGain).toBe(300_000);
    expect(report.savings).toBe(0);
    expect(report.newBorrowing).toBe(0);
    expect(report.consumption).toBe(0);
    // 월초 합계는 직전 달 말 합계 그대로다 (조정분 제외)
    expect(report.opening).toMatchObject({ assets: 1_000_000, liabilities: 0 });
    expectIdentities(report);
  });

  it("평가금액은 0이어도 순투입액이 남아 있던 자산은 직전 기록이 있는 것으로 본다", () => {
    const stock = asset({ kind: "investment", owner_member_id: m.id });
    // 지난달 전량 매도(평가 0, 순투입 −200만). 이번 달 통장에서 100만 원을 다시 넣었다.
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, stock],
        prevAssets: [assetSnap(account, 3_000_000), assetSnap(stock, 0, -2_000_000)],
        curAssets: [
          assetSnap(account, 2_000_000),
          assetSnap(stock, 1_000_000, -1_000_000, { opening_value: 500_000, opening_principal: 500_000 }),
        ],
      }),
    );
    const line = report.assetLines.find((l) => l.assetId === stock.id)!;
    expect(line).toMatchObject({ openValue: 0, openPrincipal: -2_000_000, contributed: 1_000_000, gain: 0, adjustment: 0 });
    expect(report.adjustment).toBe(0);
    expect(report.savings).toBe(0);
    expect(report.consumption).toBe(0);
    expectIdentities(report);
  });

  it("opening_* 과 월말 값이 다르면 그 차이는 이번 달의 순투입·평가손익이다", () => {
    const stock = asset({ kind: "investment", owner_member_id: m.id });
    // 전부터 있던 주식(월초 평가 900만·순투입 800만)에 이번 달 통장에서 50만 원을 더 넣었고 평가는 1,000만 원이 됐다
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, stock],
        prevAssets: [assetSnap(account, 3_000_000)],
        curAssets: [
          assetSnap(account, 2_500_000),
          assetSnap(stock, 10_000_000, 8_500_000, { opening_value: 9_000_000, opening_principal: 8_000_000 }),
        ],
      }),
    );
    const line = report.assetLines.find((l) => l.assetId === stock.id)!;
    expect(line).toMatchObject({ openValue: 9_000_000, openPrincipal: 8_000_000, contributed: 500_000, gain: 500_000, adjustment: 9_000_000 });
    expect(report.adjustment).toBe(9_000_000);
    expect(report.investmentGain).toBe(500_000);
    expect(report.savings).toBe(0);
    expect(report.consumption).toBe(0);
    expect(report.netWorthChange).toBe(9_500_000);
    expectIdentities(report);
  });
});

describe("저축률과 비율 반올림 (4절: %, 소수 1자리)", () => {
  it("소수 둘째 자리에서 반올림한다 (버림·올림이 아니다)", () => {
    expect(percentOf(1, 3)).toBe(33.3); // 33.33… (올림이면 33.4)
    expect(percentOf(2, 3)).toBe(66.7); // 66.66… (버림이면 66.6)
    expect(percentOf(1, 16)).toBe(6.3); // 6.25 → 6.3
    expect(percentOf(1, 8)).toBe(12.5);
    expect(percentOf(3, 2)).toBe(150);
    expect(percentOf(0, 5)).toBe(0);
  });

  it("분모가 0 이하면 비율을 만들지 않는다", () => {
    expect(percentOf(5, 0)).toBeNull();
    expect(percentOf(5, -1)).toBeNull();
  });

  it("수입이 0인 달은 저축률을 표시하지 않고, 저축이 음수면 저축률도 음수다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const salary = planItem({ kind: "income", amount: 4_000_000, member_id: m.id });
    const run = (income: number, curCash: number) =>
      computeMonthReport(
        monthInput({
          members: [m],
          assets: [account],
          planItems: [salary],
          prevAssets: [assetSnap(account, 5_000_000)],
          curAssets: [assetSnap(account, curCash)],
          entries: [actual(salary, income)],
        }),
      );
    expect(run(0, 4_000_000).savingsRate).toBeNull();
    // 수입 400, 통장 −100 → 저축 −100, 저축률 −25%
    const overspent = run(4_000_000, 4_000_000);
    expect(overspent.savings).toBe(-1_000_000);
    expect(overspent.savingsRate).toBe(-25);
  });
});

describe("잔액 합계 (4절: 총자산·가용자산·금융자산)", () => {
  // 종류마다 다른 자릿수의 금액을 써서 어떤 종류가 빠지거나 더해졌는지 합계에서 바로 드러나게 한다
  const lines = [
    { kind: "cash", liquidity: "liquid", value: 1 },
    { kind: "deposit", liquidity: "short", value: 20 },
    { kind: "savings", liquidity: "short", value: 300 },
    { kind: "investment", liquidity: "short", value: 4_000 },
    { kind: "pension", liquidity: "locked", value: 50_000 },
    { kind: "real_estate", liquidity: "locked", value: 600_000 },
    { kind: "lease_deposit", liquidity: "locked", value: 7_000_000 },
    { kind: "presale", liquidity: "locked", value: 80_000_000 },
    { kind: "vehicle", liquidity: "locked", value: 900_000_000 },
    { kind: "other", liquidity: "liquid", value: 1_000_000_000 },
  ] as const;
  const totals = balanceTotals([...lines], [{ balance: 30_000 }, { balance: 4_000 }]);

  it("총자산은 모든 자산의 합, 총부채는 남은 원금의 합, 순자산은 그 차이다", () => {
    expect(totals.assets).toBe(1_987_654_321);
    expect(totals.liabilities).toBe(34_000);
    expect(totals.netWorth).toBe(1_987_620_321);
  });

  it("금융자산은 현금·예금·적금·투자·연금만 더한다 (부동산·보증금·분양 납부금·자동차·기타 제외)", () => {
    expect(totals.financial).toBe(54_321);
  });

  it("가용자산은 종류가 아니라 유동성이 '즉시 사용 가능'인 자산의 합이다", () => {
    // 현금 1 + 즉시 사용 가능으로 표시한 기타 자산 10억. 예금·적금·투자는 현금화 가능일 뿐이다.
    expect(totals.liquid).toBe(1_000_000_001);
  });

  it("종류별 합계는 같은 종류끼리 더하고, 마이너스 통장은 음수 그대로 더한다", () => {
    const overdraft = balanceTotals(
      [
        { kind: "cash", liquidity: "liquid", value: 3_000_000 },
        { kind: "cash", liquidity: "liquid", value: -1_200_000 },
        { kind: "savings", liquidity: "short", value: 5_000_000 },
      ],
      [],
    );
    expect(overdraft.byKind).toEqual({ cash: 1_800_000, savings: 5_000_000 });
    expect(overdraft).toMatchObject({ assets: 6_800_000, liquid: 1_800_000, financial: 6_800_000, liabilities: 0, netWorth: 6_800_000 });
  });

  it("자산도 부채도 없으면 모든 합계가 0이다", () => {
    expect(balanceTotals([], [])).toEqual({ assets: 0, liabilities: 0, netWorth: 0, liquid: 0, financial: 0, byKind: {} });
  });
});
