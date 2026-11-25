/**
 * 공용통장 화면의 월별 요약. MonthReport 의 공동 주머니 값을 공용통장 관점으로 다시 묶는다.
 * 새 지표를 정의하지 않고 report 의 줄을 고르고 더하기만 한다 (docs/finance-rules.md 5절).
 *
 * - 공용통장 = 공동 주머니의 현금·입출금(cash) 자산.
 * - 다른 계좌로 이동 = 공용통장이 아닌 공동 자산의 순투입 + 공동 주머니에서 나간 이동.
 */
import type { HistoryPoint } from "@/lib/data/derive";
import type { AmountLine, JointPlan, MonthReport, PocketId, Won, Ym } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";

export interface JointAccount {
  assetId: string;
  name: string;
  opening: Won;
  /** null = 이번 달 잔액 미확인 */
  closing: Won | null;
}

export interface JointContribution {
  pocket: PocketId;
  planned: Won | null;
  /** null = 미확인 */
  actual: Won | null;
}

export interface JointFlows {
  /** 구성원 입금 외에 공동 주머니로 들어온 돈 (공동 수입 + 그 밖의 이동) */
  otherInflow: Won;
  consumption: Won;
  plannedConsumption: Won;
  classified: Won;
  unclassified: Won;
  /** 공동 부채 원금 순상환 */
  principalPaid: Won;
  /** 공용통장이 아닌 공동 자산(예금·적금 등)의 순투입 */
  movedToAssets: Won;
  /** 공동 주머니에서 개인 주머니로 나간 이동 */
  transfersOut: Won;
  /** 다른 계좌로 이동 = movedToAssets + transfersOut */
  movedOut: Won;
  /** 공동저축 = 공동 주머니 자산 순투입 합 */
  savings: Won;
  expenseLines: AmountLine[];
}

export interface JointMonthSummary {
  month: Ym;
  isBaseline: boolean;
  complete: boolean;
  contributions: JointContribution[];
  plannedContributions: Won;
  /** 모든 납입이 확인됐을 때만 합계. 하나라도 미확인이면 null */
  actualContributions: Won | null;
  accounts: JointAccount[];
  openingBalance: Won;
  /** 공용통장 중 하나라도 미확인이면 null */
  closingBalance: Won | null;
  /** 기준 월이면 null (흐름을 계산하지 않는다) */
  flows: JointFlows | null;
  plan: {
    inflow: Won;
    consumption: Won;
    principal: Won;
    /** 공용통장에서 다른 공동 자산으로 옮기기로 한 금액 (공동저축의 일부) */
    designatedSavings: Won;
    savings: Won;
  };
}

function sum(values: Won[]): Won {
  return values.reduce((total, value) => total + value, 0);
}

function sumOrNull(values: (Won | null)[]): Won | null {
  return values.some((value) => value === null) ? null : sum(values as Won[]);
}

export function jointMonthSummary(report: MonthReport, plan: JointPlan, memberIds: string[]): JointMonthSummary {
  const accountLines = report.assetLines.filter((line) => line.pocket === JOINT && line.kind === "cash");
  const accounts: JointAccount[] = accountLines.map((line) => ({
    assetId: line.assetId,
    name: line.name,
    opening: line.openValue,
    closing: line.confirmed ? line.value : null,
  }));

  const contributions: JointContribution[] = memberIds.map((pocket) => {
    const lines = report.contributionLines.filter((line) => line.pocket === pocket);
    const planned = lines.filter((line) => line.planned !== null);
    return {
      pocket,
      planned: planned.length ? sum(planned.map((line) => line.planned!)) : null,
      actual: lines.length ? sumOrNull(lines.map((line) => line.actual)) : null,
    };
  });

  const pocket = report.pockets.find((p) => p.pocket === JOINT);
  let flows: JointFlows | null = null;
  if (pocket && !report.isBaseline) {
    const contributionsIn = sum(report.contributionLines.map((line) => line.actual ?? line.planned ?? 0));
    const movedToAssets = sum(
      report.assetLines
        .filter((line) => line.pocket === JOINT && line.kind !== "cash")
        .map((line) => line.contributed),
    );
    const transfersOut = sum(report.transferLines.filter((line) => line.from === JOINT).map((line) => line.amount));
    flows = {
      otherInflow: pocket.income + pocket.transfersIn - contributionsIn,
      consumption: pocket.consumption,
      plannedConsumption: pocket.plannedConsumption,
      classified: pocket.classified,
      unclassified: pocket.unclassified,
      principalPaid: pocket.principalPaid,
      movedToAssets,
      transfersOut,
      movedOut: movedToAssets + transfersOut,
      savings: pocket.assetContribution,
      expenseLines: pocket.expenseLines,
    };
  }

  return {
    month: report.month,
    isBaseline: report.isBaseline,
    complete: report.complete,
    contributions,
    plannedContributions: plan.contributions,
    actualContributions: report.isBaseline ? null : sumOrNull(contributions.map((c) => c.actual)),
    accounts,
    openingBalance: sum(accounts.map((account) => account.opening)),
    closingBalance: sumOrNull(accounts.map((account) => account.closing)),
    flows,
    plan: {
      inflow: plan.contributions + plan.income,
      consumption: plan.expenses + plan.debtInterest,
      principal: plan.debtPrincipal,
      designatedSavings: plan.designatedSavings,
      savings: plan.surplus,
    },
  };
}

export interface JointHistoryRow {
  month: Ym;
  /** 흐름 값은 정산이 끝난 달(기준 월 제외)에만 있다 */
  contributions: Won | null;
  consumption: Won | null;
  savings: Won | null;
  closingBalance: Won | null;
}

/** 최근 count 개월의 공용통장 요약 (오름차순) */
export function jointHistory(points: HistoryPoint[], count: number): JointHistoryRow[] {
  return points.slice(-count).map(({ month, report }) => {
    const settled = report.complete && !report.isBaseline;
    const pocket = report.pockets.find((p) => p.pocket === JOINT);
    const accountLines = report.assetLines.filter((line) => line.pocket === JOINT && line.kind === "cash");
    return {
      month,
      contributions: settled ? sumOrNull(report.contributionLines.map((line) => line.actual)) : null,
      consumption: settled && pocket ? pocket.consumption : null,
      savings: settled && pocket ? pocket.assetContribution : null,
      closingBalance: accountLines.length
        ? sumOrNull(accountLines.map((line) => (line.confirmed ? line.value : null)))
        : null,
    };
  });
}
