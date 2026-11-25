import { describe, expect, it } from "vitest";
import { buildMonthPlan, isPlanItemActive } from "./plan";
import { liability, member, planItem } from "./testing";
import { JOINT } from "./types";

describe("계획 항목의 적용 기간", () => {
  it("시작·종료 월과 특정 월 반복을 따른다", () => {
    const item = planItem({ kind: "expense", amount: 100_000, start_month: "2026-03", end_month: "2026-08" });
    expect(isPlanItemActive(item, "2026-02")).toBe(false);
    expect(isPlanItemActive(item, "2026-03")).toBe(true);
    expect(isPlanItemActive(item, "2026-08")).toBe(true);
    expect(isPlanItemActive(item, "2026-09")).toBe(false);

    const bonus = planItem({ kind: "income", amount: 2_000_000, income_type: "bonus", months_of_year: [1, 7] });
    expect(isPlanItemActive(bonus, "2026-07")).toBe(true);
    expect(isPlanItemActive(bonus, "2026-08")).toBe(false);

    expect(isPlanItemActive({ ...item, is_active: false }, "2026-05")).toBe(false);
  });
});

describe("월급 배분", () => {
  const haneul = member("하늘");
  const bada = member("바다");
  const carLoan = liability({
    kind: "installment",
    name: "자동차 할부",
    payer_member_id: haneul.id,
    original_principal: 24_000_000,
    monthly_payment: 400_000,
    start_month: "2025-05",
  });
  const parentsLoan = liability({
    kind: "interest_only",
    payer_member_id: haneul.id,
    original_principal: 30_000_000,
    monthly_payment: 400_000,
  });
  const items = [
    planItem({ kind: "income", amount: 4_200_000, member_id: haneul.id }),
    planItem({ kind: "benefit", amount: 300_000, member_id: haneul.id }),
    planItem({ kind: "contribution", amount: 2_000_000, member_id: haneul.id }),
    planItem({ kind: "income", amount: 3_000_000, member_id: bada.id }),
    planItem({ kind: "contribution", amount: 1_500_000, member_id: bada.id }),
    planItem({ kind: "saving", amount: 500_000, member_id: bada.id }),
    planItem({ kind: "expense", amount: 1_800_000, name: "공동생활비" }),
  ];
  const build = (planItems = items) =>
    buildMonthPlan({
      month: "2026-03",
      members: [haneul, bada],
      planItems,
      liabilities: [carLoan, parentsLoan],
      liabilityBalances: { [carLoan.id]: 20_000_000, [parentsLoan.id]: 30_000_000 },
    });

  it("개인 사용 가능 금액 = 수입 − 고정지출 − 부채 상환 − 공용통장 납입 − 저축", () => {
    const plan = build();
    const h = plan.members.find((m) => m.memberId === haneul.id)!;
    expect(h.income).toBe(4_200_000);
    expect(h.debtPrincipal).toBe(400_000);
    expect(h.debtInterest).toBe(400_000);
    expect(h.allowance).toBe(1_400_000);
    const b = plan.members.find((m) => m.memberId === bada.id)!;
    expect(b.allowance).toBe(1_000_000);
  });

  it("비현금 복지는 수입과 사용 가능 금액에 들어가지 않는다", () => {
    const plan = build();
    const h = plan.members.find((m) => m.memberId === haneul.id)!;
    expect(h.benefits).toBe(300_000);
    expect(plan.totals.benefits).toBe(300_000);
    expect(plan.totals.income).toBe(7_200_000);
  });

  it("개인 부채는 개인 주머니에서만 차감되고 공동 지출에 섞이지 않는다", () => {
    const plan = build();
    expect(plan.joint.debtPrincipal).toBe(0);
    expect(plan.joint.expenses).toBe(1_800_000);
    expect(plan.joint.lines.some((line) => line.kind === "debt")).toBe(false);
    expect(plan.lines.filter((line) => line.liabilityId === carLoan.id)).toHaveLength(1);
  });

  it("공동저축 = 납입 합 − 공동지출, 계획 저축 = 개인 저축 + 공동저축", () => {
    const plan = build();
    expect(plan.joint.contributions).toBe(3_500_000);
    expect(plan.joint.surplus).toBe(1_700_000);
    expect(plan.totals.consumption).toBe(4_600_000);
    expect(plan.totals.principalRepayment).toBe(400_000);
    expect(plan.totals.savings).toBe(2_200_000);
    expect(plan.totals.income).toBe(plan.totals.consumption + plan.totals.savings + plan.totals.principalRepayment);
  });

  it("공용통장에서 공동 적금으로 옮기는 금액은 공동저축의 일부다", () => {
    const plan = build([...items, planItem({ kind: "saving", amount: 1_000_000, name: "공동 적금" })]);
    expect(plan.joint.designatedSavings).toBe(1_000_000);
    expect(plan.joint.surplus).toBe(1_700_000);
    expect(plan.totals.savings).toBe(2_200_000);
  });

  it("계획을 바꾸면 관련 지표가 함께 바뀐다", () => {
    const more = items.map((item) =>
      item.kind === "contribution" && item.member_id === bada.id ? { ...item, amount: 1_800_000 } : item,
    );
    const plan = build(more);
    expect(plan.members.find((m) => m.memberId === bada.id)!.allowance).toBe(700_000);
    expect(plan.joint.surplus).toBe(2_000_000);
    expect(plan.totals.savings).toBe(2_500_000);
  });

  it("수입보다 많이 배분하면 사용 가능 금액이 음수이고 저축에서 차감된다", () => {
    const over = [...items, planItem({ kind: "saving", amount: 1_500_000, member_id: bada.id })];
    const plan = build(over);
    expect(plan.members.find((m) => m.memberId === bada.id)!.allowance).toBe(-500_000);
    expect(plan.totals.income).toBe(plan.totals.consumption + plan.totals.savings + plan.totals.principalRepayment);
  });

  it("할부가 끝나면 그만큼 사용 가능 금액이 늘어난다", () => {
    const done = buildMonthPlan({
      month: "2026-03",
      members: [haneul, bada],
      planItems: items,
      liabilities: [carLoan, parentsLoan],
      liabilityBalances: { [carLoan.id]: 0, [parentsLoan.id]: 30_000_000 },
    });
    expect(done.members.find((m) => m.memberId === haneul.id)!.allowance).toBe(1_800_000);
    expect(done.lines.some((line) => line.liabilityId === carLoan.id)).toBe(false);
  });

  it("보관한 부채도 원금이 남아 있으면 상환 줄이 유지된다", () => {
    const archived = { ...carLoan, is_active: false };
    const withBalance = buildMonthPlan({
      month: "2026-03",
      members: [haneul, bada],
      planItems: items,
      liabilities: [archived, parentsLoan],
      liabilityBalances: { [carLoan.id]: 20_000_000, [parentsLoan.id]: 30_000_000 },
    });
    expect(withBalance.members.find((m) => m.memberId === haneul.id)!.debtPrincipal).toBe(400_000);
    // 잔액 기록이 없거나 0이면 계획에서 빠진다
    const settled = buildMonthPlan({
      month: "2026-03",
      members: [haneul, bada],
      planItems: items,
      liabilities: [archived, parentsLoan],
      liabilityBalances: { [parentsLoan.id]: 30_000_000 },
    });
    expect(settled.lines.some((line) => line.liabilityId === carLoan.id)).toBe(false);
  });

  it("공용통장에서 내는 대출과 공동 수입은 공동 주머니에 잡힌다", () => {
    const mortgage = liability({
      kind: "equal_principal",
      name: "주택담보대출",
      original_principal: 240_000_000,
      annual_rate: 4.8,
      term_months: 240,
      start_month: "2026-01",
    });
    const plan = buildMonthPlan({
      month: "2026-03",
      members: [haneul, bada],
      planItems: [...items, planItem({ kind: "income", amount: 300_000, income_type: "other", name: "공동 임대수입" })],
      liabilities: [mortgage],
      liabilityBalances: { [mortgage.id]: 238_000_000 },
    });
    expect(plan.joint.income).toBe(300_000);
    expect(plan.joint.debtPrincipal).toBe(1_000_000);
    expect(plan.joint.debtInterest).toBe(952_000);
    // 공동저축 = 납입 350 + 수입 30 − 지출 180 − 원금 100 − 이자 95.2
    expect(plan.joint.surplus).toBe(3_500_000 + 300_000 - 1_800_000 - 1_000_000 - 952_000);
    expect(plan.totals.income).toBe(7_500_000);
    expect(plan.totals.principalRepayment).toBe(1_000_000);
    expect(plan.totals.income).toBe(plan.totals.consumption + plan.totals.savings + plan.totals.principalRepayment);
    // 개인 사용 가능 금액에는 영향이 없다
    expect(plan.members.find((m) => m.memberId === haneul.id)!.allowance).toBe(2_200_000);
  });

  it("공동 주머니 줄은 pocket 이 joint 다", () => {
    expect(build().joint.lines.every((line) => line.pocket === JOINT)).toBe(true);
  });
});
