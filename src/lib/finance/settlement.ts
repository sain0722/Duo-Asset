import { ASSET_KINDS, pocketOf } from "./meta";
import { plannedJointConsumption, plannedMemberConsumption, summarizePlan } from "./plan";
import type {
  AmountLine,
  AssetLine,
  AssetSnapshot,
  BalanceTotals,
  LiabilityLine,
  LiabilitySnapshot,
  MonthEntry,
  MonthInput,
  MonthReport,
  PlanLine,
  PocketId,
  PocketReport,
  ReportWarning,
  TransferLine,
  Won,
} from "./types";
import { JOINT } from "./types";

function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]));
}

function sumOf<T>(rows: T[], pick: (row: T) => Won): Won {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/** 저축률 등 비율(%)을 소수 1자리로. 정수 연산으로 반올림한다. */
export function percentOf(part: Won, whole: Won): number | null {
  if (whole <= 0) return null;
  return Math.round((part * 1000) / whole) / 10;
}

// ───────────────────────── 자산 · 부채 줄 ─────────────────────────

function buildAssetLines(input: MonthInput): AssetLine[] {
  const prev = indexBy(input.prevAssetSnapshots, (s) => s.asset_id);
  const cur = indexBy(input.assetSnapshots, (s) => s.asset_id);
  const lines: AssetLine[] = [];

  for (const asset of input.assets) {
    const before = prev.get(asset.id);
    const now: AssetSnapshot | undefined = cur.get(asset.id);
    // 보관했고 남은 금액도 없는 자산은 더 이상 집계하지 않는다.
    // 금액이 남아 있으면 보관 여부와 관계없이 계속 집계한다 (0을 기록해야 정리된다).
    if (!now && !asset.is_active && (!before || before.value === 0)) continue;

    let openValue = before?.value ?? 0;
    let openPrincipal = before?.principal ?? 0;
    let adjustment = 0;
    let value: Won;
    let principal: Won;
    let confirmed = true;

    if (now) {
      value = now.value;
      principal = now.principal;
      // 직전 달에 없었거나 0원으로만 있었던 자산
      const noPrior = !before || (before.value === 0 && before.principal === 0);
      if (noPrior && now.opening_value !== null && now.opening_principal !== null) {
        // 전부터 갖고 있던 자산을 이번 달에 처음 등록: 월초 값은 기초 조정으로 분리
        openValue = now.opening_value;
        openPrincipal = now.opening_principal;
        adjustment = now.opening_value;
      }
    } else {
      // 미확인: 월초 값이 그대로라고 가정
      value = openValue;
      principal = openPrincipal;
      confirmed = false;
    }

    if (input.isBaseline) {
      // 기준 월: 잔액만 기록하고 변화는 계산하지 않는다
      openValue = value;
      openPrincipal = principal;
      adjustment = 0;
    }

    const contributed = principal - openPrincipal;
    lines.push({
      assetId: asset.id,
      name: asset.name,
      kind: asset.kind,
      pocket: pocketOf(asset.owner_member_id),
      liquidity: asset.liquidity,
      openValue,
      openPrincipal,
      value,
      principal,
      contributed,
      gain: value - openValue - contributed,
      adjustment,
      confirmed,
    });
  }
  return lines;
}

function buildLiabilityLines(input: MonthInput): LiabilityLine[] {
  const prev = indexBy(input.prevLiabilitySnapshots, (s) => s.liability_id);
  const cur = indexBy(input.liabilitySnapshots, (s) => s.liability_id);
  const planned = indexBy(
    input.planLines.filter((line) => line.kind === "debt" && line.liabilityId),
    (line) => line.liabilityId!,
  );
  const lines: LiabilityLine[] = [];

  for (const liability of input.liabilities) {
    const before = prev.get(liability.id);
    const now: LiabilitySnapshot | undefined = cur.get(liability.id);
    // 보관했고 남은 원금도 없는 부채는 집계하지 않는다. 원금이 남아 있으면 계속 집계한다.
    if (!now && !liability.is_active && (!before || before.balance === 0)) continue;

    let openBalance = before?.balance ?? 0;
    let adjustment = 0;
    let balance: Won;
    let confirmed = true;

    if (now) {
      balance = now.balance;
      if ((!before || before.balance === 0) && now.opening_balance !== null) {
        openBalance = now.opening_balance;
        adjustment = now.opening_balance;
      }
    } else {
      balance = openBalance;
      confirmed = false;
    }

    if (input.isBaseline) {
      openBalance = balance;
      adjustment = 0;
    }

    const plan = planned.get(liability.id);
    lines.push({
      liabilityId: liability.id,
      name: liability.name,
      kind: liability.kind,
      pocket: pocketOf(liability.payer_member_id),
      openBalance,
      balance,
      principalPaid: openBalance - balance,
      plannedPrincipal: plan?.principal ?? 0,
      plannedInterest: plan?.interest ?? 0,
      interestPaid: input.isBaseline ? null : (now?.interest_paid ?? null),
      adjustment,
      confirmed,
    });
  }
  return lines;
}

// ───────────────────────── 잔액 합계 ─────────────────────────

export function balanceTotals(
  assets: { kind: AssetLine["kind"]; liquidity: AssetLine["liquidity"]; value: Won }[],
  liabilities: { balance: Won }[],
): BalanceTotals {
  const byKind: BalanceTotals["byKind"] = {};
  let total = 0;
  let liquid = 0;
  let financial = 0;
  for (const asset of assets) {
    total += asset.value;
    byKind[asset.kind] = (byKind[asset.kind] ?? 0) + asset.value;
    if (asset.liquidity === "liquid") liquid += asset.value;
    if (ASSET_KINDS[asset.kind].financial) financial += asset.value;
  }
  const debt = sumOf(liabilities, (l) => l.balance);
  return { assets: total, liabilities: debt, netWorth: total - debt, liquid, financial, byKind };
}

// ───────────────────────── 수입 · 납입 · 지출 줄 ─────────────────────────

/** 계획 줄과 실제 항목을 짝지어 "계획 vs 실제" 줄을 만든다. */
function matchLines(
  planLines: PlanLine[],
  entries: MonthEntry[],
): AmountLine[] {
  const byPlanItem = new Map<string, MonthEntry>();
  for (const entry of entries) {
    if (entry.plan_item_id) byPlanItem.set(entry.plan_item_id, entry);
  }
  const used = new Set<string>();
  const lines: AmountLine[] = planLines.map((line) => {
    const entry = line.planItemId ? byPlanItem.get(line.planItemId) : undefined;
    if (entry) used.add(entry.id);
    return {
      key: line.key,
      name: entry?.name ?? line.name,
      // 실제 항목에서 주머니를 바꿨다면 그쪽을 따른다
      pocket: entry ? pocketOf(entry.member_id) : line.pocket,
      planned: line.amount,
      actual: entry ? entry.amount : null,
      entryId: entry?.id,
    };
  });
  // 계획에 없던 추가 항목 (또는 계획에서 사라진 항목에 남은 실제 값)
  for (const entry of entries) {
    if (used.has(entry.id)) continue;
    lines.push({
      key: entry.id,
      name: entry.name,
      pocket: pocketOf(entry.member_id),
      planned: null,
      actual: entry.amount,
      entryId: entry.id,
    });
  }
  return lines;
}

/** 미확인 줄은 계획 금액을 잠정값으로 쓴다 (결과는 complete = false 로 표시된다). */
function effective(line: AmountLine): Won {
  return line.actual ?? line.planned ?? 0;
}

// ───────────────────────── 월 정산 ─────────────────────────

/**
 * 월 정산 결과를 계산한다. 규칙은 docs/finance-rules.md.
 * 순수 함수: 같은 입력이면 항상 같은 결과.
 */
export function computeMonthReport(input: MonthInput): MonthReport {
  const assetLines = buildAssetLines(input);
  const liabilityLines = buildLiabilityLines(input);

  const closing = balanceTotals(assetLines, liabilityLines);
  const opening = balanceTotals(
    assetLines.map((line) => ({ ...line, value: line.openValue - line.adjustment })),
    liabilityLines.map((line) => ({ balance: line.openBalance - line.adjustment })),
  );

  const plan = summarizePlan(input.month, input.members, input.planLines);
  const pocketIds: PocketId[] = [...input.members.map((m) => m.id), JOINT];
  const pocketName = (pocket: PocketId) =>
    pocket === JOINT ? "공동" : (input.members.find((m) => m.id === pocket)?.name ?? "");

  const warnings: ReportWarning[] = [];
  for (const line of assetLines) {
    if (!line.confirmed) {
      warnings.push({ code: "unconfirmed_asset", message: `${line.name} 잔액 미확인`, pocket: line.pocket });
    }
  }
  for (const line of liabilityLines) {
    if (!line.confirmed) {
      warnings.push({ code: "unconfirmed_liability", message: `${line.name} 잔액 미확인`, pocket: line.pocket });
    }
  }

  const base = {
    version: 1 as const,
    month: input.month,
    opening,
    closing,
    netWorthChange: closing.netWorth - opening.netWorth,
    plan: plan.totals,
    planLines: input.planLines,
    assetLines,
    liabilityLines,
  };

  if (input.isBaseline) {
    return {
      ...base,
      isBaseline: true,
      complete: warnings.length === 0,
      warnings,
      income: 0,
      consumption: 0,
      savings: 0,
      savingsRate: null,
      principalRepaid: 0,
      newBorrowing: 0,
      investmentGain: 0,
      otherValuation: 0,
      adjustment: 0,
      incomeLines: [],
      contributionLines: [],
      transferLines: [],
      pockets: [],
    };
  }

  const entriesOf = (kind: MonthEntry["kind"]) => input.entries.filter((e) => e.kind === kind);
  const planOf = (kind: PlanLine["kind"]) => input.planLines.filter((line) => line.kind === kind);

  const incomeLines = matchLines(planOf("income"), entriesOf("income"));
  const contributionLines = matchLines(planOf("contribution"), entriesOf("contribution"));
  const expenseLines = matchLines(planOf("expense"), entriesOf("expense"));
  const transferLines: TransferLine[] = entriesOf("transfer").map((entry) => ({
    entryId: entry.id,
    name: entry.name,
    from: pocketOf(entry.member_id),
    to: pocketOf(entry.to_member_id),
    amount: entry.amount,
  }));

  for (const line of incomeLines) {
    if (line.actual === null) {
      warnings.push({ code: "unconfirmed_income", message: `${line.name} 실제 수입 미확인`, pocket: line.pocket });
    }
  }
  for (const line of contributionLines) {
    if (line.actual === null) {
      warnings.push({
        code: "unconfirmed_contribution",
        message: `${pocketName(line.pocket)} 공용통장 입금액 미확인`,
        pocket: line.pocket,
      });
    }
  }

  const pockets: PocketReport[] = pocketIds.map((pocket) => {
    const income = sumOf(
      incomeLines.filter((line) => line.pocket === pocket),
      effective,
    );
    const contributedToJoint = sumOf(
      contributionLines.filter((line) => line.pocket === pocket),
      effective,
    );
    const contributionsIn = pocket === JOINT ? sumOf(contributionLines, effective) : 0;
    const transfersIn =
      contributionsIn +
      sumOf(
        transferLines.filter((line) => line.to === pocket),
        (line) => line.amount,
      );
    const transfersOut =
      (pocket === JOINT ? 0 : contributedToJoint) +
      sumOf(
        transferLines.filter((line) => line.from === pocket),
        (line) => line.amount,
      );
    const assetContribution = sumOf(
      assetLines.filter((line) => line.pocket === pocket),
      (line) => line.contributed,
    );
    const pocketLiabilities = liabilityLines.filter((line) => line.pocket === pocket);
    const principalPaid = sumOf(pocketLiabilities, (line) => line.principalPaid);
    const consumption = income + transfersIn - transfersOut - assetContribution - principalPaid;

    // 확인된 지출 = 지출 항목 + 확인된 이자
    const pocketExpenseLines: AmountLine[] = [
      ...expenseLines.filter((line) => line.pocket === pocket),
      ...pocketLiabilities
        .filter((line) => line.plannedInterest > 0 || line.interestPaid !== null)
        .map((line) => ({
          key: `liability:${line.liabilityId}:interest`,
          // 원금 유지 차용금은 이자가 아니라 정해진 지급액(용돈 등)이다
          name: line.kind === "interest_only" ? `${line.name} 지급액` : `${line.name} 이자`,
          pocket,
          planned: line.plannedInterest > 0 ? line.plannedInterest : null,
          actual: line.interestPaid,
        })),
    ];
    const classified = sumOf(pocketExpenseLines, (line) => line.actual ?? 0);

    const memberPlan = plan.members.find((m) => m.memberId === pocket);
    const plannedConsumption =
      pocket === JOINT
        ? plannedJointConsumption(plan.joint)
        : memberPlan
          ? plannedMemberConsumption(memberPlan)
          : 0;

    if (consumption >= 0 && consumption - classified < 0) {
      warnings.push({
        code: "negative_unclassified",
        message: `${pocketName(pocket)} 주머니에서 실제로 나간 돈보다 확인한 지출이 많습니다. 다른 주머니에서 낸 지출이 섞였는지 확인하세요.`,
        pocket,
      });
    }
    if (consumption < 0) {
      warnings.push({
        code: "negative_pocket_consumption",
        message: `${pocketName(pocket)} 지출이 음수로 계산되었습니다. 빠진 수입이나 주머니 간 이동이 있는지 확인하세요.`,
        pocket,
      });
    }

    return {
      pocket,
      name: pocketName(pocket),
      income,
      transfersIn,
      transfersOut,
      assetContribution,
      principalPaid,
      consumption,
      classified,
      unclassified: consumption - classified,
      plannedConsumption,
      expenseLines: pocketExpenseLines,
    };
  });

  const income = sumOf(pockets, (p) => p.income);
  const consumption = sumOf(pockets, (p) => p.consumption);
  // 가구 합계는 순액으로 본다: 같은 달에 한 대출을 갚고 다른 대출을 받아도(대환·입주) 저축액이 튀지 않는다
  const netRepayment = sumOf(liabilityLines, (line) => line.principalPaid);
  const principalRepaid = Math.max(netRepayment, 0);
  const newBorrowing = Math.max(-netRepayment, 0);
  const savings = income - consumption - principalRepaid;

  if (consumption < 0) {
    warnings.push({
      code: "negative_consumption",
      message: "소비지출이 음수로 계산되었습니다. 기록하지 않은 수입(이자, 환급 등)이 있는지 확인하세요.",
    });
  }

  return {
    ...base,
    isBaseline: false,
    complete: !warnings.some((w) => w.code.startsWith("unconfirmed_")),
    warnings,
    income,
    consumption,
    savings,
    savingsRate: percentOf(savings, income),
    principalRepaid,
    newBorrowing,
    investmentGain: sumOf(
      assetLines.filter((line) => ASSET_KINDS[line.kind].investment),
      (line) => line.gain,
    ),
    otherValuation: sumOf(
      assetLines.filter((line) => !ASSET_KINDS[line.kind].investment),
      (line) => line.gain,
    ),
    adjustment: sumOf(assetLines, (line) => line.adjustment) - sumOf(liabilityLines, (line) => line.adjustment),
    incomeLines,
    contributionLines,
    transferLines,
    pockets,
  };
}
