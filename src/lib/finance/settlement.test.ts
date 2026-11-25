import { describe, expect, it } from "vitest";
import { computeMonthReport } from "./settlement";
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

  it("보관한 자산은 남은 금액을 전액 인출한 것으로 처리한다", () => {
    const m = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: m.id });
    const closed = asset({ kind: "savings", owner_member_id: m.id, is_active: false });
    const report = computeMonthReport(
      monthInput({
        members: [m],
        assets: [account, closed],
        prevAssets: [assetSnap(account, 1_000_000), assetSnap(closed, 5_000_000)],
        curAssets: [assetSnap(account, 6_000_000)],
      }),
    );
    expect(report.complete).toBe(true);
    expect(report.closing.assets).toBe(6_000_000);
    expect(report.consumption).toBe(0);
    expect(report.savings).toBe(0);
    expectIdentities(report);
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
