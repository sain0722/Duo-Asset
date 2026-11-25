import { describe, expect, it } from "vitest";
import { actual, allocation, asset, assetSnap, goal, liability, liabilitySnap, member, planItem } from "@/lib/finance/testing";
import type { Asset, Liability, MonthRow, PlanItem, Scenario, Ym } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { currentYm } from "@/lib/month";
import {
  baseScenario,
  canClose,
  canReopen,
  currentPosition,
  findMonth,
  goalsView,
  history,
  lastClosedMonth,
  latestMonth,
  monthInputFor,
  planForMonth,
  planLinesFor,
  pocketName,
  pocketTone,
  previousMonth,
  projectionBase,
  reportFor,
  simulateScenario,
  simulationInputFor,
  workingMonth,
} from "./derive";
import type { HouseholdData, MonthData } from "./types";

// ───────────────────────── 픽스처 ─────────────────────────

let seq = 0;

function monthRow(ym: Ym): MonthRow {
  return {
    id: `month-${++seq}`,
    household_id: "household-1",
    month: ym,
    status: "open",
    summary: null,
    note: "",
    closed_at: null,
    closed_by: null,
    version: 1,
    created_at: "",
    updated_at: "",
  };
}

function monthData(partial: Partial<MonthData> = {}): MonthData {
  return { assetSnapshots: [], liabilitySnapshots: [], entries: [], ...partial };
}

const BASE_SCENARIO: Scenario = {
  id: "scenario-base",
  household_id: "household-1",
  name: "기본 계획",
  is_base: true,
  assumptions: { horizonYears: 2, salaryGrowthPct: 0, expenseGrowthPct: 0, investReturnPct: 0, cashReturnPct: 0 },
  excluded_event_ids: [],
  sort_order: 0,
  version: 1,
  created_at: "",
  updated_at: "",
};

function household(parts: Partial<HouseholdData> & Pick<HouseholdData, "members" | "months">): HouseholdData {
  return {
    household: { id: "household-1", name: "테스트", created_at: "" },
    me: parts.members[0],
    assets: [],
    liabilities: [],
    planItems: [],
    monthData: {},
    goals: [],
    goalAllocations: [],
    scenarios: [BASE_SCENARIO],
    events: [],
    ...parts,
  };
}

/** 앱의 마감과 같은 일을 메모리에서 한다: 결과를 동결하고, 다음 달을 열고, 닫힌 달의 입력 행은 버린다 */
function close(data: HouseholdData, monthId: string, next?: MonthRow): HouseholdData {
  const month = data.months.find((m) => m.id === monthId)!;
  const summary = JSON.parse(JSON.stringify(reportFor(data, month)));
  const months = data.months.map((m) => (m.id === monthId ? { ...m, status: "closed" as const, summary } : m));
  const rest = Object.fromEntries(Object.entries(data.monthData).filter(([id]) => id !== monthId));
  return {
    ...data,
    months: next ? [...months, next] : months,
    monthData: next ? { ...rest, [next.id]: monthData() } : rest,
  };
}

/** 마감 취소: 상태만 열림으로 (summary 는 남는다). 입력 행은 다시 읽힌다. */
function reopen(data: HouseholdData, monthId: string, rows: MonthData): HouseholdData {
  return {
    ...data,
    months: data.months.map((m) => (m.id === monthId ? { ...m, status: "open" as const } : m)),
    monthData: { ...data.monthData, [monthId]: rows },
  };
}

function withMonthData(data: HouseholdData, monthId: string, rows: Partial<MonthData>): HouseholdData {
  return { ...data, monthData: { ...data.monthData, [monthId]: monthData(rows) } };
}

/** 1월(기준 월)·2월을 마감하고 3월이 열린 가구 */
function threeMonths() {
  const a = member("하늘");
  const b = member("바다");
  const account = asset({ kind: "cash", owner_member_id: a.id, name: "통장" });
  const salary = planItem({ kind: "income", amount: 4_000_000, member_id: a.id, name: "급여" });
  const [jan, feb, mar] = [monthRow("2026-01"), monthRow("2026-02"), monthRow("2026-03")];

  const janRows = monthData({ assetSnapshots: [assetSnap(account, 10_000_000)] });
  const febRows = monthData({ assetSnapshots: [assetSnap(account, 11_000_000)], entries: [actual(salary, 4_000_000)] });

  let data = household({ members: [a, b], assets: [account], planItems: [salary], months: [jan], monthData: { [jan.id]: janRows } });
  data = close(data, jan.id, feb);
  data = withMonthData(data, feb.id, febRows);
  data = close(data, feb.id, mar);
  return { data, a, b, account, salary, jan, feb, mar, febRows };
}

// ───────────────────────── 테스트 ─────────────────────────

describe("월 탐색", () => {
  it("정산할 달은 가장 이른 열린 달이고, 가장 최근 마감만 다시 열 수 있다", () => {
    const { data, jan, feb, mar } = threeMonths();
    expect(workingMonth(data)!.id).toBe(mar.id);
    const [january, february, march] = data.months;
    expect(canReopen(data, february)).toBe(true);
    expect(canReopen(data, january)).toBe(false);
    expect(canClose(data, march)).toBe(true);
    expect(canClose(data, february)).toBe(false);
    expect([jan.id, feb.id, mar.id]).toEqual(data.months.map((m) => m.id));
  });

  it("마감된 달은 동결된 결과를 그대로 돌려준다", () => {
    const { data } = threeMonths();
    const february = data.months[1];
    expect(reportFor(data, february)).toBe(february.summary);
    expect(february.summary!.income).toBe(4_000_000);
    expect(february.summary!.consumption).toBe(3_000_000);
    expect(history(data).map((p) => [p.month, p.provisional])).toEqual([
      ["2026-01", false],
      ["2026-02", false],
      ["2026-03", true],
    ]);
  });

  it("열린 달의 월초 값은 직전 달 마감 결과에서 온다", () => {
    const { data, mar } = threeMonths();
    const report = reportFor(data, data.months.find((m) => m.id === mar.id)!);
    expect(report.opening.assets).toBe(11_000_000);
    // 아직 아무것도 확인하지 않았다: 잔액은 전월 값 유지, 미완료
    expect(report.closing.assets).toBe(11_000_000);
    expect(report.complete).toBe(false);
    expect(currentPosition(data).totals.assets).toBe(11_000_000);
  });
});

describe("달을 다시 열어도 다른 달의 결과가 바뀌지 않는다", () => {
  it("나중에 등록한 기존 자산·부채가 다시 연 달에 끼어들지 않는다", () => {
    const { data: start, a, account, salary, feb, mar, febRows } = threeMonths();
    // 3월에 "전부터 갖고 있던" 예금과 차용금을 뒤늦게 등록하고 3월 입력을 마쳤다
    const deposit = asset({ kind: "deposit", name: "예전부터 있던 예금" });
    const oldDebt = liability({ kind: "interest_only", name: "차용금", original_principal: 30_000_000, monthly_payment: 0, payer_member_id: a.id });
    const marRows = monthData({
      assetSnapshots: [
        assetSnap(account, 12_000_000),
        assetSnap(deposit, 20_000_000, 20_000_000, { opening_value: 20_000_000, opening_principal: 20_000_000 }),
      ],
      liabilitySnapshots: [liabilitySnap(oldDebt, 30_000_000, { opening_balance: 30_000_000 })],
      entries: [actual(salary, 4_000_000)],
    });
    const before: HouseholdData = {
      ...start,
      assets: [...start.assets, deposit],
      liabilities: [oldDebt],
      monthData: { ...start.monthData, [mar.id]: marRows },
    };
    const marchBefore = reportFor(before, before.months[2]);
    expect(marchBefore.complete).toBe(true);
    expect(marchBefore.adjustment).toBe(-10_000_000);
    expect(marchBefore.savings).toBe(1_000_000);
    expect(marchBefore.newBorrowing).toBe(0);

    // 2월을 다시 연다 (입력은 그대로)
    const after = reopen(before, feb.id, febRows);
    const february = after.months[1];
    const march = after.months[2];
    const februaryAgain = reportFor(after, february);
    // 2월에는 예금·차용금이 없었으므로 줄도 없고, 결과도 마감 때와 같다
    expect(februaryAgain.assetLines.map((l) => l.assetId)).toEqual([account.id]);
    expect(februaryAgain.liabilityLines).toEqual([]);
    expect(februaryAgain.complete).toBe(true);
    expect(februaryAgain.consumption).toBe(february.summary!.consumption);
    expect(februaryAgain.closing).toEqual(february.summary!.closing);
    // 3월도 그대로다
    const marchAgain = reportFor(after, march);
    expect(marchAgain.adjustment).toBe(marchBefore.adjustment);
    expect(marchAgain.savings).toBe(marchBefore.savings);
    expect(marchAgain.consumption).toBe(marchBefore.consumption);
    expect(marchAgain.newBorrowing).toBe(0);
    expect(marchAgain.closing).toEqual(marchBefore.closing);
  });

  it("다시 연 달의 계획은 마감 당시 값이고, 그 뒤 삭제된 계획 항목의 줄은 빠진다", () => {
    const { data, a, salary, feb, febRows } = threeMonths();
    // 마감 뒤 급여 계획을 올리고, 새 항목을 추가했다
    const raised: PlanItem = { ...salary, amount: 5_000_000 };
    const extra = planItem({ kind: "expense", amount: 100_000, member_id: a.id });
    const changed = reopen({ ...data, planItems: [raised, extra] }, feb.id, febRows);
    const february = changed.months[1];
    expect(planLinesFor(changed, february).map((l) => [l.name, l.amount])).toEqual([["급여", 4_000_000]]);
    expect(reportFor(changed, february).plan.income).toBe(4_000_000);
    // 열린 3월의 계획은 새 설정을 따른다
    expect(planForMonth(changed, "2026-03").totals.income).toBe(5_000_000);

    // 다시 연 달에서 실제 값을 지우고 계획 항목을 삭제한 경우: 동결 줄이 남아 영원히 미확인이 되면 안 된다
    const removed = reopen({ ...data, planItems: [] }, feb.id, { ...febRows, entries: [] });
    expect(planLinesFor(removed, removed.months[1])).toEqual([]);
    expect(reportFor(removed, removed.months[1]).complete).toBe(true);
  });
});

describe("미래 계산의 출발점", () => {
  function withCarLoan() {
    const { data, a, account, mar } = threeMonths();
    const car: Liability = liability({
      kind: "installment",
      name: "자동차 할부",
      original_principal: 6_000_000,
      monthly_payment: 500_000,
      payer_member_id: a.id,
    });
    // 3월에 뒤늦게 등록한 기존 할부 (월초 잔액 150만)
    const withLoan = { ...data, liabilities: [car] };
    return { data: withLoan, car, account, mar, a };
  }

  it("최근 달의 정산이 끝났으면 그 달 말 잔액에서 다음 달부터 시작한다", () => {
    const { data, car, account, mar } = withCarLoan();
    const done = withMonthData(data, mar.id, {
      assetSnapshots: [assetSnap(account, 12_000_000)],
      liabilitySnapshots: [liabilitySnap(car, 1_000_000, { opening_balance: 1_500_000 })],
      entries: [actual(data.planItems[0], 4_000_000)],
    });
    expect(reportFor(done, done.months[2]).complete).toBe(true);
    const base = projectionBase(done);
    expect(base.startMonth).toBe("2026-04");
    expect(base.assetValues[account.id]).toBe(12_000_000);
    expect(base.liabilityBalances[car.id]).toBe(1_000_000);
    // 4월·5월에 50만씩 갚고 끝난다
    expect(planForMonth(done, "2026-05").members[0].debtPrincipal).toBe(500_000);
    expect(planForMonth(done, "2026-06").members[0].debtPrincipal).toBe(0);
  });

  it("정산 전이면 그 달부터 다시 굴린다: 한 달 치 저축·상환을 건너뛰지 않는다", () => {
    const { data, car, account, mar } = withCarLoan();
    // 부채만 확인하고 통장 잔액과 수입은 아직이다
    const partial = withMonthData(data, mar.id, {
      liabilitySnapshots: [liabilitySnap(car, 1_000_000, { opening_balance: 1_500_000 })],
    });
    expect(reportFor(partial, partial.months[2]).complete).toBe(false);
    const base = projectionBase(partial);
    expect(base.startMonth).toBe("2026-03");
    expect(base.assetValues[account.id]).toBe(11_000_000);
    // 확인한 잔액(100만) + 이번 달 예정 원금(50만) = 3월을 다시 굴리면 100만이 된다
    expect(base.liabilityBalances[car.id]).toBe(1_500_000);

    const sim = simulateScenario(partial, partial.scenarios[0]);
    expect(sim.points[0].month).toBe("2026-03");
    expect(sim.points[0].liabilities).toBe(1_000_000);
    expect(sim.milestones.find((m) => m.kind === "debt_paid_off")!.month).toBe("2026-05");
    // 미래 달 계획도 같은 출발점: 4월·5월 상환, 6월부터 없음
    expect(planForMonth(partial, "2026-05").members[0].debtPrincipal).toBe(500_000);
    expect(planForMonth(partial, "2026-06").members[0].debtPrincipal).toBe(0);
  });

  it("정산 전인 달에 확인한 신규 대출과 완납이 미래 계산에 반영된다", () => {
    const { data, car, mar, a } = withCarLoan();
    const newLoan = liability({
      kind: "installment",
      name: "새 할부",
      original_principal: 30_000_000,
      monthly_payment: 1_000_000,
      start_month: "2026-04",
      payer_member_id: a.id,
    });
    const newCar: Asset = asset({ kind: "vehicle", name: "새 차", owner_member_id: a.id, liquidity: "locked" });
    const state = withMonthData(
      { ...data, liabilities: [car, newLoan], assets: [...data.assets, newCar] },
      mar.id,
      {
        // 기존 할부는 이번 달에 완납, 새 할부로 차를 샀다. 통장·수입은 아직 미확인.
        liabilitySnapshots: [
          liabilitySnap(car, 0, { opening_balance: 1_500_000 }),
          liabilitySnap(newLoan, 30_000_000),
        ],
        assetSnapshots: [assetSnap(newCar, 30_000_000)],
      },
    );
    expect(currentPosition(state).totals.liabilities).toBe(30_000_000);

    const base = projectionBase(state);
    expect(base.startMonth).toBe("2026-03");
    expect(base.liabilityBalances[newLoan.id]).toBe(30_000_000);
    expect(base.assetValues[newCar.id]).toBe(30_000_000);

    const sim = simulateScenario(state, state.scenarios[0]);
    const march = sim.points[0];
    const april = sim.points[1];
    // 홈의 총부채와 시뮬레이션 첫 달 부채가 어긋나지 않는다
    expect(march.liabilities).toBe(30_000_000);
    expect(april.liabilities).toBe(29_000_000);
    // 다음 달 계획: 완납한 할부는 없고 새 할부만 있다
    const aprilPlan = planForMonth(state, "2026-04");
    expect(aprilPlan.lines.filter((l) => l.kind === "debt").map((l) => l.name)).toEqual(["새 할부"]);
  });
});

// ───────────────────────── 추가 고정 ─────────────────────────

describe("월 탐색: 열린 달이 둘일 때 (8절 4항)", () => {
  it("다시 연 달과 그다음 달이 함께 열려 있으면 이른 달만 마감할 수 있고, 그 앞 달만 다시 열 수 있다", () => {
    const { data, feb, febRows } = threeMonths();
    const reopened = reopen(data, feb.id, febRows);
    const [january, february, march] = reopened.months;
    expect([january.status, february.status, march.status]).toEqual(["closed", "open", "open"]);

    expect(workingMonth(reopened)!.id).toBe(february.id);
    expect(latestMonth(reopened)!.id).toBe(march.id);
    expect(lastClosedMonth(reopened)!.id).toBe(january.id);

    expect(canClose(reopened, february)).toBe(true);
    expect(canClose(reopened, march)).toBe(false);
    expect(canClose(reopened, january)).toBe(false);

    expect(canReopen(reopened, january)).toBe(true);
    expect(canReopen(reopened, february)).toBe(false);
    expect(canReopen(reopened, march)).toBe(false);
  });

  it("마감한 달이 하나도 없으면(기준 월만 있음) 다시 열 달이 없고 기준 월을 마감할 수 있다", () => {
    const a = member("하늘");
    const jan = monthRow("2026-01");
    const data = household({ members: [a], months: [jan] });
    expect(lastClosedMonth(data)).toBeNull();
    expect(workingMonth(data)!.id).toBe(jan.id);
    expect(canClose(data, jan)).toBe(true);
    expect(canReopen(data, jan)).toBe(false);
    expect(previousMonth(data, jan)).toBeNull();
  });

  it("달이 하나도 없으면 탐색 결과가 모두 비어 있다", () => {
    const data = household({ members: [member("하늘")], months: [] });
    expect(workingMonth(data)).toBeNull();
    expect(latestMonth(data)).toBeNull();
    expect(lastClosedMonth(data)).toBeNull();
    expect(findMonth(data, "2026-01")).toBeNull();
    expect(history(data)).toEqual([]);
  });

  it("월 문자열로 달을 찾고, 직전 달은 목록에서 바로 앞의 달이다", () => {
    const { data, jan, feb, mar } = threeMonths();
    expect(findMonth(data, "2026-02")!.id).toBe(feb.id);
    expect(findMonth(data, "2026-04")).toBeNull();
    expect(previousMonth(data, data.months[2])!.id).toBe(feb.id);
    expect(previousMonth(data, data.months[1])!.id).toBe(jan.id);
    expect(latestMonth(data)!.id).toBe(mar.id);
  });
});

describe("이력 (8절 1항·3항)", () => {
  it("다시 연 달은 잠정치이고, 동결 결과가 아니라 현재 입력으로 다시 계산한다", () => {
    const { data, account, salary, feb } = threeMonths();
    // 2월을 다시 열고 통장 잔액을 1,100만 → 1,050만으로 고쳤다
    const reopened = reopen(data, feb.id, {
      assetSnapshots: [assetSnap(account, 10_500_000)],
      liabilitySnapshots: [],
      entries: [actual(salary, 4_000_000)],
    });
    const points = history(reopened);
    expect(points.map((p) => [p.month, p.provisional])).toEqual([
      ["2026-01", false],
      ["2026-02", true],
      ["2026-03", true],
    ]);
    // 마감한 1월은 동결 결과 그대로
    expect(points[0].report).toBe(reopened.months[0].summary);
    // 2월: 동결된 결과(소비 300만)가 남아 있어도 새 입력으로 계산한다 → 소비 350만
    expect(reopened.months[1].summary!.consumption).toBe(3_000_000);
    expect(points[1].report).not.toBe(reopened.months[1].summary);
    expect(points[1].report.consumption).toBe(3_500_000);
    expect(points[1].report.closing.assets).toBe(10_500_000);
    // 3월의 월초 값도 고친 2월 말 값을 따른다
    expect(points[2].report.opening.assets).toBe(10_500_000);
  });

  it("마감된 달은 현재 설정을 바꿔도 결과가 바뀌지 않는다", () => {
    const { data, salary } = threeMonths();
    const frozen = JSON.stringify(data.months[1].summary);
    // 급여 계획을 올리고 통장을 공동 자산으로 바꿨다
    const changed = {
      ...data,
      planItems: [{ ...salary, amount: 9_000_000 }],
      assets: data.assets.map((a) => ({ ...a, owner_member_id: null, name: "이름 바꾼 통장" })),
    };
    const february = reportFor(changed, changed.months[1]);
    expect(JSON.stringify(february)).toBe(frozen);
    expect(february.plan.income).toBe(4_000_000);
    expect(february.assetLines[0].name).toBe("통장");
  });
});

describe("현재 상태 (currentPosition)", () => {
  function withInvestments() {
    const a = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: a.id, name: "통장" });
    const stock = asset({ kind: "investment", owner_member_id: a.id, name: "증권 계좌" });
    const loan = liability({ kind: "installment", name: "할부", original_principal: 6_000_000, monthly_payment: 500_000, payer_member_id: a.id });
    const [jan, feb] = [monthRow("2026-01"), monthRow("2026-02")];
    let data = household({
      members: [a],
      assets: [account, stock],
      liabilities: [loan],
      months: [jan],
      monthData: {
        [jan.id]: monthData({
          assetSnapshots: [assetSnap(account, 10_000_000), assetSnap(stock, 12_000_000, 10_000_000)],
          liabilitySnapshots: [liabilitySnap(loan, 5_000_000)],
        }),
      },
    });
    data = close(data, jan.id, feb);
    return { data, account, stock, loan, feb };
  }

  it("아직 확인하지 않은 자산·부채는 직전 달 값(평가금액·순투입액·잔액)이 유지된 것으로 본다", () => {
    const { data, account, stock, loan } = withInvestments();
    const position = currentPosition(data);
    expect(position.asOf).toBe("2026-02");
    expect(position.report!.complete).toBe(false);
    expect(position.assetValues).toEqual({ [account.id]: 10_000_000, [stock.id]: 12_000_000 });
    expect(position.assetPrincipals).toEqual({ [account.id]: 10_000_000, [stock.id]: 10_000_000 });
    expect(position.liabilityBalances).toEqual({ [loan.id]: 5_000_000 });
    expect(position.totals).toMatchObject({ assets: 22_000_000, liabilities: 5_000_000, netWorth: 17_000_000, liquid: 10_000_000, financial: 22_000_000 });
  });

  it("일부만 확인하면 확인한 항목은 새 값, 나머지는 직전 달 값이다", () => {
    const { data, account, stock, loan, feb } = withInvestments();
    const partial = withMonthData(data, feb.id, {
      assetSnapshots: [assetSnap(stock, 13_000_000, 10_500_000)],
      liabilitySnapshots: [liabilitySnap(loan, 4_500_000)],
    });
    const position = currentPosition(partial);
    expect(position.assetValues).toEqual({ [account.id]: 10_000_000, [stock.id]: 13_000_000 });
    expect(position.assetPrincipals[stock.id]).toBe(10_500_000);
    expect(position.liabilityBalances[loan.id]).toBe(4_500_000);
    expect(position.totals).toMatchObject({ assets: 23_000_000, liabilities: 4_500_000, netWorth: 18_500_000 });
  });

  it("달이 하나도 없으면 모든 합계가 0이다", () => {
    const position = currentPosition(household({ members: [member("하늘")], months: [] }));
    expect(position).toMatchObject({ asOf: null, report: null, assetValues: {}, liabilityBalances: {} });
    expect(position.totals).toMatchObject({ assets: 0, liabilities: 0, netWorth: 0, liquid: 0, financial: 0 });
  });
});

describe("미래 계산의 출발점: 확인 여부에 따른 분기 (10절)", () => {
  function withLoan() {
    const { data, a, account, salary, mar } = threeMonths();
    const car = liability({ kind: "installment", name: "자동차 할부", original_principal: 6_000_000, monthly_payment: 500_000, payer_member_id: a.id });
    return { data: { ...data, liabilities: [car] }, car, account, salary, mar };
  }

  it("정산 전: 확인한 기존 자산도 월초 값에서 출발한다 (이번 달 저축을 두 번 세지 않는다)", () => {
    const { data, account, mar } = withLoan();
    // 통장 잔액만 확인했다 (1,100만 → 1,200만). 수입은 아직 미확인.
    const partial = withMonthData(data, mar.id, { assetSnapshots: [assetSnap(account, 12_000_000)] });
    expect(reportFor(partial, partial.months[2]).complete).toBe(false);
    const base = projectionBase(partial);
    expect(base.startMonth).toBe("2026-03");
    expect(base.assetValues[account.id]).toBe(11_000_000);
  });

  it("정산 전: 미확인 부채는 월초 잔액에서 출발한다 (예정 원금을 더하지 않는다)", () => {
    const { data, car, account, mar } = withLoan();
    // 2월 말 잔액이 있는 부채로 만들기 위해 2월을 다시 열어 150만으로 기록하고 닫는다
    const febRows = monthData({
      assetSnapshots: [assetSnap(account, 11_000_000)],
      liabilitySnapshots: [liabilitySnap(car, 1_500_000, { opening_balance: 2_000_000 })],
      entries: [actual(data.planItems[0], 4_000_000)],
    });
    let state = reopen(data, data.months[1].id, febRows);
    expect(reportFor(state, state.months[1]).complete).toBe(true);
    state = close(state, state.months[1].id);
    // 닫을 때 3월 입력 행은 그대로 둔다 (아무것도 확인하지 않은 상태)
    state = withMonthData(state, mar.id, {});

    const march = reportFor(state, state.months[2]);
    expect(march.liabilityLines[0]).toMatchObject({ confirmed: false, openBalance: 1_500_000, balance: 1_500_000, plannedPrincipal: 500_000 });
    const base = projectionBase(state);
    expect(base.startMonth).toBe("2026-03");
    expect(base.liabilityBalances[car.id]).toBe(1_500_000);
    // 3월부터 굴리면 3·4·5월에 50만씩 갚고 끝난다
    const sim = simulateScenario(state, state.scenarios[0]);
    expect(sim.points.slice(0, 4).map((p) => p.liabilities)).toEqual([1_000_000, 500_000, 0, 0]);
    expect(sim.milestones.find((m) => m.kind === "debt_paid_off")!.month).toBe("2026-05");
  });

  it("기준 월만 있으면 미확인 항목이 있어도 다음 달부터 시작한다", () => {
    const a = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: a.id });
    const stock = asset({ kind: "investment", owner_member_id: a.id });
    const jan = monthRow("2026-01");
    const data = household({
      members: [a],
      assets: [account, stock],
      months: [jan],
      monthData: { [jan.id]: monthData({ assetSnapshots: [assetSnap(account, 10_000_000)] }) },
    });
    expect(reportFor(data, jan).complete).toBe(false);
    const base = projectionBase(data);
    expect(base.startMonth).toBe("2026-02");
    expect(base.assetValues).toEqual({ [account.id]: 10_000_000, [stock.id]: 0 });
  });

  it("달이 하나도 없으면 이번 달(Asia/Seoul)부터 빈 잔액으로 시작한다", () => {
    const base = projectionBase(household({ members: [member("하늘")], months: [] }));
    expect(base).toEqual({ startMonth: currentYm(), assetValues: {}, liabilityBalances: {} });
  });

  it("시뮬레이션 입력은 출발점의 잔액과 시나리오의 가정·이벤트로 만든다", () => {
    const { data, account, salary, mar } = threeMonths();
    const done = withMonthData(data, mar.id, {
      assetSnapshots: [assetSnap(account, 12_000_000)],
      entries: [actual(salary, 4_000_000)],
    });
    const scenario = baseScenario(done)!;
    expect(scenario.id).toBe("scenario-base");
    const input = simulationInputFor(done, scenario);
    expect(input.startMonth).toBe("2026-04");
    expect(input.assetValues).toEqual({ [account.id]: 12_000_000 });
    // 시나리오에 없는 가정은 기본값, 있는 가정은 시나리오 값
    expect(input.assumptions).toMatchObject({ horizonYears: 2, salaryGrowthPct: 0, realEstateGrowthPct: 0, monthlyInvestment: null });
    expect(simulationInputFor(done, scenario, { startMonth: "2027-01" }).startMonth).toBe("2027-01");
  });
});

describe("미래 달의 계획", () => {
  it("이자 있는 대출은 출발점부터 예정대로 갚은 잔액으로 그 달의 이자를 계산한다", () => {
    const a = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: a.id });
    // 원금균등 1,200만, 연 6%, 12개월, 2026-01 첫 납부: 매월 원금 100만
    const loan = liability({
      kind: "equal_principal",
      name: "대출",
      original_principal: 12_000_000,
      annual_rate: 6,
      term_months: 12,
      start_month: "2026-01",
      payer_member_id: a.id,
    });
    const jan = monthRow("2026-01");
    const data = household({
      members: [a],
      assets: [account],
      liabilities: [loan],
      months: [jan],
      monthData: {
        [jan.id]: monthData({
          assetSnapshots: [assetSnap(account, 10_000_000)],
          liabilitySnapshots: [liabilitySnap(loan, 11_000_000)],
        }),
      },
    });
    // 출발점: 2월 월초 잔액 1,100만
    expect(projectionBase(data)).toMatchObject({ startMonth: "2026-02", liabilityBalances: { [loan.id]: 11_000_000 } });
    // 2월: 이자 1,100만 × 0.5% = 55,000
    expect(planForMonth(data, "2026-02").members[0]).toMatchObject({ debtPrincipal: 1_000_000, debtInterest: 55_000 });
    // 5월: 2·3·4월에 100만씩 갚아 월초 잔액 800만 → 이자 40,000
    expect(planForMonth(data, "2026-05").members[0]).toMatchObject({ debtPrincipal: 1_000_000, debtInterest: 40_000 });
    // 12월(마지막 회차): 월초 잔액 100만 → 이자 5,000
    expect(planForMonth(data, "2026-12").members[0]).toMatchObject({ debtPrincipal: 1_000_000, debtInterest: 5_000 });
    // 그 뒤에는 줄이 없다
    expect(planForMonth(data, "2027-01").lines).toEqual([]);
  });
});

describe("목표 화면 (9절)", () => {
  function withGoals() {
    const a = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: a.id, name: "통장" });
    const deposit = asset({ kind: "deposit", owner_member_id: a.id, name: "예금" });
    const salary = planItem({ kind: "income", amount: 4_000_000, member_id: a.id });
    const saving = planItem({ kind: "saving", amount: 1_000_000, member_id: a.id });
    const jan = monthRow("2026-01");
    const data = household({
      members: [a],
      assets: [account, deposit],
      planItems: [salary, saving],
      months: [jan],
      monthData: {
        [jan.id]: monthData({ assetSnapshots: [assetSnap(account, 10_000_000), assetSnap(deposit, 30_000_000)] }),
      },
    });
    return { data, account, deposit };
  }

  it("목표 배정 후 여유 가용자산 = 가용자산 − 가용자산에 걸린 배정액", () => {
    const { data, account, deposit } = withGoals();
    const emergency = goal({ target_amount: 15_000_000, sort_order: 1 });
    const house = goal({ target_amount: 100_000_000, sort_order: 2 });
    const view = goalsView(
      { ...data, goals: [emergency, house], goalAllocations: [allocation(emergency, account, 6_000_000), allocation(house, deposit, null)] },
      "2026-02",
    );
    expect(view.progress.map((p) => p.current)).toEqual([6_000_000, 30_000_000]);
    // 예금(현금화 가능)은 가용자산이 아니므로 통장에 걸린 600만만 뺀다: 1,000 − 600
    expect(view.allocatedLiquid).toBe(6_000_000);
    expect(view.freeLiquid).toBe(4_000_000);
  });

  it("같은 통장을 여러 목표가 나눠 써도 여유 가용자산은 0 아래로 내려가지 않는다", () => {
    const { data, account } = withGoals();
    const first = goal({ target_amount: 8_000_000, sort_order: 1 });
    const second = goal({ target_amount: 8_000_000, sort_order: 2 });
    const view = goalsView(
      { ...data, goals: [first, second], goalAllocations: [allocation(first, account, 7_000_000), allocation(second, account, 7_000_000)] },
      "2026-02",
    );
    expect(view.allocatedLiquid).toBe(10_000_000);
    expect(view.freeLiquid).toBe(0);
  });

  it("목표가 없으면 가용자산 전부가 여유다", () => {
    const { data } = withGoals();
    expect(goalsView(data, "2026-02")).toEqual({ progress: [], allocatedLiquid: 0, freeLiquid: 10_000_000 });
  });

  it("순자산 목표의 예상 달성 시점은 기본 시나리오 시뮬레이션에서 온다", () => {
    const { data } = withGoals();
    // 2월부터 매달 저축 100만 (수입 400 − 사용 가능 금액 300): 순자산 4,100 → 4,200 → 4,300 …
    const target = goal({ target_amount: 42_500_000, basis: "net_worth" });
    const view = goalsView({ ...data, goals: [target] }, "2026-02");
    expect(view.progress[0]).toMatchObject({ current: 40_000_000, expectedMonth: "2026-04" });
    // 기본 시나리오가 없으면 예상 시점을 만들지 않는다
    expect(goalsView({ ...data, goals: [target], scenarios: [] }, "2026-02").progress[0].expectedMonth).toBeNull();
  });
});

describe("주머니 표시", () => {
  const a = member("하늘");
  const b = member("바다");
  const data = household({ members: [a, b], months: [] });

  it("주머니 이름: 구성원 이름, 공동은 '공동', 모르는 주머니는 '알 수 없음'", () => {
    expect(pocketName(data, a.id)).toBe("하늘");
    expect(pocketName(data, b.id)).toBe("바다");
    expect(pocketName(data, JOINT)).toBe("공동");
    expect(pocketName(data, "없는-구성원")).toBe("알 수 없음");
  });

  it("주머니 색: 구성원 순서대로 member-1, member-2, 공동은 joint", () => {
    expect(pocketTone(data, a.id)).toBe("member-1");
    expect(pocketTone(data, b.id)).toBe("member-2");
    expect(pocketTone(data, JOINT)).toBe("joint");
    // 순서를 바꾸면 색도 따라 바뀐다 (id 가 아니라 순서 기준)
    const swapped = household({ members: [b, a], months: [] });
    expect(pocketTone(swapped, b.id)).toBe("member-1");
    expect(pocketTone(swapped, a.id)).toBe("member-2");
  });
});

describe("월 입력 조립 (monthInputFor)", () => {
  it("첫 달만 기준 월이고, 그다음 달의 월초 값은 직전 달 결과의 월말 값(평가금액·순투입액)이다", () => {
    const a = member("하늘");
    const stock = asset({ kind: "investment", owner_member_id: a.id });
    const loan = liability({ kind: "installment", original_principal: 6_000_000, monthly_payment: 500_000, payer_member_id: a.id });
    const [jan, feb] = [monthRow("2026-01"), monthRow("2026-02")];
    let data = household({
      members: [a],
      assets: [stock],
      liabilities: [loan],
      months: [jan],
      monthData: {
        [jan.id]: monthData({
          assetSnapshots: [assetSnap(stock, 12_000_000, 10_000_000)],
          liabilitySnapshots: [liabilitySnap(loan, 5_000_000)],
        }),
      },
    });
    expect(monthInputFor(data, jan)).toMatchObject({ isBaseline: true, prevAssetSnapshots: [], prevLiabilitySnapshots: [] });
    data = close(data, jan.id, feb);
    const input = monthInputFor(data, data.months[1]);
    expect(input.isBaseline).toBe(false);
    expect(input.prevAssetSnapshots).toEqual([{ asset_id: stock.id, value: 12_000_000, principal: 10_000_000 }]);
    expect(input.prevLiabilitySnapshots).toEqual([{ liability_id: loan.id, balance: 5_000_000 }]);
    // 2월 계획의 부채 줄은 1월 말 잔액 기준
    expect(input.planLines.find((l) => l.kind === "debt")).toMatchObject({ principal: 500_000, amount: 500_000 });
  });

  it("아직 어느 달에도 기록하지 않은 새 자산은 열린 달에 미확인 줄로 나타난다", () => {
    const { data, a, mar } = threeMonths();
    const fresh = asset({ kind: "savings", owner_member_id: a.id, name: "새 적금" });
    const withNew = { ...data, assets: [...data.assets, fresh] };
    const report = reportFor(withNew, withNew.months.find((m) => m.id === mar.id)!);
    expect(report.assetLines.find((l) => l.assetId === fresh.id)).toMatchObject({ confirmed: false, value: 0, openValue: 0 });
    expect(report.complete).toBe(false);
  });
});

describe("보관한 자산과 달 다시 열기 (3절)", () => {
  it("0원으로 정리해 보관한 자산은 다음 달 줄에서 빠지고, 지난달 잔액을 금액이 남게 고치면 다시 확인을 요구한다", () => {
    const a = member("하늘");
    const account = asset({ kind: "cash", owner_member_id: a.id, name: "통장" });
    const oldSavings = asset({ kind: "savings", owner_member_id: a.id, name: "만기 적금" });
    const salary = planItem({ kind: "income", amount: 4_000_000, member_id: a.id, name: "급여" });
    const [jan, feb, mar] = [monthRow("2026-01"), monthRow("2026-02"), monthRow("2026-03")];

    let data = household({
      members: [a],
      assets: [account, oldSavings],
      planItems: [salary],
      months: [jan],
      monthData: { [jan.id]: monthData({ assetSnapshots: [assetSnap(account, 10_000_000), assetSnap(oldSavings, 5_000_000)] }) },
    });
    data = close(data, jan.id, feb);
    // 2월: 적금 500만을 해지해 통장으로 받았다. 통장 1,000 + 급여 400 + 적금 500 − 지출 300 = 1,600
    const febRows = monthData({
      assetSnapshots: [assetSnap(account, 16_000_000), assetSnap(oldSavings, 0)],
      entries: [actual(salary, 4_000_000)],
    });
    data = withMonthData(data, feb.id, febRows);
    data = close(data, feb.id, mar);
    // 적금을 보관하고, 3월 입력을 마쳤다
    data = { ...data, assets: [account, { ...oldSavings, is_active: false }] };
    data = withMonthData(data, mar.id, {
      assetSnapshots: [assetSnap(account, 17_000_000)],
      entries: [actual(salary, 4_000_000)],
    });
    const marchBefore = reportFor(data, data.months[2]);
    expect(marchBefore.assetLines.map((l) => l.assetId)).toEqual([account.id]);
    expect(marchBefore).toMatchObject({ complete: true, consumption: 3_000_000 });

    // 2월을 다시 열어 고친다: 사실 적금에 100만 원이 남아 있었고 통장에는 1,500만 원이 있었다
    const reopened = reopen(data, feb.id, {
      ...febRows,
      assetSnapshots: [assetSnap(account, 15_000_000), assetSnap(oldSavings, 1_000_000)],
    });
    const february = reportFor(reopened, reopened.months[1]);
    expect(february).toMatchObject({ complete: true, consumption: 3_000_000 });
    expect(february.closing.assets).toBe(16_000_000);

    // 3월: 보관했더라도 금액이 남은 적금이 다시 집계되고(전월 값 유지) 확인을 요구한다
    const march = reportFor(reopened, reopened.months[2]);
    expect(march.opening.assets).toBe(16_000_000);
    expect(march.assetLines.find((l) => l.assetId === oldSavings.id)).toMatchObject({ confirmed: false, openValue: 1_000_000, value: 1_000_000 });
    expect(march.complete).toBe(false);
    expect(march.warnings.map((w) => w.code)).toEqual(["unconfirmed_asset"]);
    // 통장 1,500 → 1,700 (+200), 급여 400 → 소비 200. 적금은 아직 그대로라고 가정한다.
    expect(march.consumption).toBe(2_000_000);
    expect(march.closing.assets).toBe(18_000_000);
  });
});
