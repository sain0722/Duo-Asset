import { memberIdOf } from "./meta";
import type { AssetKind, AssetLine, MonthReport, PlanLine, PocketId, Won } from "./types";

/** 한 번에 확인할 수 있는 "예정대로" 값. 사용자가 목록을 보고 직접 눌러야 저장된다. */
export interface SuggestedInputs {
  assets: {
    assetId: string;
    name: string;
    value: Won;
    principal: Won;
    /** unchanged: 전월과 동일 / planned_saving: 전월 + 이번 달 저축 계획 */
    reason: "unchanged" | "planned_saving";
  }[];
  liabilities: {
    liabilityId: string;
    name: string;
    balance: Won;
    /** 예정 이자·지급액. 없으면 null (기록하지 않는다) */
    interestPaid: Won | null;
  }[];
  entries: {
    kind: "income" | "contribution";
    planItemId: string;
    memberId: string | null;
    pocket: PocketId;
    name: string;
    amount: Won;
  }[];
  count: number;
}

/** 자산별로 연결된 저축 계획 금액 (같은 자산에 여러 항목이 있으면 합) */
export function plannedSavingsByAsset(planLines: PlanLine[]): Record<string, Won> {
  const result: Record<string, Won> = {};
  for (const line of planLines) {
    if (line.kind !== "saving" || !line.assetId) continue;
    result[line.assetId] = (result[line.assetId] ?? 0) + line.amount;
  }
  return result;
}

/** 평가형 자산의 월말 순투입액 = 월초 순투입액 + 이번 달 순입금(넣은 돈 − 뺀 돈) */
export function principalAfter(line: Pick<AssetLine, "openPrincipal">, netDeposit: Won): Won {
  return line.openPrincipal + netDeposit;
}

/**
 * 잔액을 직접 들여다보지 않아도 값이 정해지는 자산 유형.
 * 입출금 통장과 투자자산은 매달 달라지므로 제안하지 않는다 (사용자가 실제 값을 확인해야 한다).
 */
const PREDICTABLE: AssetKind[] = ["deposit", "savings", "lease_deposit", "presale"];

/**
 * 아직 확인하지 않은 항목 중 "계획·일정대로라면 이 값"이라고 말할 수 있는 것들.
 *  - 예금·적금·보증금·분양 납부금: 전월 잔액 + 그 자산으로 가는 저축 계획
 *  - 부채: 전월 잔액 − 예정 원금, 예정 이자
 *  - 수입·공용통장 납입: 계획 금액
 * 미확인을 조용히 채우는 것이 아니라, 화면이 목록으로 보여 주고 한 번에 확인받기 위한 것이다.
 */
export function suggestInputs(report: MonthReport): SuggestedInputs {
  const result: SuggestedInputs = { assets: [], liabilities: [], entries: [], count: 0 };
  if (report.isBaseline) return result;
  const plannedByAsset = plannedSavingsByAsset(report.planLines);

  for (const line of report.assetLines) {
    if (line.confirmed || !PREDICTABLE.includes(line.kind)) continue;
    const planned = plannedByAsset[line.assetId] ?? 0;
    result.assets.push({
      assetId: line.assetId,
      name: line.name,
      value: line.openValue + planned,
      principal: line.openPrincipal + planned,
      reason: planned > 0 ? "planned_saving" : "unchanged",
    });
  }

  for (const line of report.liabilityLines) {
    if (line.confirmed) continue;
    result.liabilities.push({
      liabilityId: line.liabilityId,
      name: line.name,
      balance: Math.max(line.openBalance - line.plannedPrincipal, 0),
      interestPaid: line.plannedInterest > 0 ? line.plannedInterest : null,
    });
  }

  for (const [kind, lines] of [
    ["income", report.incomeLines],
    ["contribution", report.contributionLines],
  ] as const) {
    for (const line of lines) {
      if (line.actual !== null || line.planned === null) continue;
      result.entries.push({
        kind,
        planItemId: line.key,
        memberId: memberIdOf(line.pocket),
        pocket: line.pocket,
        name: line.name,
        amount: line.planned,
      });
    }
  }

  result.count = result.assets.length + result.liabilities.length + result.entries.length;
  return result;
}
