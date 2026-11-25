import { describe, expect, it } from "vitest";
import { actual, asset, assetSnap, liability, liabilitySnap, member, planItem } from "@/lib/finance/testing";
import type { Asset, Liability, MonthRow, PlanItem, Scenario, Ym } from "@/lib/finance/types";
import {
  canClose,
  canReopen,
  currentPosition,
  history,
  planForMonth,
  planLinesFor,
  projectionBase,
  reportFor,
  simulateScenario,
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
