import { describe, expect, it } from "vitest";

import { computeMonthReport, suggestInputs } from "@/lib/finance";
import { actual, asset, assetSnap, liability, liabilitySnap, member, monthInput, planItem } from "@/lib/finance/testing";

import {
  assetValueChange,
  balanceJump,
  suspiciousBalances,
  balanceWithPlannedSaving,
  checklist,
  planComparison,
  plannedEntryInputs,
  overspentPockets,
  plannedSavingsByAsset,
  pocketUsage,
  principalAfter,
  progressOf,
  remainingAfter,
  resultWarnings,
  rowIdOf,
  savingsAchievement,
  scheduledBalance,
  suggestionInputs,
  suggestionRows,
} from "./model";

/* 금액은 모두 가상의 값이다. */
function fixture() {
  const a = member("가");
  const b = member("나");
  const cash = asset({ kind: "cash", owner_member_id: a.id });
  const savings = asset({ kind: "savings", owner_member_id: b.id });
  const stock = asset({ kind: "investment", owner_member_id: a.id });
  const loan = liability({ kind: "installment", original_principal: 1_200_000, monthly_payment: 100_000, term_months: 12, payer_member_id: a.id });
  const salary = planItem({ kind: "income", amount: 3_000_000, member_id: a.id });
  const contribution = planItem({ kind: "contribution", amount: 1_000_000, member_id: a.id });
  const saving = planItem({ kind: "saving", amount: 200_000, member_id: b.id, asset_id: savings.id });
  const saving2 = planItem({ kind: "saving", amount: 50_000, member_id: b.id, asset_id: savings.id });
  return { a, b, cash, savings, stock, loan, salary, contribution, saving, saving2 };
}

describe("checklist", () => {
  it("수입·자산·부채·납입 줄을 확인 여부와 함께 순서대로 모은다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash, f.savings],
        liabilities: [f.loan],
        planItems: [f.salary, f.contribution],
        prevAssets: [assetSnap(f.cash, 1_000_000), assetSnap(f.savings, 500_000)],
        prevLiabilities: [liabilitySnap(f.loan, 600_000)],
        curAssets: [assetSnap(f.cash, 1_100_000)],
        entries: [actual(f.salary, 3_000_000)],
      }),
    );
    const items = checklist(report);
    expect(items.map((item) => [item.section, item.done])).toEqual([
      ["income", true],
      ["assets", true],
      ["assets", false],
      ["liabilities", false],
      ["transfers", false],
    ]);
    expect(progressOf(items)).toEqual({ done: 2, total: 5 });
    expect(progressOf(items, "assets")).toEqual({ done: 1, total: 2 });
    // 미확인이 하나라도 있으면 결과도 미완료다
    expect(report.complete).toBe(false);
  });

  it("자산은 화면처럼 주머니 순서로 정렬한다", () => {
    const f = fixture();
    const joint = asset({ kind: "cash", owner_member_id: null });
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [joint, f.savings, f.cash],
        prevAssets: [assetSnap(joint, 1), assetSnap(f.savings, 1), assetSnap(f.cash, 1)],
      }),
    );
    const ids = checklist(report, [f.a.id, f.b.id, "joint"]).map((item) => item.pocket);
    expect(ids).toEqual([f.a.id, f.b.id, "joint"]);
  });

  it("모두 확인하면 report.complete 와 같아진다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash],
        planItems: [f.salary],
        prevAssets: [assetSnap(f.cash, 1_000_000)],
        curAssets: [assetSnap(f.cash, 1_000_000)],
        entries: [actual(f.salary, 0)],
      }),
    );
    const progress = progressOf(checklist(report));
    expect(progress.done).toBe(progress.total);
    expect(report.complete).toBe(true);
  });
});

describe("자산·부채 줄 계산", () => {
  it("연결된 저축 계획을 자산별로 합한다", () => {
    const f = fixture();
    const report = computeMonthReport(monthInput({ members: [f.a, f.b], planItems: [f.saving, f.saving2, f.salary] }));
    expect(plannedSavingsByAsset(report.planLines)).toEqual({ [f.savings.id]: 250_000 });
  });

  it("평가형 자산의 순투입액은 월초 순투입액에 순입금을 더한다 (음수 가능)", () => {
    expect(principalAfter({ openPrincipal: 16_000_000 }, 300_000)).toBe(16_300_000);
    expect(principalAfter({ openPrincipal: 1_000_000 }, -1_500_000)).toBe(-500_000);
  });

  it("예정대로 확인한 잔액과 전월 대비 변화", () => {
    expect(balanceWithPlannedSaving({ openValue: 6_000_000 }, 500_000)).toBe(6_500_000);
    expect(assetValueChange({ value: 900_000, openValue: 1_000_000 })).toBe(-100_000);
  });

  it("부채 예정 잔액은 예정 원금만큼 줄고 0 아래로 내려가지 않는다", () => {
    expect(scheduledBalance({ openBalance: 600_000, plannedPrincipal: 100_000 })).toBe(500_000);
    expect(scheduledBalance({ openBalance: 50_000, plannedPrincipal: 100_000 })).toBe(0);
  });
});

describe("결과", () => {
  it("계획 대비 실적과 달성률", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash],
        planItems: [f.salary, planItem({ kind: "saving", amount: 800_000, member_id: f.a.id, asset_id: f.cash.id })],
        prevAssets: [assetSnap(f.cash, 1_000_000)],
        curAssets: [assetSnap(f.cash, 2_000_000)],
        entries: [actual(f.salary, 3_100_000)],
      }),
    );
    const rows = planComparison(report);
    const income = rows.find((row) => row.key === "income")!;
    expect(income).toMatchObject({ planned: 3_000_000, actual: 3_100_000, diff: 100_000 });
    const savings = rows.find((row) => row.key === "savings")!;
    expect(savings.actual).toBe(1_000_000);
    expect(savings.diff).toBe(savings.actual - savings.planned);
    expect(report.plan.savings).toBe(800_000);
    expect(savingsAchievement(report)).toBe(125);
  });

  it("계획 저축·계획 소비가 0이면 비율을 만들지 않는다", () => {
    expect(pocketUsage({ consumption: 100, plannedConsumption: 0 })).toBeNull();
    expect(pocketUsage({ consumption: 50, plannedConsumption: 200 })).toBe(25);
  });

  it("미확인 경고는 결과 경고에서 뺀다", () => {
    const f = fixture();
    const report = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash],
        prevAssets: [assetSnap(f.cash, 1_000_000)],
        curAssets: [assetSnap(f.cash, 3_000_000)],
      }),
    );
    // 수입 없이 잔액만 늘면 소비가 음수 → 경고
    expect(resultWarnings(report).map((w) => w.code)).toContain("negative_consumption");
    expect(resultWarnings(report).every((w) => !w.code.startsWith("unconfirmed_"))).toBe(true);
  });
});

describe("예정대로 한 번에 확인", () => {
  function report() {
    const f = fixture();
    const lease = asset({ kind: "lease_deposit", name: "보증금", owner_member_id: null });
    const free = liability({ kind: "interest_only", name: "차용금", original_principal: 5_000_000, monthly_payment: 0, payer_member_id: f.b.id });
    const r = computeMonthReport(
      monthInput({
        members: [f.a, f.b],
        assets: [f.cash, f.savings, lease, f.stock],
        liabilities: [f.loan, free],
        planItems: [f.salary, f.contribution, f.saving],
        prevAssets: [assetSnap(f.cash, 1_000_000), assetSnap(f.savings, 500_000), assetSnap(lease, 10_000_000), assetSnap(f.stock, 2_000_000)],
        prevLiabilities: [liabilitySnap(f.loan, 600_000), liabilitySnap(free, 5_000_000)],
      }),
    );
    return { f, lease, free, report: r };
  }

  it("확인 창의 줄: 이름·금액·근거를 화면 순서로", () => {
    const { report: r } = report();
    const rows = suggestionRows(suggestInputs(r), r);
    expect(rows.map((row) => [row.section, row.amount, row.reason])).toEqual([
      ["income", 3_000_000, "계획대로"],
      ["assets", 700_000, "전월 + 저축 계획"],
      ["assets", 10_000_000, "전월과 동일"],
      ["liabilities", 500_000, "예정 상환"],
      ["liabilities", 5_000_000, "전월과 동일"],
      ["transfers", 1_000_000, "계획대로"],
    ]);
    // 통장·투자자산은 직접 확인해야 하므로 들어 있지 않다
    expect(rows.some((row) => row.section === "assets" && row.amount === 1_000_000)).toBe(false);
    // 본문과 같은 "이름 → 공용통장" 형식 ("공용통장 입금 입금" 이 되지 않게)
    expect(rows.at(-1)!.name).toBe(`${r.pockets.find((p) => p.pocket === r.contributionLines[0].pocket)!.name} → 공용통장`);
    expect(checklist(r).find((item) => item.section === "transfers")!.label).toBe(rows.at(-1)!.name);
  });

  it("한 번에 확인한 뒤 남는 항목은 통장·투자자산처럼 직접 볼 것뿐이다", () => {
    const { f, report: r } = report();
    const rows = suggestionRows(suggestInputs(r), r);
    const items = checklist(r);
    // 제안의 행 id 는 확인 목록의 행 id 와 같다
    expect(rows.every((row) => items.some((item) => item.rowId === row.rowId))).toBe(true);
    const left = remainingAfter(items, rows);
    expect(left.map((item) => item.rowId)).toEqual([rowIdOf("asset", f.cash.id), rowIdOf("asset", f.stock.id)]);
  });

  it("저장할 값: 테이블별로 묶고 계획 항목 id 를 연결한다", () => {
    const { f, report: r } = report();
    const inputs = suggestionInputs(suggestInputs(r), r);
    expect(inputs.assetSnapshots).toEqual([
      { asset_id: f.savings.id, value: 700_000, principal: 700_000 },
      expect.objectContaining({ value: 10_000_000 }),
    ]);
    // 예정 이자가 없으면 이자를 기록하지 않는다
    expect(inputs.liabilitySnapshots.every((row) => !("interest_paid" in row))).toBe(true);
    expect(inputs.entries).toEqual([
      { kind: "income", member_id: f.a.id, plan_item_id: f.salary.id, name: f.salary.name, amount: 3_000_000 },
      { kind: "contribution", member_id: f.a.id, plan_item_id: f.contribution.id, name: f.contribution.name, amount: 1_000_000 },
    ]);
  });

  it("모두 계획대로: 아직 확인하지 않은 계획 줄만", () => {
    const f = fixture();
    const bonus = planItem({ kind: "income", amount: 500_000, member_id: f.b.id });
    const r = computeMonthReport(
      monthInput({ members: [f.a, f.b], planItems: [f.salary, bonus], entries: [actual(f.salary, 2_900_000)] }),
    );
    expect(plannedEntryInputs("income", r.incomeLines, r.planLines)).toEqual([
      { kind: "income", member_id: f.b.id, plan_item_id: bonus.id, name: bonus.name, amount: 500_000 },
    ]);
  });
});

describe("입력 실수 안내", () => {
  it("잔액이 1/5 아래로 줄거나 5배 이상 늘면 알린다 (자릿수 실수)", () => {
    expect(balanceJump(11_400_000, 1_267_000)).toBe("drop"); // 0 하나를 빠뜨렸다
    expect(balanceJump(20_892_000, 1_000_000)).toBe("drop");
    expect(balanceJump(1_200_000, 12_000_000)).toBe("rise"); // 0 하나를 더 넣었다
    expect(balanceJump(1_200_000, 11_500_000)).toBe("rise"); // 실제 잔액이 조금 줄었어도 잡힌다
  });

  it("흔한 변동·작은 금액·0(해지)·새 자산은 알리지 않는다", () => {
    expect(balanceJump(3_980_000, 1_500_000)).toBeNull(); // 입출금 통장이 절반 아래로 줄어드는 것은 흔하다
    expect(balanceJump(5_000_000, 1_000_000)).toBeNull(); // 정확히 1/5
    expect(balanceJump(1_500_000, 600_000)).toBeNull(); // 차이가 100만 원 미만
    expect(balanceJump(100_000, 900_000)).toBeNull(); // 9배지만 차이가 작다
    expect(balanceJump(5_000_000, 0)).toBeNull();
    expect(balanceJump(0, 5_000_000)).toBeNull();
    expect(balanceJump(1_000_000, 4_999_999)).toBeNull(); // 5배 미만
  });

  it("크게 달라진 잔액을 자산·부채에서 모은다 (확인한 값만, 기준 월 제외)", () => {
    const report = {
      isBaseline: false,
      assetLines: [
        { name: "통장", confirmed: true, openValue: 11_400_000, value: 1_267_000 },
        { name: "미확인", confirmed: false, openValue: 11_400_000, value: 11_400_000 },
        { name: "적금", confirmed: true, openValue: 5_000_000, value: 5_500_000 },
      ],
      liabilityLines: [{ name: "대출", confirmed: true, openBalance: 30_000_000, balance: 300_000_000 }],
    } as unknown as Parameters<typeof suspiciousBalances>[0];
    expect(suspiciousBalances(report)).toEqual([
      { section: "assets", name: "통장", jump: "drop" },
      { section: "liabilities", name: "대출", jump: "rise" },
    ]);
    expect(suspiciousBalances({ ...report, isBaseline: true })).toEqual([]);
  });

  it("주머니 소비가 계획의 200%를 넘으면 그 주머니를 돌려준다", () => {
    const pocket = (name: string, consumption: number, plannedConsumption: number) => ({ pocket: name, name, consumption, plannedConsumption });
    const report = {
      complete: true,
      isBaseline: false,
      pockets: [pocket("가", 3_610_000, 800_000), pocket("나", 1_600_000, 800_000), pocket("다", 2_000_000, 1_000_000), pocket("공동", 500_000, 0)],
    } as unknown as Parameters<typeof overspentPockets>[0];
    expect(overspentPockets(report)).toEqual([{ pocket: "가", name: "가", usage: 451.3 }]);
    // "나"(200%) 는 넘은 것이 아니고, 계획이 0 인 공동은 비율이 없다. 정산 전이면 알리지 않는다
    expect(overspentPockets({ ...report, complete: false })).toEqual([]);
  });
});
