import { compareYm, ymParts } from "@/lib/month";
import { pocketOf } from "./meta";
import { scheduledPayment } from "./schedule";
import type {
  JointPlan,
  Liability,
  Member,
  MemberPlan,
  MonthPlan,
  PlanItem,
  PlanLine,
  PlanTotals,
  Won,
  Ym,
} from "./types";
import { JOINT } from "./types";

/** 계획 항목이 그 달에 적용되는가 */
export function isPlanItemActive(item: PlanItem, month: Ym): boolean {
  if (!item.is_active) return false;
  if (item.start_month && compareYm(month, item.start_month) < 0) return false;
  if (item.end_month && compareYm(month, item.end_month) > 0) return false;
  if (item.months_of_year && !item.months_of_year.includes(ymParts(month).month)) return false;
  return true;
}

function bySortOrder<T extends { sort_order: number; created_at: string }>(a: T, b: T): number {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

/**
 * 그 달의 계획 줄: 유효한 계획 항목 + 부채 일정에서 파생한 상환 줄.
 * liabilityBalances 는 그 달 월초의 남은 원금 (부채 id → 잔액). 없으면 최초 원금으로 본다.
 */
export function buildPlanLines(args: {
  month: Ym;
  planItems: PlanItem[];
  liabilities: Liability[];
  liabilityBalances: Record<string, Won>;
}): PlanLine[] {
  const { month, planItems, liabilities, liabilityBalances } = args;
  const lines: PlanLine[] = [];

  for (const item of [...planItems].sort(bySortOrder)) {
    if (!isPlanItemActive(item, month)) continue;
    lines.push({
      key: item.id,
      kind: item.kind,
      pocket: pocketOf(item.member_id),
      name: item.name,
      amount: item.amount,
      planItemId: item.id,
      assetId: item.asset_id,
      incomeType: item.income_type,
      payDay: item.pay_day,
    });
  }

  for (const liability of [...liabilities].sort(bySortOrder)) {
    // 보관했더라도 원금이 남아 있으면 계속 갚아야 한다. 보관했고 잔액 정보가 없으면 건너뛴다.
    const known = liabilityBalances[liability.id];
    if (!liability.is_active && !(known !== undefined && known > 0)) continue;
    const balance = known ?? liability.original_principal;
    const pay = scheduledPayment(liability, month, balance);
    if (pay.payment === 0) continue;
    lines.push({
      key: `liability:${liability.id}`,
      kind: "debt",
      pocket: pocketOf(liability.payer_member_id),
      name: liability.name,
      amount: pay.payment,
      principal: pay.principal,
      interest: pay.interest,
      liabilityId: liability.id,
      payDay: liability.payment_day,
    });
  }

  return lines;
}

function sum(lines: PlanLine[], pick: (line: PlanLine) => Won): Won {
  return lines.reduce((total, line) => total + pick(line), 0);
}

/** 계획 줄을 구성원별·공동·가구 합계로 요약한다. 규칙은 docs/finance-rules.md 6절. */
export function summarizePlan(month: Ym, members: Member[], lines: PlanLine[]): MonthPlan {
  const amountOf = (kind: PlanLine["kind"]) => (pocketLines: PlanLine[]) =>
    sum(
      pocketLines.filter((line) => line.kind === kind),
      (line) => line.amount,
    );
  const debtPrincipalOf = (pocketLines: PlanLine[]) =>
    sum(
      pocketLines.filter((line) => line.kind === "debt"),
      (line) => line.principal ?? 0,
    );
  const debtInterestOf = (pocketLines: PlanLine[]) =>
    sum(
      pocketLines.filter((line) => line.kind === "debt"),
      (line) => line.interest ?? 0,
    );

  const memberPlans: MemberPlan[] = members.map((member) => {
    const own = lines.filter((line) => line.pocket === member.id);
    const income = amountOf("income")(own);
    const fixedExpenses = amountOf("expense")(own);
    const debtPrincipal = debtPrincipalOf(own);
    const debtInterest = debtInterestOf(own);
    const contribution = amountOf("contribution")(own);
    const savings = amountOf("saving")(own);
    return {
      memberId: member.id,
      income,
      benefits: amountOf("benefit")(own),
      fixedExpenses,
      debtPrincipal,
      debtInterest,
      contribution,
      savings,
      allowance: income - fixedExpenses - debtPrincipal - debtInterest - contribution - savings,
      lines: own,
    };
  });

  const jointLines = lines.filter((line) => line.pocket === JOINT);
  const contributions = memberPlans.reduce((total, plan) => total + plan.contribution, 0);
  const jointIncome = amountOf("income")(jointLines);
  const jointExpenses = amountOf("expense")(jointLines);
  const jointDebtPrincipal = debtPrincipalOf(jointLines);
  const jointDebtInterest = debtInterestOf(jointLines);
  const joint: JointPlan = {
    contributions,
    income: jointIncome,
    expenses: jointExpenses,
    debtPrincipal: jointDebtPrincipal,
    debtInterest: jointDebtInterest,
    designatedSavings: amountOf("saving")(jointLines),
    surplus: contributions + jointIncome - jointExpenses - jointDebtPrincipal - jointDebtInterest,
    lines: jointLines,
  };

  const income = memberPlans.reduce((total, plan) => total + plan.income, 0) + joint.income;
  const consumption =
    memberPlans.reduce(
      (total, plan) => total + plan.fixedExpenses + plan.debtInterest + Math.max(plan.allowance, 0),
      0,
    ) +
    joint.expenses +
    joint.debtInterest;
  const principalRepayment =
    memberPlans.reduce((total, plan) => total + plan.debtPrincipal, 0) + joint.debtPrincipal;

  const totals: PlanTotals = {
    income,
    benefits: memberPlans.reduce((total, plan) => total + plan.benefits, 0),
    consumption,
    principalRepayment,
    savings: income - consumption - principalRepayment,
  };

  return { month, members: memberPlans, joint, totals, lines };
}

export function buildMonthPlan(args: {
  month: Ym;
  members: Member[];
  planItems: PlanItem[];
  liabilities: Liability[];
  liabilityBalances: Record<string, Won>;
}): MonthPlan {
  return summarizePlan(args.month, args.members, buildPlanLines(args));
}

/** 구성원의 계획 소비 = 고정지출 + 이자 + 사용 가능 금액(음수는 0) */
export function plannedMemberConsumption(plan: MemberPlan): Won {
  return plan.fixedExpenses + plan.debtInterest + Math.max(plan.allowance, 0);
}

/** 공동 주머니의 계획 소비 = 공동지출 + 이자 */
export function plannedJointConsumption(plan: JointPlan): Won {
  return plan.expenses + plan.debtInterest;
}
