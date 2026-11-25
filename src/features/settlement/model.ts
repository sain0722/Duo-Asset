/**
 * 월 정산 화면이 쓰는 파생 값. 정산 결과(MonthReport)를 화면 단위로 다시 묶을 뿐 새 지표를 정의하지 않는다.
 * 순수 함수만 둔다 (React·Supabase import 금지).
 */
import { percentOf } from "@/lib/finance";
import type { AssetLine, LiabilityLine, MonthReport, PlanLine, PocketId, Won } from "@/lib/finance/types";

export type SectionId = "income" | "assets" | "liabilities" | "transfers" | "expenses";

/** 마감 전에 확인해야 하는 줄 하나 */
export interface CheckItem {
  section: SectionId;
  /** 화면의 행 id 로도 쓴다 */
  rowId: string;
  label: string;
  pocket: PocketId;
  done: boolean;
}

/**
 * 마감에 필요한 확인 목록 (report.complete 와 같은 기준). 화면 순서대로.
 * 자산은 화면에서 주머니별로 묶으므로 pocketOrder 를 주면 그 순서로 정렬한다.
 */
export function checklist(report: MonthReport, pocketOrder: PocketId[] = []): CheckItem[] {
  const items: CheckItem[] = [];
  const rank = (pocket: PocketId) => {
    const index = pocketOrder.indexOf(pocket);
    return index < 0 ? pocketOrder.length : index;
  };
  const assetLines = [...report.assetLines].sort((a, b) => rank(a.pocket) - rank(b.pocket));
  for (const line of report.incomeLines) {
    items.push({ section: "income", rowId: rowIdOf("income", line.key), label: line.name, pocket: line.pocket, done: line.actual !== null });
  }
  for (const line of assetLines) {
    items.push({ section: "assets", rowId: rowIdOf("asset", line.assetId), label: line.name, pocket: line.pocket, done: line.confirmed });
  }
  for (const line of report.liabilityLines) {
    items.push({
      section: "liabilities",
      rowId: rowIdOf("liability", line.liabilityId),
      label: line.name,
      pocket: line.pocket,
      done: line.confirmed,
    });
  }
  for (const line of report.contributionLines) {
    items.push({
      section: "transfers",
      rowId: rowIdOf("contribution", line.key),
      label: `${line.name} 입금`,
      pocket: line.pocket,
      done: line.actual !== null,
    });
  }
  return items;
}

export function rowIdOf(kind: "income" | "asset" | "liability" | "contribution" | "expense", key: string): string {
  return `settle-${kind}-${key}`;
}

export interface Progress {
  done: number;
  total: number;
}

export function progressOf(items: CheckItem[], section?: SectionId): Progress {
  const scoped = section ? items.filter((item) => item.section === section) : items;
  return { done: scoped.filter((item) => item.done).length, total: scoped.length };
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

/** 잔액형 자산을 "예정대로" 확인할 때의 잔액 = 월초 + 연결된 저축 계획 */
export function balanceWithPlannedSaving(line: Pick<AssetLine, "openValue">, planned: Won): Won {
  return line.openValue + planned;
}

/** 자산 평가금액의 전월 대비 변화 (= 순투입 + 평가손익) */
export function assetValueChange(line: Pick<AssetLine, "value" | "openValue">): Won {
  return line.value - line.openValue;
}

/** 부채의 예정 잔액 = 월초 잔액 − 이번 달 예정 원금 */
export function scheduledBalance(line: Pick<LiabilityLine, "openBalance" | "plannedPrincipal">): Won {
  return Math.max(line.openBalance - line.plannedPrincipal, 0);
}

/** 부채 잔액의 전월 대비 변화 (음수 = 줄었다) */
export function liabilityChange(line: Pick<LiabilityLine, "balance" | "openBalance">): Won {
  return line.balance - line.openBalance;
}

export interface PlanComparisonRow {
  key: "income" | "consumption" | "savings" | "principal";
  label: string;
  planned: Won;
  actual: Won;
  /** 실제 − 계획 */
  diff: Won;
}

/** 계획 대비 실적 (가구 합계). 계획 값은 report.plan (마감한 달은 동결된 계획). */
export function planComparison(report: MonthReport): PlanComparisonRow[] {
  const row = (key: PlanComparisonRow["key"], label: string, planned: Won, actual: Won): PlanComparisonRow => ({
    key,
    label,
    planned,
    actual,
    diff: actual - planned,
  });
  return [
    row("income", "수입", report.plan.income, report.income),
    row("consumption", "소비지출", report.plan.consumption, report.consumption),
    row("savings", "저축액", report.plan.savings, report.savings),
    row("principal", "원금 상환", report.plan.principalRepayment, report.principalRepaid),
  ];
}

/** 저축 목표 달성률 = 실제 저축액 ÷ 계획 저축액 (%) */
export function savingsAchievement(report: MonthReport): number | null {
  return percentOf(report.savings, report.plan.savings);
}

/** 주머니 소비의 계획 대비 사용률 (%) */
export function pocketUsage(pocket: { consumption: Won; plannedConsumption: Won }): number | null {
  return percentOf(pocket.consumption, pocket.plannedConsumption);
}

/** 미확인 항목 경고는 확인 목록으로 따로 보여 주므로, 결과 영역에는 나머지 경고만 */
export function resultWarnings(report: MonthReport) {
  return report.warnings.filter((warning) => !warning.code.startsWith("unconfirmed_"));
}
