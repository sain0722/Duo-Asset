/**
 * 월 정산 화면이 쓰는 파생 값. 정산 결과(MonthReport)를 화면 단위로 다시 묶을 뿐 새 지표를 정의하지 않는다.
 * 순수 함수만 둔다 (React·Supabase import 금지).
 */
import { memberIdOf, percentOf } from "@/lib/finance";

// 자산 화면도 같은 규칙으로 저장하도록 계산 코어에 둔다
export { plannedSavingsByAsset, principalAfter } from "@/lib/finance";
import type { SuggestedInputs } from "@/lib/finance/suggest";
import type { AmountLine, AssetLine, LiabilityLine, MonthReport, PlanLine, PocketId, Won } from "@/lib/finance/types";

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

// ───────────────────────── 한 번에 확인 ─────────────────────────

/** 확인 창에 보여 줄 한 줄 (무엇을 · 얼마로 · 왜) */
export interface SuggestionRow {
  /** 저장 중 표시에 쓰는 행 key (각 영역 행과 같다) */
  pendingKey: string;
  section: SectionId;
  /** 화면의 행 id (CheckItem.rowId 와 같다) */
  rowId: string;
  name: string;
  amount: Won;
  /** 이자·지급액이 함께 기록되면 그 금액과 이름 */
  extra: Won | null;
  extraLabel: "이자" | "지급액" | null;
  reason: "전월과 동일" | "전월 + 저축 계획" | "예정 상환" | "계획대로";
}

/** suggestInputs 결과를 확인 창의 줄로 바꾼다. 화면 순서(수입 → 자산 → 부채 → 납입)대로. */
export function suggestionRows(suggested: SuggestedInputs, report: Pick<MonthReport, "liabilityLines">): SuggestionRow[] {
  const income = suggested.entries.filter((entry) => entry.kind === "income");
  const contributions = suggested.entries.filter((entry) => entry.kind === "contribution");
  const entryRow = (entry: SuggestedInputs["entries"][number]): SuggestionRow => ({
    pendingKey: `${entry.kind}:${entry.planItemId}`,
    section: entry.kind === "income" ? "income" : "transfers",
    rowId: rowIdOf(entry.kind, entry.planItemId),
    name: entry.kind === "income" ? entry.name : `${entry.name} 입금`,
    amount: entry.amount,
    extra: null,
    extraLabel: null,
    reason: "계획대로",
  });
  return [
    ...income.map(entryRow),
    ...suggested.assets.map(
      (asset): SuggestionRow => ({
        pendingKey: `asset:${asset.assetId}`,
        section: "assets",
        rowId: rowIdOf("asset", asset.assetId),
        name: asset.name,
        amount: asset.value,
        extra: null,
        extraLabel: null,
        reason: asset.reason === "planned_saving" ? "전월 + 저축 계획" : "전월과 동일",
      }),
    ),
    ...suggested.liabilities.map((liability): SuggestionRow => {
      const line = report.liabilityLines.find((l) => l.liabilityId === liability.liabilityId);
      const unchanged = line !== undefined && line.openBalance === liability.balance && liability.interestPaid === null;
      return {
        pendingKey: `liability:${liability.liabilityId}`,
        section: "liabilities",
        rowId: rowIdOf("liability", liability.liabilityId),
        name: liability.name,
        amount: liability.balance,
        extra: liability.interestPaid,
        extraLabel: liability.interestPaid === null ? null : line?.kind === "interest_only" ? "지급액" : "이자",
        reason: unchanged ? "전월과 동일" : "예정 상환",
      };
    }),
    ...contributions.map(entryRow),
  ];
}

/** 제안을 모두 확인하고 나면 남는 확인 항목 (통장·투자자산 등). 저장 뒤 이 중 첫 항목으로 이동한다. */
export function remainingAfter(items: CheckItem[], rows: Pick<SuggestionRow, "rowId">[]): CheckItem[] {
  const confirmed = new Set(rows.map((row) => row.rowId));
  return items.filter((item) => !item.done && !confirmed.has(item.rowId));
}

/** saveMonthInputs 에 그대로 넘길 값. 아직 행이 없는(미확인) 항목만 들어 있다. */
export interface MonthInputs {
  assetSnapshots: { asset_id: string; value: Won; principal: Won }[];
  liabilitySnapshots: { liability_id: string; balance: Won; interest_paid?: Won | null }[];
  entries: {
    kind: "income" | "contribution";
    member_id: string | null;
    plan_item_id: string | null;
    name: string;
    amount: Won;
  }[];
}

/** 제안 목록 → 한 번에 저장할 값. 계획 항목 id 는 saveAmountLine 과 같이 planLines 에서 찾는다. */
export function suggestionInputs(suggested: SuggestedInputs, report: Pick<MonthReport, "planLines">): MonthInputs {
  return {
    assetSnapshots: suggested.assets.map((asset) => ({ asset_id: asset.assetId, value: asset.value, principal: asset.principal })),
    liabilitySnapshots: suggested.liabilities.map((liability) => ({
      liability_id: liability.liabilityId,
      balance: liability.balance,
      ...(liability.interestPaid !== null ? { interest_paid: liability.interestPaid } : {}),
    })),
    entries: suggested.entries.map((entry) => ({
      kind: entry.kind,
      member_id: entry.memberId,
      plan_item_id: report.planLines.find((plan) => plan.key === entry.planItemId)?.planItemId ?? null,
      name: entry.name,
      amount: entry.amount,
    })),
  };
}

/** 계획된 수입·납입 줄을 계획 금액대로 확인하는 값 ("모두 계획대로") */
export function plannedEntryInputs(
  kind: "income" | "contribution",
  lines: Pick<AmountLine, "key" | "name" | "pocket" | "planned" | "actual">[],
  planLines: Pick<PlanLine, "key" | "planItemId">[],
): MonthInputs["entries"] {
  return lines
    .filter((line) => line.actual === null && line.planned !== null)
    .map((line) => ({
      kind,
      member_id: memberIdOf(line.pocket),
      plan_item_id: planLines.find((plan) => plan.key === line.key)?.planItemId ?? null,
      name: line.name,
      amount: line.planned!,
    }));
}
