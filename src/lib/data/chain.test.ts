/**
 * 여러 달을 이어 붙인 정산의 불변식 (docs/finance-rules.md 3·4·5·8절).
 *
 * 한 달짜리 항등식 테스트(settlement.test.ts)는 "직전 달 결과가 다음 달 월초 값이 된다"는
 * 연결을 보지 못한다. 여기서는 앱과 같은 순서로 — 입력, 확인, 마감, 다음 달, 가끔 마감 취소 —
 * 가상의 가구를 6개월씩 굴리면서 매달 다음이 성립하는지 본다.
 *
 *  (a) 4절의 항등식 3개, 원금 상환액·신규 차입은 가구 순액
 *  (b) 주머니 소비의 합 = 가구 소비지출
 *  (c) 주머니로 들어온 이동의 합 = 나간 이동의 합
 *  (d) 월초 합계 = 직전 달 월말 합계 (기초 조정 제외)
 *  (e) 마감한 달을 같은 입력으로 다시 열면 마감 당시와 같은 결과가 나온다
 *
 * 금액은 모두 시드 고정 난수로 만든 가상의 값이다.
 */
import { describe, expect, it } from "vitest";
import { ASSET_KINDS, memberIdOf } from "@/lib/finance";
import { asset, assetSnap, entry, liability, liabilitySnap, member, planItem } from "@/lib/finance/testing";
import type {
  Asset,
  AssetKind,
  Liability,
  MonthEntry,
  MonthReport,
  MonthRow,
  PlanItem,
  PlanLine,
  Ym,
} from "@/lib/finance/types";
import { addMonths } from "@/lib/month";
import { planLinesFor, reportFor } from "./derive";
import type { HouseholdData, MonthData } from "./types";

// ───────────────────────── 난수와 픽스처 ─────────────────────────

/** 시드 고정 난수 (mulberry32) */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let monthSeq = 0;

function monthRow(ym: Ym): MonthRow {
  return {
    id: `chain-month-${++monthSeq}`,
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

const EMPTY: MonthData = { assetSnapshots: [], liabilitySnapshots: [], entries: [] };

const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

// ───────────────────────── 불변식 ─────────────────────────

/** 마감 결과에 섞이면 안 되는 값(정수가 아닌 금액, NaN, Infinity)이 있는 경로를 모은다 */
function brokenAmounts(value: unknown, path: string, found: string[] = []): string[] {
  if (typeof value === "number") {
    const ok = path.endsWith(".savingsRate") ? Number.isFinite(value) : Number.isSafeInteger(value);
    if (!ok) found.push(`${path} = ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => brokenAmounts(item, `${path}[${index}]`, found));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) brokenAmounts(item, `${path}.${key}`, found);
  }
  return found;
}

function expectInvariants(report: MonthReport, prev: MonthReport | null, where: string) {
  const contributed = sum(report.assetLines, (line) => line.contributed);
  const netRepayment = sum(report.liabilityLines, (line) => line.principalPaid);

  // (a) 4절: 항상 성립하는 항등식
  expect(report.netWorthChange, `${where}: 순자산 변화 = 저축 + 원금 상환 + 평가손익 + 기초 조정`).toBe(
    report.savings + report.principalRepaid + report.investmentGain + report.otherValuation + report.adjustment,
  );
  expect(report.income, `${where}: 수입 = 소비 + 저축 + 원금 상환`).toBe(
    report.consumption + report.savings + report.principalRepaid,
  );
  expect(report.savings, `${where}: 저축 = Σ자산 순투입 − 신규 차입`).toBe(contributed - report.newBorrowing);
  // 4절: 원금 상환액·신규 차입은 부채 잔액 합계의 변화(가구 순액)이고 둘 중 하나는 0이다
  expect(report.principalRepaid - report.newBorrowing, `${where}: 원금 상환 − 신규 차입 = 부채 순상환 합`).toBe(netRepayment);
  expect(Math.min(report.principalRepaid, report.newBorrowing), `${where}: 상환과 차입은 순액`).toBe(0);
  expect(Math.max(report.principalRepaid, report.newBorrowing), `${where}: 순액의 크기`).toBe(Math.abs(netRepayment));

  // 4절: 총자산·총부채·순자산
  expect(report.closing.assets, `${where}: 총자산`).toBe(sum(report.assetLines, (line) => line.value));
  expect(report.closing.liabilities, `${where}: 총부채`).toBe(sum(report.liabilityLines, (line) => line.balance));
  expect(report.closing.netWorth, `${where}: 순자산`).toBe(report.closing.assets - report.closing.liabilities);
  expect(report.netWorthChange, `${where}: 순자산 변화 = 월말 − 월초`).toBe(report.closing.netWorth - report.opening.netWorth);

  // 8절: complete = 미확인 항목이 하나도 없다 (기준 월은 잔액만 본다)
  const balancesConfirmed =
    report.assetLines.every((line) => line.confirmed) && report.liabilityLines.every((line) => line.confirmed);
  const flowsConfirmed =
    report.incomeLines.every((line) => line.actual !== null) &&
    report.contributionLines.every((line) => line.actual !== null);
  expect(report.complete, `${where}: complete`).toBe(balancesConfirmed && flowsConfirmed);

  if (report.isBaseline) {
    // 8절 6항: 기준 월은 잔액만 집계한다
    expect(
      [report.income, report.consumption, report.savings, report.principalRepaid, report.newBorrowing, report.adjustment],
      `${where}: 기준 월의 흐름 지표`,
    ).toEqual([0, 0, 0, 0, 0, 0]);
    expect(report.netWorthChange, `${where}: 기준 월의 순자산 변화`).toBe(0);
    expect(report.pockets, `${where}: 기준 월의 주머니`).toEqual([]);
  } else {
    // (b) 5절: 주머니 소비의 합 = 가구 소비지출
    expect(sum(report.pockets, (p) => p.consumption), `${where}: 주머니 소비 합`).toBe(report.consumption);
    // (c) 내부 이동은 가구 합계에서 상쇄된다
    expect(sum(report.pockets, (p) => p.transfersIn), `${where}: 들어온 이동 합 = 나간 이동 합`).toBe(
      sum(report.pockets, (p) => p.transfersOut),
    );
    // 5절: 주머니 소비 = 수입 + 들어온 이동 − 나간 이동 − 자산 순투입 − 부채 순상환
    for (const p of report.pockets) {
      expect(p.consumption, `${where}: ${p.name} 주머니 소비`).toBe(
        p.income + p.transfersIn - p.transfersOut - p.assetContribution - p.principalPaid,
      );
      expect(p.unclassified, `${where}: ${p.name} 미분류 지출`).toBe(p.consumption - p.classified);
    }
    // 어느 주머니에도 속하지 않는 수입·자산·부채는 없다 (소유자·납입자를 바꿔도)
    expect(sum(report.pockets, (p) => p.income), `${where}: 주머니 수입 합`).toBe(report.income);
    expect(sum(report.pockets, (p) => p.assetContribution), `${where}: 주머니 순투입 합`).toBe(contributed);
    expect(sum(report.pockets, (p) => p.principalPaid), `${where}: 주머니 순상환 합`).toBe(netRepayment);
  }

  // (d) 3절: 월초 값은 직전 달 정산 결과의 월말 값이다 (기초 조정은 월초 합계에 넣지 않는다)
  if (prev) {
    expect(report.opening.assets, `${where}: 월초 총자산 = 직전 달 말 총자산`).toBe(prev.closing.assets);
    expect(report.opening.liabilities, `${where}: 월초 총부채 = 직전 달 말 총부채`).toBe(prev.closing.liabilities);
    expect(report.opening.netWorth, `${where}: 월초 순자산 = 직전 달 말 순자산`).toBe(prev.closing.netWorth);
  }

  // 1절 1항: 금액은 원 단위 정수
  expect(brokenAmounts(report, where)).toEqual([]);
}

/** 설정이나 주머니 구성과 무관하게 같아야 하는 가구 단위 결과 */
function householdFigures(report: MonthReport) {
  const three = (totals: MonthReport["opening"]) => [totals.assets, totals.liabilities, totals.netWorth];
  return {
    complete: report.complete,
    opening: three(report.opening),
    closing: three(report.closing),
    flows: [
      report.income,
      report.consumption,
      report.savings,
      report.principalRepaid,
      report.newBorrowing,
      report.investmentGain,
      report.otherValuation,
      report.adjustment,
      report.netWorthChange,
    ],
    // JSON 을 거치면 −0 이 0 이 되므로 맞춰 둔다
    savingsRate: report.savingsRate === null ? null : report.savingsRate + 0,
    plan: report.plan,
  };
}

// ───────────────────────── 가구 한 곳을 6개월 굴린다 ─────────────────────────

const MONTHS = 6;
/** 해를 넘기도록 10월에서 시작한다 (상여금 12월·1월, 만기일시상환 만기 1월) */
const START: Ym = "2025-10";

const ASSET_POOL: AssetKind[] = [
  "cash",
  "cash",
  "cash",
  "savings",
  "deposit",
  "investment",
  "pension",
  "vehicle",
  "real_estate",
  "lease_deposit",
];

interface Stats {
  months: number;
  provisional: number;
  adjusted: number;
  borrowed: number;
  repaid: number;
  reopened: number;
  pocketChanged: number;
  transfers: number;
  singleMember: number;
  archivedWithBalance: number;
  dropped: number;
  oneMissing: number;
}

function runHousehold(seed: number, stats: Stats) {
  const random = rng(seed);
  const chance = (p: number) => random() < p;
  const won = (max: number) => Math.floor(random() * max);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

  const members = chance(0.25) ? [member("혼자")] : [member("하늘"), member("바다")];
  if (members.length === 1) stats.singleMember++;
  const pockets: (string | null)[] = [...members.map((m) => m.id), null];
  const otherPocket = (current: string | null) => pick(pockets.filter((p) => p !== current));

  // 등록할 자산·부채: appear = 처음 기록하는 달, existed = 전부터 갖고 있던 것(opening_* 로 등록)
  const assetPlan = ASSET_POOL.map((kind, index) => ({
    asset: asset({
      kind,
      name: `${ASSET_KINDS[kind].label} ${index}`,
      owner_member_id: pick(pockets),
      liquidity: ASSET_KINDS[kind].defaultLiquidity,
    }),
    appear: chance(0.6) ? 0 : 1 + Math.floor(random() * (MONTHS - 1)),
    existed: chance(0.5),
  }));
  const liabilityPlan = [
    liability({ kind: "installment", name: "자동차 할부", original_principal: 24_000_000, monthly_payment: 400_000 }),
    liability({ kind: "interest_only", name: "차용금", original_principal: 30_000_000, monthly_payment: 300_000 }),
    liability({
      kind: "equal_principal",
      name: "주택담보대출",
      original_principal: 240_000_000,
      annual_rate: 4.8,
      term_months: 240,
      start_month: "2025-01",
    }),
    // 첫 납부가 시뮬레이션 도중에 시작된다
    liability({ kind: "amortized", name: "신용대출", original_principal: 30_000_000, annual_rate: 5.9, term_months: 36, start_month: "2025-12" }),
    // 도중에 만기가 온다
    liability({ kind: "bullet", name: "단기 대출", original_principal: 10_000_000, annual_rate: 4, term_months: 3, start_month: "2025-11" }),
  ].map((item) => ({
    liability: { ...item, payer_member_id: pick(pockets) },
    appear: chance(0.5) ? 0 : 1 + Math.floor(random() * (MONTHS - 1)),
    existed: chance(0.5),
  }));

  const planItems: PlanItem[] = [];
  for (const m of members) {
    planItems.push(planItem({ kind: "income", amount: 2_000_000 + won(4_000_000), member_id: m.id, name: `${m.name} 급여` }));
    planItems.push(planItem({ kind: "contribution", amount: won(2_500_000), member_id: m.id, name: `${m.name} 납입` }));
    if (chance(0.5)) planItems.push(planItem({ kind: "saving", amount: won(1_000_000), member_id: m.id }));
    if (chance(0.5)) planItems.push(planItem({ kind: "expense", amount: won(300_000), member_id: m.id, name: "통신비" }));
  }
  planItems.push(planItem({ kind: "expense", amount: won(2_500_000), name: "공동생활비" }));
  if (chance(0.5)) planItems.push(planItem({ kind: "income", amount: won(500_000), income_type: "other", name: "공동 임대수입" }));
  planItems.push(
    planItem({ kind: "income", amount: won(3_000_000), member_id: members[0].id, income_type: "bonus", months_of_year: [12, 1], name: "상여금" }),
  );

  const first = monthRow(START);
  let data: HouseholdData = {
    household: { id: "household-1", name: "테스트", created_at: "" },
    me: members[0],
    members,
    assets: [],
    liabilities: [],
    planItems,
    months: [first],
    monthData: { [first.id]: EMPTY },
    goals: [],
    goalAllocations: [],
    scenarios: [],
    events: [],
  };
  /** DB 에 남아 있는 입력 행. 닫힌 달의 행은 HouseholdData 에서는 빠지지만 다시 열면 그대로 읽힌다. */
  const stored: Record<string, MonthData> = { [first.id]: EMPTY };

  const setRows = (monthId: string, rows: MonthData) => {
    stored[monthId] = rows;
    data = { ...data, monthData: { ...data.monthData, [monthId]: rows } };
  };
  const report = (index: number) => reportFor(data, data.months[index]);
  const prevReport = (index: number) => (index > 0 ? report(index - 1) : null);
  /** 마감: 결과를 동결하고 닫힌 달의 입력 행은 화면 데이터에서 뺀다. next 가 있으면 다음 달을 연다. */
  const close = (index: number, next?: MonthRow) => {
    const month = data.months[index];
    const summary: MonthReport = JSON.parse(JSON.stringify(reportFor(data, month)));
    const months = data.months.map((m) => (m.id === month.id ? { ...m, status: "closed" as const, summary } : m));
    const monthData = Object.fromEntries(Object.entries(data.monthData).filter(([id]) => id !== month.id));
    if (next) {
      stored[next.id] = EMPTY;
      data = { ...data, months: [...months, next], monthData: { ...monthData, [next.id]: EMPTY } };
    } else {
      data = { ...data, months, monthData };
    }
  };

  const randomAssetSnapshot = (a: Asset, withOpening: boolean) => {
    const balanceOnly = ASSET_KINDS[a.kind].tracking === "balance";
    // 가끔 0원으로 정리하고, 입출금 통장은 가끔 마이너스가 된다
    let value = chance(0.1) ? 0 : won(40_000_000);
    if (a.kind === "cash" && chance(0.08)) value = -won(3_000_000);
    const principal = balanceOnly ? value : value === 0 && chance(0.5) ? 0 : won(40_000_000) - 8_000_000;
    const openingValue = won(30_000_000);
    return assetSnap(
      a,
      value,
      principal,
      withOpening
        ? { opening_value: openingValue, opening_principal: balanceOnly ? openingValue : won(30_000_000) }
        : {},
    );
  };
  const randomLiabilitySnapshot = (l: Liability, withOpening: boolean) =>
    liabilitySnap(l, chance(0.1) ? 0 : won(Math.round(l.original_principal * 1.1)), {
      interest_paid: chance(0.5) ? won(1_000_000) : null,
      opening_balance: withOpening ? won(l.original_principal) : null,
    });
  /** 계획 줄에 대한 실제 값. 가끔 계획과 다른 주머니로 기록한다. */
  const actualFor = (line: PlanLine, amount: number): MonthEntry => {
    let memberId = memberIdOf(line.pocket);
    const candidates = line.kind === "contribution" ? members.map((m) => m.id) : pockets;
    if (candidates.length > 1 && chance(0.15)) {
      memberId = pick(candidates.filter((p) => p !== memberId));
      stats.pocketChanged++;
    }
    return entry({
      kind: line.kind as MonthEntry["kind"],
      amount,
      member_id: memberId,
      plan_item_id: line.planItemId!,
      name: line.name,
    });
  };

  for (let i = 0; i < MONTHS; i++) {
    const ym = addMonths(START, i);
    const row = data.months[i];
    expect(row.month).toBe(ym);
    const where = `시드 ${seed} · ${ym}`;

    // ── 설정 변경: 보관·복원, 소유자·납입자 변경, 계획 금액 변경 ──
    /** 이번 달에 보관을 해제한 자산·부채 */
    const restored = new Set<string>();
    if (i > 0) {
      const toggle = <T extends { id: string; is_active: boolean }>(item: T): boolean => {
        if (!chance(0.1)) return item.is_active;
        if (!item.is_active) restored.add(item.id);
        return !item.is_active;
      };
      data = {
        ...data,
        assets: data.assets.map((a) => ({
          ...a,
          is_active: toggle(a),
          owner_member_id: chance(0.1) ? otherPocket(a.owner_member_id) : a.owner_member_id,
        })),
        liabilities: data.liabilities.map((l) => ({
          ...l,
          is_active: toggle(l),
          payer_member_id: chance(0.1) ? otherPocket(l.payer_member_id) : l.payer_member_id,
        })),
        planItems: data.planItems.map((item) => (chance(0.1) ? { ...item, amount: won(3_000_000) } : item)),
      };
    }

    // ── 이번 달에 처음 등록하는 자산·부채: 앱처럼 등록과 동시에 첫 스냅샷을 남긴다 ──
    const before = prevReport(i);
    const known = new Set(data.assets.map((a) => a.id));
    const knownLiabilities = new Set(data.liabilities.map((l) => l.id));
    const newAssets = assetPlan.filter((p) => p.appear === i);
    const newLiabilities = liabilityPlan.filter((p) => p.appear === i);
    data = {
      ...data,
      assets: [...data.assets, ...newAssets.map((p) => p.asset)],
      liabilities: [...data.liabilities, ...newLiabilities.map((p) => p.liability)],
    };

    // ── 1단계: 일부만 입력한 상태 (미확인이 섞여 있다) ──
    const assetSnapshots = [
      ...newAssets.map((p) => randomAssetSnapshot(p.asset, p.existed)),
      // 이미 있던 자산: 일부는 건너뛰고(미확인), 가끔 예전 opening_* 이 남아 있다
      ...data.assets.filter((a) => known.has(a.id) && chance(0.65)).map((a) => randomAssetSnapshot(a, chance(0.15))),
    ];
    const liabilitySnapshots = [
      ...newLiabilities.map((p) => randomLiabilitySnapshot(p.liability, p.existed)),
      ...data.liabilities
        .filter((l) => knownLiabilities.has(l.id) && chance(0.65))
        .map((l) => randomLiabilitySnapshot(l, chance(0.15))),
    ];
    const lines = planLinesFor(data, row);
    const entries: MonthEntry[] = [];
    for (const line of lines) {
      if (line.kind === "income" || line.kind === "contribution") {
        if (chance(0.65)) entries.push(actualFor(line, chance(0.2) ? 0 : won(6_000_000)));
      } else if (line.kind === "expense") {
        if (chance(0.4)) entries.push(actualFor(line, won(2_000_000)));
      }
    }
    // 주머니 간 이동, 계획에 없던 수입·지출
    for (let k = 0; k < 2; k++) {
      if (!chance(0.5)) continue;
      const from = pick(pockets);
      entries.push(entry({ kind: "transfer", amount: won(1_500_000), member_id: from, to_member_id: otherPocket(from) }));
      stats.transfers++;
    }
    if (chance(0.3)) entries.push(entry({ kind: "income", amount: won(800_000), member_id: pick(pockets), name: "기타 수입" }));
    if (chance(0.4)) entries.push(entry({ kind: "expense", amount: won(800_000), member_id: pick(pockets), name: "기타 지출" }));
    setRows(row.id, { assetSnapshots, liabilitySnapshots, entries });

    const provisional = report(i);
    expectInvariants(provisional, before, `${where} (입력 중)`);
    if (!provisional.complete) stats.provisional++;
    if (provisional.assetLines.some((l) => !l.confirmed && l.value !== 0 && !data.assets.find((a) => a.id === l.assetId)!.is_active)) {
      stats.archivedWithBalance++;
    }

    // ── 2단계: 남은 미확인을 "전월과 동일"·"계획대로"로 확인한다 ──
    const confirmedRows: MonthData = {
      assetSnapshots: [
        ...assetSnapshots,
        ...provisional.assetLines
          .filter((line) => !line.confirmed)
          .map((line) => assetSnap(data.assets.find((a) => a.id === line.assetId)!, line.value, line.principal)),
      ],
      liabilitySnapshots: [
        ...liabilitySnapshots,
        ...provisional.liabilityLines
          .filter((line) => !line.confirmed)
          .map((line) => liabilitySnap(data.liabilities.find((l) => l.id === line.liabilityId)!, line.balance)),
      ],
      entries: [
        ...entries,
        ...[...provisional.incomeLines, ...provisional.contributionLines]
          .filter((line) => line.actual === null)
          .map((line) => {
            const planLine = lines.find((l) => l.key === line.key)!;
            return entry({
              kind: planLine.kind as MonthEntry["kind"],
              amount: line.planned!,
              member_id: memberIdOf(line.pocket),
              plan_item_id: planLine.planItemId!,
              name: line.name,
            });
          }),
      ],
    };
    setRows(row.id, confirmedRows);
    const settled = report(i);
    expectInvariants(settled, before, `${where} (확인 완료)`);
    expect(settled.complete, `${where}: 모두 확인하면 마감할 수 있다`).toBe(true);
    // 8절 1항: 잠정값은 "미확인 수입 = 계획 금액, 미확인 잔액 = 전월 값"이라는 가정이므로,
    // 그 가정 그대로 확인하면 숫자는 변하지 않고 complete 만 바뀐다
    expect({ ...householdFigures(settled), complete: null }, `${where}: 가정대로 확인해도 결과는 같다`).toEqual({
      ...householdFigures(provisional),
      complete: null,
    });

    // ── 8절 2항: 금액이 남은 자산·부채, 계획된 수입·납입 중 하나라도 미확인이면 마감할 수 없다 ──
    const missingKind = pick(["asset", "liability", "income", "contribution"] as const);
    let withoutOne: MonthData | null = null;
    if (missingKind === "asset") {
      const candidates = confirmedRows.assetSnapshots.filter((s) => data.assets.find((a) => a.id === s.asset_id)!.is_active);
      const dropped = candidates.length > 0 ? pick(candidates) : null;
      if (dropped) withoutOne = { ...confirmedRows, assetSnapshots: confirmedRows.assetSnapshots.filter((s) => s !== dropped) };
    } else if (missingKind === "liability") {
      const candidates = confirmedRows.liabilitySnapshots.filter(
        (s) => data.liabilities.find((l) => l.id === s.liability_id)!.is_active,
      );
      const dropped = candidates.length > 0 ? pick(candidates) : null;
      if (dropped) {
        withoutOne = { ...confirmedRows, liabilitySnapshots: confirmedRows.liabilitySnapshots.filter((s) => s !== dropped) };
      }
    } else {
      const planned = new Set(lines.filter((line) => line.kind === missingKind).map((line) => line.planItemId));
      const candidates = confirmedRows.entries.filter((e) => e.kind === missingKind && planned.has(e.plan_item_id ?? undefined));
      const dropped = candidates.length > 0 ? pick(candidates) : null;
      if (dropped) withoutOne = { ...confirmedRows, entries: confirmedRows.entries.filter((e) => e !== dropped) };
    }
    if (withoutOne) {
      setRows(row.id, withoutOne);
      const missing = report(i);
      expectInvariants(missing, before, `${where} (${missingKind} 하나만 미확인)`);
      // 기준 월은 잔액만 본다: 수입·납입의 실제 값이 없어도 완료다
      const flowOnly = missingKind === "income" || missingKind === "contribution";
      expect(missing.complete, `${where}: ${missingKind} 하나가 미확인일 때 complete`).toBe(settled.isBaseline && flowOnly);
      stats.oneMissing++;
      setRows(row.id, confirmedRows);
    }

    stats.months++;
    if (settled.adjustment !== 0) stats.adjusted++;
    if (settled.newBorrowing > 0) stats.borrowed++;
    if (settled.principalRepaid > 0) stats.repaid++;
    // 보관했고 금액도 0인 자산은 줄에서 빠진다 (3절)
    stats.dropped += data.assets.length - settled.assetLines.length;

    // ── 가끔 직전 달의 마감을 취소하고 고친 뒤 다시 마감한다 ──
    if (i > 0 && chance(0.4)) {
      stats.reopened++;
      const last = data.months[i - 1];
      const frozen = last.summary!;
      data = {
        ...data,
        months: data.months.map((m) => (m.id === last.id ? { ...m, status: "open" as const } : m)),
        monthData: { ...data.monthData, [last.id]: stored[last.id] },
      };
      // (e) 그 뒤에 설정을 바꾸고 자산·부채를 새로 등록했어도, 같은 입력이면 마감 당시와 같은 숫자가 나온다
      const again = report(i - 1);
      expect({ ...householdFigures(again), complete: null }, `${where}: 직전 달을 다시 열어도 결과가 같다`).toEqual({
        ...householdFigures(frozen),
        complete: null,
      });
      if (!again.complete) {
        // 현재 동작: 0원으로 정리해 보관했던 자산·부채를 마감 뒤에 복원하면, 다시 연 달에 0원짜리 미확인 줄로
        // 나타난다(숫자는 그대로). 그 밖의 이유 — 나중에 등록한 항목, 계획 변경 — 로 미확인이 생기면 안 된다.
        const frozenAssets = new Set(frozen.assetLines.map((line) => line.assetId));
        const frozenLiabilities = new Set(frozen.liabilityLines.map((line) => line.liabilityId));
        const zeroAssets = again.assetLines.filter((line) => !line.confirmed);
        const zeroLiabilities = again.liabilityLines.filter((line) => !line.confirmed);
        for (const line of zeroAssets) {
          expect([line.value, frozenAssets.has(line.assetId)], `${where}: 복원한 0원 자산`).toEqual([0, false]);
          expect(restored.has(line.assetId), `${where}: ${line.name} 은 이번 달에 복원한 자산이다`).toBe(true);
        }
        for (const line of zeroLiabilities) {
          expect([line.balance, frozenLiabilities.has(line.liabilityId)], `${where}: 복원한 0원 부채`).toEqual([0, false]);
          expect(restored.has(line.liabilityId), `${where}: ${line.name} 은 이번 달에 복원한 부채다`).toBe(true);
        }
        expect(
          [...again.incomeLines, ...again.contributionLines].every((line) => line.actual !== null),
          `${where}: 다시 연 달의 수입·납입은 확인된 그대로다`,
        ).toBe(true);
        // 0원으로 확인하면 다시 마감할 수 있다
        const rowsThen = stored[last.id];
        setRows(last.id, {
          ...rowsThen,
          assetSnapshots: [
            ...rowsThen.assetSnapshots,
            ...zeroAssets.map((line) => assetSnap(data.assets.find((a) => a.id === line.assetId)!, line.value, line.principal)),
          ],
          liabilitySnapshots: [
            ...rowsThen.liabilitySnapshots,
            ...zeroLiabilities.map((line) => liabilitySnap(data.liabilities.find((l) => l.id === line.liabilityId)!, 0)),
          ],
        });
        expect(householdFigures(report(i - 1)), `${where}: 0원으로 확인한 뒤`).toEqual(householdFigures(frozen));
      }
      expectInvariants(report(i), report(i - 1), `${where} (직전 달을 다시 연 뒤)`);

      // 직전 달의 잔액 하나를 고친다 → 이번 달 월초 값이 따라 바뀌어야 한다
      const rows = stored[last.id];
      if (rows.assetSnapshots.length > 0) {
        const target = Math.floor(random() * rows.assetSnapshots.length);
        const delta = won(2_000_000) - 1_000_000;
        setRows(last.id, {
          ...rows,
          assetSnapshots: rows.assetSnapshots.map((s, index) =>
            index === target ? { ...s, value: s.value + delta, principal: s.principal + delta } : s,
          ),
        });
      }
      const corrected = report(i - 1);
      expectInvariants(corrected, prevReport(i - 1), `${where} (직전 달 수정)`);
      expect(corrected.complete, `${where}: 고친 직전 달도 완료 상태다`).toBe(true);
      let current = report(i);
      expectInvariants(current, corrected, `${where} (직전 달 수정 뒤 이번 달)`);
      // 3절: 보관한 자산의 지난달 잔액을 0원에서 금액이 있는 값으로 고치면, 이번 달에 빠져 있던 그 자산이
      // 다시 집계되고 확인을 요구한다. 그 밖의 이유로 미확인이 생기면 안 된다.
      const resurfaced = current.assetLines.filter((line) => !line.confirmed);
      if (resurfaced.length > 0) {
        for (const line of resurfaced) {
          expect(data.assets.find((a) => a.id === line.assetId)!.is_active, `${where}: 다시 나타난 자산은 보관한 자산이다`).toBe(false);
          expect(line.value, `${where}: 다시 나타난 자산에는 금액이 남아 있다`).not.toBe(0);
        }
        const rowsNow = stored[row.id];
        setRows(row.id, {
          ...rowsNow,
          assetSnapshots: [
            ...rowsNow.assetSnapshots,
            ...resurfaced.map((line) => assetSnap(data.assets.find((a) => a.id === line.assetId)!, line.value, line.principal)),
          ],
        });
        current = report(i);
        expectInvariants(current, corrected, `${where} (다시 나타난 자산 확인 뒤)`);
      }
      expect(current.complete, `${where}: 이번 달도 완료 상태다`).toBe(true);
      close(i - 1);
      expect(reportFor(data, data.months[i - 1])).toBe(data.months[i - 1].summary);
    }

    // ── 마감하고 다음 달을 연다 ──
    close(i, i + 1 < MONTHS ? monthRow(addMonths(ym, 1)) : undefined);
  }

  // 전체 이력: 모든 달이 마감됐고, 동결된 결과끼리도 월초 = 직전 달 월말로 이어진다
  expect(data.months.map((m) => m.status)).toEqual(Array(MONTHS).fill("closed"));
  for (let i = 0; i < MONTHS; i++) {
    expectInvariants(data.months[i].summary!, i > 0 ? data.months[i - 1].summary! : null, `시드 ${seed} · 이력 ${i}`);
  }
}

// ───────────────────────── 테스트 ─────────────────────────

describe("연쇄 불변식 (무작위 가구 × 6개월)", () => {
  const stats: Stats = {
    months: 0,
    provisional: 0,
    adjusted: 0,
    borrowed: 0,
    repaid: 0,
    reopened: 0,
    pocketChanged: 0,
    transfers: 0,
    singleMember: 0,
    archivedWithBalance: 0,
    dropped: 0,
    oneMissing: 0,
  };
  // 더 넓게 돌려 보고 싶으면: CHAIN_HOUSEHOLDS=5000 npx vitest run --project unit src/lib/data/chain.test.ts
  const HOUSEHOLDS = Number(process.env.CHAIN_HOUSEHOLDS ?? 60);

  // 가구 수에 비례해 넉넉히 (기본 60곳은 1초 안에 끝난다)
  const TIMEOUT = 20_000 + HOUSEHOLDS * 30;
  /** 두 테스트가 같은 실행 결과를 본다 (하나만 골라 돌려도 되도록 한 번만 굴린다) */
  let ran = false;
  const runAll = () => {
    if (ran) return;
    ran = true;
    for (let seed = 1; seed <= HOUSEHOLDS; seed++) runHousehold(20261125 + seed, stats);
  };

  it(
    "매달 항등식·주머니 합·이동 상쇄가 성립하고, 월초 합계는 직전 달 월말 합계와 같다",
    () => {
      runAll();
      expect(stats.months).toBe(HOUSEHOLDS * MONTHS);
    },
    TIMEOUT,
  );

  // 가구 수를 줄여 돌릴 때는 통계가 흔들리므로 기본 규모 이상에서만 본다
  it.skipIf(HOUSEHOLDS < 60)(
    "난수 시나리오가 실제로 여러 상황을 지나간다 (빈 테스트가 아니다)",
    () => {
      runAll();
      // 생성기를 고쳐 어떤 상황이 사라지면 여기서 알 수 있다.
      // (가구 60곳 기준 실제 값의 절반 이하로 잡은 하한이다)
      expect(stats.provisional).toBeGreaterThan(HOUSEHOLDS * 2); // 미확인이 섞인 달
      expect(stats.adjusted).toBeGreaterThan(HOUSEHOLDS); // opening_* 로 뒤늦게 등록해 기초 조정이 생긴 달
      expect(stats.borrowed).toBeGreaterThan(HOUSEHOLDS); // 부채 합계가 늘어난 달
      expect(stats.repaid).toBeGreaterThan(HOUSEHOLDS); // 부채 합계가 줄어든 달
      expect(stats.reopened).toBeGreaterThan(HOUSEHOLDS); // 마감 취소
      expect(stats.pocketChanged).toBeGreaterThan(HOUSEHOLDS); // 실제 항목에서 주머니 변경
      expect(stats.transfers).toBeGreaterThan(HOUSEHOLDS * 3); // 주머니 간 이동
      expect(stats.singleMember).toBeGreaterThan(HOUSEHOLDS / 10); // 구성원 1명인 가구
      expect(stats.archivedWithBalance).toBeGreaterThan(HOUSEHOLDS); // 금액이 남은 채 보관한 자산이 미확인으로 남은 달
      expect(stats.dropped).toBeGreaterThan(HOUSEHOLDS / 10); // 보관했고 0원이라 줄에서 빠진 자산
      expect(stats.oneMissing).toBeGreaterThan(HOUSEHOLDS * 3); // 하나만 미확인으로 남긴 달
    },
    TIMEOUT,
  );
});
