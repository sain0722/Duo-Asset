import { addMonths, compareYm, ymParts } from "@/lib/month";
import { ASSET_KINDS } from "./meta";
import { buildPlanLines, isPlanItemActive, summarizePlan } from "./plan";
import { scheduledPayment } from "./schedule";
import type {
  Assumptions,
  ExpenseChangeParams,
  FutureEvent,
  HomeMoveInParams,
  IncomeChangeParams,
  Liability,
  LoanParams,
  OneTimeParams,
  ParentalLeaveParams,
  RepaymentMethod,
  Scenario,
  SimulationInput,
  SimulationMilestone,
  SimulationPoint,
  SimulationResult,
  Won,
  Ym,
} from "./types";

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  horizonYears: 10,
  salaryGrowthPct: 3,
  expenseGrowthPct: 2.5,
  investReturnPct: 5,
  cashReturnPct: 2,
  realEstateGrowthPct: 0,
  monthlySavingsAdjust: 0,
  monthlyInvestment: null,
};

export function resolveAssumptions(partial: Partial<Assumptions> | null | undefined): Assumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...(partial ?? {}) };
}

/** 시나리오에 적용되는 이벤트: 끄지 않은 공통 이벤트 + 이 시나리오 전용 이벤트 */
export function eventsForScenario(scenario: Scenario, events: FutureEvent[]): FutureEvent[] {
  return events.filter((event) =>
    event.scenario_id === null
      ? !scenario.excluded_event_ids.includes(event.id)
      : event.scenario_id === scenario.id,
  );
}

// ───────────────────────── 이벤트 → 기본 효과 ─────────────────────────

type Effect =
  /** 월 수입 증감 (memberId null = 공동 수입) */
  | { type: "income_delta"; memberId: string | null; amount: Won; from: Ym; to: Ym | null }
  /** 기간 동안 해당 구성원의 현금 수입을 이 금액으로 대체 */
  | { type: "income_override"; memberId: string; amount: Won; from: Ym; to: Ym }
  /** 월 지출 증감 */
  | { type: "expense_delta"; amount: Won; from: Ym; to: Ym | null }
  /** 일회성 수입(+)·소비(−) */
  | { type: "one_off"; month: Ym; amount: Won }
  /** 현금 ↔ 비금융 자산 교환. amount > 0 이면 현금으로 자산을 산다 */
  | { type: "buy_asset"; month: Ym; amount: Won; realEstate: boolean }
  /** 대출 실행. toAsset 이면 대출금이 곧바로 자산이 되고, 아니면 현금으로 들어온다 */
  | {
      type: "borrow";
      month: Ym;
      name: string;
      principal: Won;
      annualRate: number;
      termMonths: number;
      method: RepaymentMethod;
      toAsset: boolean;
      realEstate: boolean;
    }
  /** 분양 납부금을 부동산으로 전환 */
  | { type: "presale_to_real_estate"; month: Ym };

export function expandEvent(event: FutureEvent): Effect[] {
  const month = event.month;
  switch (event.kind) {
    case "income_change": {
      const p = event.params as IncomeChangeParams;
      return [{ type: "income_delta", memberId: p.memberId, amount: p.monthlyDelta, from: month, to: p.endMonth }];
    }
    case "expense_change": {
      const p = event.params as ExpenseChangeParams;
      return [{ type: "expense_delta", amount: p.monthlyDelta, from: month, to: p.endMonth }];
    }
    case "one_time": {
      const p = event.params as OneTimeParams;
      return p.asAsset
        ? [{ type: "buy_asset", month, amount: -p.amount, realEstate: false }]
        : [{ type: "one_off", month, amount: p.amount }];
    }
    case "loan": {
      const p = event.params as LoanParams;
      return [
        {
          type: "borrow",
          month,
          name: event.name,
          principal: p.principal,
          annualRate: p.annualRate,
          termMonths: p.termMonths,
          method: p.method,
          toAsset: p.toAsset,
          realEstate: false,
        },
      ];
    }
    case "home_move_in": {
      const p = event.params as HomeMoveInParams;
      const effects: Effect[] = [{ type: "presale_to_real_estate", month }];
      if (p.loanAmount > 0) {
        effects.push({
          type: "borrow",
          month,
          name: `${event.name} 대출`,
          principal: p.loanAmount,
          annualRate: p.loanRate,
          termMonths: p.loanTermMonths,
          method: p.loanMethod,
          toAsset: true,
          realEstate: true,
        });
      }
      // 잔금 중 대출로 치르지 않은 부분은 현금으로 낸다 (대출이 더 크면 차액이 현금으로 남는다)
      const fromCash = p.balanceDue - p.loanAmount;
      if (fromCash !== 0) effects.push({ type: "buy_asset", month, amount: fromCash, realEstate: true });
      // 임대보증금 반환: 비금융 자산 → 현금
      if (p.depositReturn > 0) {
        effects.push({ type: "buy_asset", month, amount: -p.depositReturn, realEstate: false });
      }
      if (p.monthlyExpenseDelta !== 0) {
        effects.push({ type: "expense_delta", amount: p.monthlyExpenseDelta, from: month, to: null });
      }
      return effects;
    }
    case "parental_leave": {
      const p = event.params as ParentalLeaveParams;
      const effects: Effect[] = [];
      if (p.leaveMonths > 0) {
        effects.push({
          type: "income_override",
          memberId: p.memberId,
          amount: p.monthlyIncomeDuringLeave,
          from: month,
          to: addMonths(month, p.leaveMonths - 1),
        });
      }
      if (p.monthlyChildCost !== 0) {
        effects.push({ type: "expense_delta", amount: p.monthlyChildCost, from: month, to: null });
      }
      if (p.oneTimeCost > 0) effects.push({ type: "one_off", month, amount: -p.oneTimeCost });
      return effects;
    }
  }
}

// ───────────────────────── 시뮬레이션 ─────────────────────────

/** 연 이율(%) → 월 복리 이율 */
function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

function inRange(month: Ym, from: Ym, to: Ym | null): boolean {
  return compareYm(month, from) >= 0 && (to === null || compareYm(month, to) <= 0);
}

interface Loan {
  name: string;
  liability: Liability;
  balance: Won;
  /** 지금까지 낸 월 납부액 중 가장 큰 값 = 끝나면 생기는 월 여유 자금 */
  regularPayment: Won;
}

function loanFromEffect(effect: Extract<Effect, { type: "borrow" }>, index: number): Loan {
  return {
    name: effect.name,
    balance: effect.principal,
    regularPayment: 0,
    liability: {
      id: `event-loan-${index}`,
      household_id: "",
      name: effect.name,
      kind: effect.method,
      payer_member_id: null,
      original_principal: effect.principal,
      annual_rate: effect.annualRate,
      term_months: effect.termMonths,
      // 실행한 다음 달부터 납부
      start_month: addMonths(effect.month, 1),
      monthly_payment: null,
      payment_day: null,
      withdraw_asset_id: null,
      memo: "",
      is_active: true,
      sort_order: 0,
      version: 1,
      created_at: "",
      updated_at: "",
    },
  };
}

/**
 * 미래 자산 시뮬레이션. 규칙은 docs/finance-rules.md 10절.
 * 실제 기록을 읽기만 하는 순수 함수다.
 */
export function simulate(input: SimulationInput): SimulationResult {
  const { startMonth, members, planItems, assets, assumptions } = input;
  const horizon = Math.max(1, Math.round(assumptions.horizonYears * 12));

  // 과거 날짜의 이벤트는 이미 일어난 일로 보고 건너뛴다
  const events = input.events.filter((event) => compareYm(event.month, startMonth) >= 0);
  const effects = events.flatMap(expandEvent);

  // 시작 상태
  let cash = 0;
  let invested = 0;
  let realEstate = 0;
  let presale = 0;
  let otherFixed = 0;
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const [assetId, value] of Object.entries(input.assetValues)) {
    const asset = assetById.get(assetId);
    if (!asset) continue;
    const bucket = ASSET_KINDS[asset.kind].bucket;
    if (bucket === "cash") cash += value;
    else if (bucket === "invested") invested += value;
    else if (asset.kind === "real_estate") realEstate += value;
    else if (asset.kind === "presale") presale += value;
    else otherFixed += value;
  }

  const loans: Loan[] = input.liabilities
    .filter((liability) => liability.is_active && (input.liabilityBalances[liability.id] ?? 0) > 0)
    .map((liability) => ({
      name: liability.name,
      liability,
      balance: input.liabilityBalances[liability.id],
      regularPayment: 0,
    }));

  // 평소 달(매월 항목만)의 개인 사용 가능 금액은 계속 쓰는 돈으로 본다
  const regularPlan = summarizePlan(
    startMonth,
    members,
    buildPlanLines({
      month: startMonth,
      planItems: planItems.filter((item) => item.months_of_year === null),
      liabilities: input.liabilities,
      liabilityBalances: input.liabilityBalances,
    }),
  );
  const baseAllowance = regularPlan.members.reduce((total, m) => total + Math.max(m.allowance, 0), 0);

  const rInvest = monthlyRate(assumptions.investReturnPct);
  const rCash = monthlyRate(assumptions.cashReturnPct);
  const rRealEstate = monthlyRate(assumptions.realEstateGrowthPct);
  const startYear = ymParts(startMonth).year;

  const points: SimulationPoint[] = [];
  const milestones: SimulationMilestone[] = [];
  let firstShortfallMonth: Ym | null = null;
  let loanCount = 0;

  for (let i = 0; i < horizon; i++) {
    const month = addMonths(startMonth, i);
    // 매년 1월에 인상분이 반영된다
    const years = ymParts(month).year - startYear;
    const salaryFactor = Math.pow(1 + assumptions.salaryGrowthPct / 100, years);
    const expenseFactor = Math.pow(1 + assumptions.expenseGrowthPct / 100, years);

    // 보유 자산의 수익 (월초 잔액 기준)
    invested = Math.round(invested * (1 + rInvest));
    if (cash > 0) cash = Math.round(cash * (1 + rCash));
    realEstate = Math.round(realEstate * (1 + rRealEstate));

    const activeItems = planItems.filter((item) => isPlanItemActive(item, month));

    // 1. 수입
    let income = 0;
    for (const pocket of [...members.map((m) => m.id), null]) {
      const override = effects.find(
        (e) => e.type === "income_override" && e.memberId === pocket && inRange(month, e.from, e.to),
      );
      if (override && override.type === "income_override") {
        income += override.amount;
        continue;
      }
      let pocketIncome = 0;
      for (const item of activeItems) {
        if (item.kind !== "income" || item.member_id !== pocket) continue;
        const grows = item.income_type === "salary" || item.income_type === "bonus";
        pocketIncome += grows ? Math.round(item.amount * salaryFactor) : item.amount;
      }
      for (const e of effects) {
        if (e.type === "income_delta" && e.memberId === pocket && inRange(month, e.from, e.to)) {
          pocketIncome += e.amount;
        }
      }
      income += Math.max(pocketIncome, 0);
    }

    // 2. 소비 (이자 제외)
    const expenseItems = activeItems
      .filter((item) => item.kind === "expense")
      .reduce((total, item) => total + item.amount, 0);
    let consumption = Math.round((expenseItems + baseAllowance) * expenseFactor);
    for (const e of effects) {
      if (e.type === "expense_delta" && inRange(month, e.from, e.to)) consumption += e.amount;
    }
    consumption = Math.max(consumption - assumptions.monthlySavingsAdjust, 0);

    // 3. 이벤트: 일회성 수입·지출, 자산 취득, 대출 실행
    for (const e of effects) {
      if (e.type === "one_off" && e.month === month) {
        if (e.amount >= 0) income += e.amount;
        else consumption += -e.amount;
      } else if (e.type === "buy_asset" && e.month === month) {
        cash -= e.amount;
        if (e.realEstate) realEstate += e.amount;
        else otherFixed += e.amount;
      } else if (e.type === "borrow" && e.month === month) {
        loans.push(loanFromEffect(e, loanCount++));
        if (!e.toAsset) cash += e.principal;
        else if (e.realEstate) realEstate += e.principal;
        else otherFixed += e.principal;
      } else if (e.type === "presale_to_real_estate" && e.month === month) {
        realEstate += presale;
        presale = 0;
      }
    }

    // 4. 부채 상환
    let principalPaid = 0;
    let interestPaid = 0;
    for (const loan of loans) {
      if (loan.balance <= 0) continue;
      const pay = scheduledPayment(loan.liability, month, loan.balance);
      loan.balance -= pay.principal;
      loan.regularPayment = Math.max(loan.regularPayment, pay.payment);
      principalPaid += pay.principal;
      interestPaid += pay.interest;
      if (loan.balance === 0) {
        milestones.push({
          month,
          kind: "debt_paid_off",
          label: `${loan.name} 상환 완료`,
          amount: loan.regularPayment,
        });
      }
    }
    consumption += interestPaid;

    // 5. 현금 흐름과 투자 이동
    const savings = income - consumption - principalPaid;
    cash += savings;
    const toInvest =
      assumptions.monthlyInvestment ??
      activeItems
        .filter(
          (item) =>
            item.kind === "saving" &&
            item.asset_id !== null &&
            ASSET_KINDS[assetById.get(item.asset_id)?.kind ?? "cash"].bucket === "invested",
        )
        .reduce((total, item) => total + item.amount, 0);
    cash -= toInvest;
    invested += toInvest;

    if (cash < 0 && firstShortfallMonth === null) {
      firstShortfallMonth = month;
      milestones.push({ month, kind: "cash_shortfall", label: "현금성 자산 부족", amount: -cash });
    }
    for (const event of events) {
      if (event.month === month) milestones.push({ month, kind: "event", label: event.name });
    }

    const fixed = realEstate + presale + otherFixed;
    const totalAssets = cash + invested + fixed;
    const liabilities = loans.reduce((total, loan) => total + loan.balance, 0);
    points.push({
      month,
      cash,
      invested,
      fixed,
      assets: totalAssets,
      liabilities,
      netWorth: totalAssets - liabilities,
      income,
      consumption,
      savings,
      debtPayment: principalPaid + interestPaid,
    });
  }

  milestones.sort((a, b) => compareYm(a.month, b.month));
  return { points, milestones, firstShortfallMonth };
}

export type { Effect };
