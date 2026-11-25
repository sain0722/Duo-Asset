import { describe, expect, it } from "vitest";

import { goalsView, history, planForMonth, reportFor } from "@/lib/data/derive";
import type { HouseholdData, MonthData } from "@/lib/data/types";
import { percentOf } from "@/lib/finance";
import { actual, allocation, asset, assetSnap, goal, liability, liabilitySnap, member, planItem } from "@/lib/finance/testing";
import type { FutureEvent, MonthRow, Scenario, Ym } from "@/lib/finance/types";

import {
  heroView,
  lastSettlement,
  nextSetupStep,
  settlementNotice,
  setupChecklist,
  trendView,
  unconfirmedCount,
  upcoming,
} from "./home-model";

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

function rows(partial: Partial<MonthData> = {}): MonthData {
  return { assetSnapshots: [], liabilitySnapshots: [], entries: [], ...partial };
}

const BASE_SCENARIO: Scenario = {
  id: "scenario-base",
  household_id: "household-1",
  name: "기본 계획",
  is_base: true,
  assumptions: { horizonYears: 2 },
  excluded_event_ids: [],
  sort_order: 0,
  version: 1,
  created_at: "",
  updated_at: "",
};

function close(data: HouseholdData, monthId: string, next: MonthRow): HouseholdData {
  const month = data.months.find((m) => m.id === monthId)!;
  const summary = JSON.parse(JSON.stringify(reportFor(data, month)));
  const months = data.months.map((m) => (m.id === monthId ? { ...m, status: "closed" as const, summary } : m));
  const rest = Object.fromEntries(Object.entries(data.monthData).filter(([id]) => id !== monthId));
  return { ...data, months: [...months, next], monthData: { ...rest, [next.id]: rows() } };
}

function withRows(data: HouseholdData, monthId: string, partial: Partial<MonthData>): HouseholdData {
  return { ...data, monthData: { ...data.monthData, [monthId]: rows(partial) } };
}

function event(overrides: Partial<FutureEvent> & Pick<FutureEvent, "month" | "name">): FutureEvent {
  return {
    id: `event-${++seq}`,
    household_id: "household-1",
    scenario_id: null,
    kind: "one_time",
    params: { amount: -1_000_000, asAsset: false },
    memo: "",
    version: 1,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

/** 9월(기준 월)·10월을 마감하고 11월이 열린 가구 */
function household() {
  const a = member("하늘");
  const b = member("바다");
  const account = asset({ kind: "cash", owner_member_id: a.id, name: "급여통장" });
  const deposit = asset({ kind: "deposit", name: "예금", maturity_date: "2027-06-30" });
  const car = liability({
    kind: "installment",
    name: "자동차 할부",
    original_principal: 3_000_000,
    monthly_payment: 500_000,
    term_months: 6,
    start_month: "2026-07",
    payer_member_id: a.id,
    payment_day: 10,
  });
  const salaryA = planItem({ kind: "income", amount: 4_000_000, member_id: a.id, name: "하늘 급여", pay_day: 25 });
  const salaryB = planItem({ kind: "income", amount: 3_000_000, member_id: b.id, name: "바다 급여", pay_day: 31 });
  const benefit = planItem({ kind: "benefit", amount: 200_000, member_id: a.id, name: "식비 카드", pay_day: 28 });
  const housing = planItem({ kind: "expense", amount: 600_000, name: "주거비", pay_day: 28 });
  const [sep, oct, nov] = [monthRow("2026-09"), monthRow("2026-10"), monthRow("2026-11")];

  let data: HouseholdData = {
    household: { id: "household-1", name: "테스트", created_at: "" },
    me: a,
    members: [a, b],
    assets: [account, deposit],
    liabilities: [car],
    planItems: [salaryA, salaryB, benefit, housing],
    months: [sep],
    monthData: {
      [sep.id]: rows({
        assetSnapshots: [assetSnap(account, 10_000_000), assetSnap(deposit, 5_000_000)],
        liabilitySnapshots: [liabilitySnap(car, 1_500_000)],
      }),
    },
    goals: [],
    goalAllocations: [],
    scenarios: [BASE_SCENARIO],
    events: [],
  };
  data = close(data, sep.id, oct);
  data = withRows(data, oct.id, {
    assetSnapshots: [assetSnap(account, 12_000_000), assetSnap(deposit, 5_000_000)],
    liabilitySnapshots: [liabilitySnap(car, 1_000_000)],
    entries: [actual(salaryA, 4_000_000), actual(salaryB, 3_000_000)],
  });
  data = close(data, oct.id, nov);
  return { data, a, b, account, deposit, car, sep, oct, nov };
}

// ───────────────────────── 테스트 ─────────────────────────

describe("순자산 히어로", () => {
  it("열린 달에 확인한 잔액이 없으면 마지막 마감 달 기준이고, 증감은 그 달 한 달의 변화다", () => {
    const { data } = household();
    const hero = heroView(data)!;
    // 9월 말 순자산 13,500,000 → 10월 말 16,000,000
    expect(hero.basis).toEqual({ kind: "closed", month: "2026-10" });
    expect(hero.totals.netWorth).toBe(16_000_000);
    expect(hero.change).toEqual({ amount: 2_500_000, since: "2026-09" });
  });

  it("일부 잔액을 확인하면 진행 중이고, 증감은 마지막 마감 달 말 대비다", () => {
    const { data: base, nov, account } = household();
    const data = withRows(base, nov.id, { assetSnapshots: [assetSnap(account, 12_300_000)] });
    const hero = heroView(data)!;
    expect(hero.basis).toEqual({ kind: "in_progress", month: "2026-11" });
    expect(hero.change).toEqual({ amount: 300_000, since: "2026-10" });
  });

  it("마감한 달이 없으면 기준 월이고 증감은 없다", () => {
    const { data: full, sep } = household();
    const data: HouseholdData = {
      ...full,
      months: [{ ...sep, status: "open", summary: null }],
      monthData: { [sep.id]: rows({ assetSnapshots: [assetSnap(full.assets[0], 1_000_000)] }) },
    };
    expect(heroView(data)).toMatchObject({ basis: { kind: "baseline", month: "2026-09" }, change: null });
  });
});

describe("정산 안내", () => {
  it("정산할 달이 이번 달보다 앞서면 마무리 안내와 미확인 건수", () => {
    const { data, nov } = household();
    const notice = settlementNotice(data, "2026-12-03");
    expect(notice).toEqual({ kind: "overdue", month: "2026-11", unconfirmed: unconfirmedCount(reportFor(data, nov)) });
    expect(notice!.unconfirmed).toBeGreaterThan(0);
  });

  it("이번 달은 말일 5일 전부터 준비 안내", () => {
    const { data } = household();
    expect(settlementNotice(data, "2026-11-24")).toBeNull();
    expect(settlementNotice(data, "2026-11-25")).toMatchObject({ kind: "prepare", month: "2026-11", daysLeft: 5 });
    expect(settlementNotice(data, "2026-11-30")).toMatchObject({ kind: "prepare", daysLeft: 0 });
  });

  it("마감한 달이 없으면 시작하기 체크리스트가 대신한다", () => {
    const { data: full, sep } = household();
    const data: HouseholdData = { ...full, assets: [], liabilities: [], planItems: [], months: [{ ...sep, status: "open", summary: null }], monthData: {} };
    expect(settlementNotice(data, "2026-11-28")).toBeNull();
    const steps = setupChecklist(data)!;
    expect(steps.map((step) => [step.key, step.done])).toEqual([
      ["assets", false],
      ["liabilities", false],
      ["plan", false],
      ["close", false],
    ]);
    expect(nextSetupStep(steps)).toBe("assets");
    // 부채는 선택 단계: 자산을 등록하면 다음은 월급·배분
    const next = setupChecklist({ ...data, assets: full.assets })!;
    expect(nextSetupStep(next)).toBe("plan");
    expect(setupChecklist(full)).toBeNull();
  });
});

describe("지난 정산 결과", () => {
  it("마지막으로 마감한 달의 동결 결과와 저축 목표 달성률", () => {
    const { data } = household();
    const result = lastSettlement(data)!;
    const report = reportFor(data, data.months[1]);
    expect(result.month).toBe("2026-10");
    expect(result.report).toBe(data.months[1].summary);
    expect(result.achievement).toBe(percentOf(report.savings, report.plan.savings));
    expect(result.joint).toMatchObject({ budget: 600_000 });
  });

  it("기준 월만 마감했으면 없다", () => {
    const { data } = household();
    const onlyBaseline: HouseholdData = { ...data, months: [data.months[0], { ...data.months[1], status: "open", summary: null }] };
    expect(lastSettlement(onlyBaseline)).toBeNull();
  });
});

describe("자산 추이", () => {
  it("기간만큼 자르고 열린 달을 잠정으로 표시한다", () => {
    const { data } = household();
    const view = trendView(history(data), "netWorth", "6");
    expect(view.rows.map((row) => row.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(view.rows[1].value).toBe(16_000_000);
    expect(view.provisional).toEqual(["2026-11"]);
    expect(trendView(history(data), "liabilities", "all").rows.map((row) => row.value)).toEqual([
      1_500_000, 1_000_000, 1_000_000,
    ]);
  });
});

describe("다가오는 일", () => {
  const today = "2026-11-25";

  function build(data: HouseholdData) {
    return upcoming(data, { today, plan: planForMonth(data, "2026-11"), goals: goalsView(data, "2026-11") });
  }

  it("오늘 이후의 급여일·납부일만, 말일을 넘는 날은 말일로. 비현금 복지는 빠진다", () => {
    const { data } = household();
    expect(build(data).thisMonth.map((item) => [item.day, item.name])).toEqual([
      [28, "주거비"],
      [30, "바다 급여"],
    ]);
  });

  it("12개월 안에 끝나는 부채와 풀리는 월 납부액, 만기 자산", () => {
    const { data, car, deposit } = household();
    const ahead = build(data).ahead;
    expect(ahead).toContainEqual({ key: `debt:${car.id}`, kind: "debt_end", month: "2026-12", name: "자동차 할부", freed: 500_000 });
    expect(ahead).toContainEqual({
      key: `asset:${deposit.id}`,
      kind: "maturity",
      month: "2027-06",
      date: "2027-06-30",
      name: "예금",
      value: 5_000_000,
    });
  });

  it("기본 시나리오의 가까운 미래 이벤트 3개 (지난 것과 다른 시나리오 전용은 빼고)", () => {
    const { data: base } = household();
    const data: HouseholdData = {
      ...base,
      events: [
        event({ name: "지난 일", month: "2026-10" }),
        event({ name: "넷째", month: "2027-09" }),
        event({ name: "첫째", month: "2026-12" }),
        event({ name: "다른 시나리오", month: "2027-01", scenario_id: "other" }),
        event({ name: "둘째", month: "2027-02", kind: "income_change", params: { memberId: null, monthlyDelta: 500_000, endMonth: null } }),
        event({ name: "셋째", month: "2027-03" }),
      ],
    };
    const events = build(data).ahead.filter((item) => item.kind === "event");
    expect(events.map((item) => item.name)).toEqual(["첫째", "둘째", "셋째"]);
    expect(events.map((item) => (item.kind === "event" ? item.amount : null))).toEqual([-1_000_000, 500_000, -1_000_000]);
  });

  it("진행 중인 목표 중 달성률 상위 2개", () => {
    const { data: base, account, deposit } = household();
    const goals = [
      goal({ name: "적음", target_amount: 100_000_000, basis: "manual", manual_amount: 1_000_000 }),
      goal({ name: "달성", target_amount: 1_000_000, basis: "manual", manual_amount: 2_000_000 }),
      goal({ name: "절반", target_amount: 10_000_000, basis: "linked" }),
      goal({ name: "대부분", target_amount: 5_000_000, basis: "linked" }),
    ];
    const data: HouseholdData = {
      ...base,
      goals,
      goalAllocations: [allocation(goals[2], account, 5_000_000), allocation(goals[3], deposit, 4_000_000)],
    };
    expect(build(data).goals.map((g) => [g.name, g.percent])).toEqual([
      ["대부분", 80],
      ["절반", 50],
    ]);
  });
});
