import { describe, expect, it } from "vitest";
import { buildMonthPlan, buildPlanLines, isPlanItemActive, plannedJointConsumption, plannedMemberConsumption } from "./plan";
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

describe("초과 배분 (6절: 사용 가능 금액이 음수면 0으로 본다)", () => {
  const haneul = member("하늘");
  const bada = member("바다");
  const parentsLoan = liability({
    kind: "interest_only",
    payer_member_id: haneul.id,
    original_principal: 30_000_000,
    monthly_payment: 300_000,
  });
  const plan = buildMonthPlan({
    month: "2026-03",
    members: [haneul, bada],
    planItems: [
      planItem({ kind: "income", amount: 4_000_000, member_id: haneul.id }),
      planItem({ kind: "expense", amount: 100_000, member_id: haneul.id, name: "통신비" }),
      planItem({ kind: "contribution", amount: 2_000_000, member_id: haneul.id }),
      planItem({ kind: "income", amount: 3_000_000, member_id: bada.id }),
      planItem({ kind: "contribution", amount: 1_500_000, member_id: bada.id }),
      // 바다: 300 − 150 − 200 = −50 (수입보다 50만 원 많이 배분)
      planItem({ kind: "saving", amount: 2_000_000, member_id: bada.id }),
      planItem({ kind: "expense", amount: 1_800_000, name: "공동생활비" }),
    ],
    liabilities: [parentsLoan],
    liabilityBalances: { [parentsLoan.id]: 30_000_000 },
  });
  const h = plan.members.find((m) => m.memberId === haneul.id)!;
  const b = plan.members.find((m) => m.memberId === bada.id)!;

  it("사용 가능 금액은 음수 그대로 보여 준다 (초과 배분 경고의 근거)", () => {
    // 하늘: 400 − 통신비 10 − 이자 30 − 납입 200 = 160
    expect(h.allowance).toBe(1_600_000);
    expect(b.allowance).toBe(-500_000);
  });

  it("계획 소비에는 음수인 사용 가능 금액을 0으로 넣는다", () => {
    // 개인 고정지출 10 + 이자 30 + 사용 가능 금액(160 + 0) + 공동지출 180 = 380
    expect(plan.totals.consumption).toBe(3_800_000);
    expect(plan.totals.principalRepayment).toBe(0);
  });

  it("계획 저축 = 수입 − 계획 소비 − 계획 원금상환: 초과 배분한 만큼만 줄어든다", () => {
    // 700 − 380 − 0 = 320 (= 바다 저축 200 + 공동저축 170 − 초과 배분 50)
    expect(plan.totals.savings).toBe(3_200_000);
    expect(plan.joint.surplus).toBe(1_700_000);
  });

  it("주머니별 계획 소비도 음수가 되지 않는다", () => {
    expect(plannedMemberConsumption(b)).toBe(0);
    // 통신비 10 + 이자 30 + 사용 가능 금액 160
    expect(plannedMemberConsumption(h)).toBe(2_000_000);
    expect(plannedJointConsumption(plan.joint)).toBe(1_800_000);
  });
});

describe("계획의 부채 줄 (6절·7절)", () => {
  const haneul = member("하늘");
  const mortgage = liability({
    kind: "equal_principal",
    name: "주택담보대출",
    original_principal: 60_000_000,
    annual_rate: 6,
    term_months: 120,
    start_month: "2026-01",
    payment_day: 25,
  });
  const lines = (liabilityBalances: Record<string, number>, month = "2026-03", liabilities = [mortgage]) =>
    buildPlanLines({ month, planItems: [], liabilities, liabilityBalances });

  it("월초 잔액 기록이 없으면 최초 원금을 기준으로 계산한다", () => {
    // 원금 6,000만 ÷ 120 = 50만, 이자 6,000만 × 6% ÷ 12 = 30만
    expect(lines({})).toEqual([
      {
        key: `liability:${mortgage.id}`,
        kind: "debt",
        pocket: JOINT,
        name: "주택담보대출",
        amount: 800_000,
        principal: 500_000,
        interest: 300_000,
        liabilityId: mortgage.id,
        payDay: 25,
      },
    ]);
  });

  it("월초 잔액 기록이 있으면 그 잔액으로 이자를 계산한다", () => {
    // 이자 3,000만 × 6% ÷ 12 = 15만
    expect(lines({ [mortgage.id]: 30_000_000 })[0]).toMatchObject({ amount: 650_000, principal: 500_000, interest: 150_000 });
  });

  it("첫 납부 월 전에는 줄이 없고, 첫 납부 월부터 생긴다", () => {
    const later = { ...mortgage, start_month: "2026-04" };
    expect(lines({ [mortgage.id]: 60_000_000 }, "2026-03", [later])).toEqual([]);
    expect(lines({}, "2026-03", [later])).toEqual([]);
    expect(lines({ [mortgage.id]: 60_000_000 }, "2026-04", [later])).toHaveLength(1);
  });

  it("월초 잔액이 0(완납)이면 보관하지 않았어도 줄이 없다", () => {
    expect(lines({ [mortgage.id]: 0 })).toEqual([]);
  });

  it("납부액이 0원인 차용금(월 지급액 0)은 줄을 만들지 않는다", () => {
    const free = liability({ kind: "interest_only", original_principal: 10_000_000, monthly_payment: 0, payer_member_id: haneul.id });
    expect(lines({ [free.id]: 10_000_000 }, "2026-03", [free])).toEqual([]);
  });

  it("개인이 내는 부채 줄은 그 구성원 주머니에, 원금·이자가 나뉘어 잡힌다", () => {
    const carLoan = liability({
      kind: "amortized",
      name: "자동차 대출",
      payer_member_id: haneul.id,
      original_principal: 10_000_000,
      annual_rate: 12,
      term_months: 12,
      start_month: "2026-03",
    });
    const plan = buildMonthPlan({
      month: "2026-03",
      members: [haneul],
      planItems: [planItem({ kind: "income", amount: 3_000_000, member_id: haneul.id })],
      liabilities: [carLoan],
      liabilityBalances: {},
    });
    const h = plan.members[0];
    // 월 납부액 888,488 (1,000만·연 12%·12개월), 첫 달 이자 10만
    expect(h.debtInterest).toBe(100_000);
    expect(h.debtPrincipal).toBe(788_488);
    expect(h.allowance).toBe(3_000_000 - 888_488);
    expect(plan.totals.consumption).toBe(100_000 + (3_000_000 - 888_488));
    expect(plan.totals.principalRepayment).toBe(788_488);
    expect(plan.totals.savings).toBe(0);
  });

  it("계획 줄은 정렬 순서(같으면 만든 순서)대로, 부채 줄은 그 뒤에 온다", () => {
    const first = planItem({ kind: "expense", amount: 1, name: "첫째", sort_order: 1, created_at: "2026-01-01T00:00:00Z" });
    const second = planItem({ kind: "expense", amount: 2, name: "둘째", sort_order: 1, created_at: "2026-01-02T00:00:00Z" });
    const third = planItem({ kind: "income", amount: 3, name: "셋째", sort_order: 2, created_at: "2025-01-01T00:00:00Z" });
    const result = buildPlanLines({ month: "2026-03", planItems: [third, second, first], liabilities: [mortgage], liabilityBalances: {} });
    expect(result.map((line) => line.name)).toEqual(["첫째", "둘째", "셋째", "주택담보대출"]);
  });
});

describe("계획 항목의 적용 기간: 경계", () => {
  it("시작 월과 종료 월이 같으면 그 달에만 적용된다", () => {
    const once = planItem({ kind: "expense", amount: 500_000, start_month: "2026-12", end_month: "2026-12" });
    expect(isPlanItemActive(once, "2026-11")).toBe(false);
    expect(isPlanItemActive(once, "2026-12")).toBe(true);
    expect(isPlanItemActive(once, "2027-01")).toBe(false);
  });

  it("특정 월 반복은 해가 바뀌어도 같은 달에 적용되고, 기간 조건과 함께 본다", () => {
    const bonus = planItem({ kind: "income", amount: 2_000_000, income_type: "bonus", months_of_year: [1, 12], start_month: "2026-12" });
    expect(isPlanItemActive(bonus, "2026-01")).toBe(false); // 시작 전
    expect(isPlanItemActive(bonus, "2026-12")).toBe(true);
    expect(isPlanItemActive(bonus, "2027-01")).toBe(true);
    expect(isPlanItemActive(bonus, "2027-02")).toBe(false);
  });

  it("상여금 달에는 그 금액이 수입과 사용 가능 금액에 더해진다", () => {
    const haneul = member("하늘");
    const items = [
      planItem({ kind: "income", amount: 4_000_000, member_id: haneul.id }),
      planItem({ kind: "income", amount: 2_000_000, member_id: haneul.id, income_type: "bonus", months_of_year: [7] }),
      planItem({ kind: "contribution", amount: 2_500_000, member_id: haneul.id }),
    ];
    const at = (month: string) => buildMonthPlan({ month, members: [haneul], planItems: items, liabilities: [], liabilityBalances: {} });
    expect(at("2026-06").members[0]).toMatchObject({ income: 4_000_000, allowance: 1_500_000 });
    expect(at("2026-07").members[0]).toMatchObject({ income: 6_000_000, allowance: 3_500_000 });
    // 계획 저축은 그대로다: 상여금은 따로 저축 항목으로 등록하지 않으면 쓰는 돈으로 본다
    expect(at("2026-06").totals.savings).toBe(2_500_000);
    expect(at("2026-07").totals.savings).toBe(2_500_000);
  });
});
