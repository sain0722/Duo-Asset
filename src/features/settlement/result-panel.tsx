"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";

import { Delta, Money } from "@/components/money";
import { PocketBadge } from "@/components/pocket-badge";
import { Stat } from "@/components/stat";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { pocketName, pocketTone } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import type { MonthReport, Won } from "@/lib/finance/types";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { planComparison, pocketUsage, resultWarnings, savingsAchievement, type CheckItem, type SectionId } from "./model";
import { MetricTip, type MetricId } from "./tips";

const SECTION_LABELS: Record<SectionId, string> = {
  income: "수입",
  assets: "잔액",
  liabilities: "부채",
  transfers: "공용통장 입금",
  expenses: "지출",
};

const REMAINING_LIMIT = 6;

/** 정산 결과. 미확인 항목이 남아 있으면 숫자 대신 남은 항목을 보여 준다. */
export function ResultBody({
  data,
  report,
  remaining,
  onJump,
}: {
  data: HouseholdData;
  report: MonthReport;
  /** 열린 달의 남은 확인 항목 */
  remaining?: CheckItem[];
  onJump?: (item: CheckItem) => void;
}) {
  if (!report.complete && remaining) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body">
          미확인 <span className="font-semibold tabular-nums">{remaining.length}건</span>을 확인하면 결과가 계산됩니다.
        </p>
        <ul className="-mx-2 flex flex-col">
          {remaining.slice(0, REMAINING_LIMIT).map((item) => (
            <li key={item.rowId}>
              <button
                type="button"
                onClick={() => onJump?.(item)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
                  <span className="truncate text-body">{item.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
                  {SECTION_LABELS[item.section]}
                  <ArrowRight aria-hidden className="size-3.5" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {remaining.length > REMAINING_LIMIT && (
          <p className="text-sm text-muted-foreground">외 {remaining.length - REMAINING_LIMIT}건</p>
        )}
      </div>
    );
  }

  if (report.isBaseline) {
    return (
      <div className="flex flex-col gap-5">
        <Stat size="lg" label="순자산" info={<MetricTip id="netWorth" />} value={<Money amount={report.closing.netWorth} />} />
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label="총자산" amount={report.closing.assets} />
          <Metric label="총부채" amount={report.closing.liabilities} />
        </dl>
        <p className="text-sm text-muted-foreground">기준 월입니다. 이 잔액에서 출발해 수입·소비 분석은 다음 달부터 계산합니다.</p>
      </div>
    );
  }

  const warnings = resultWarnings(report);
  const achievement = savingsAchievement(report);

  return (
    <div className="flex flex-col gap-6">
      {warnings.length > 0 && (
        <ul role="alert" className="flex flex-col gap-2 rounded-xl bg-warning/12 p-3.5">
          {warnings.map((warning) => (
            <li key={`${warning.code}:${warning.pocket ?? ""}`} className="flex gap-2 text-sm text-warning-foreground">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col gap-5">
          <Stat
            size="lg"
            label="실제 저축액"
            info={<MetricTip id="savings" />}
            value={<Money amount={report.savings} />}
            sub={
              <>
                <span className="flex items-center gap-1">
                  저축률 <span className="font-semibold text-foreground tabular-nums">{report.savingsRate === null ? "—" : formatPercent(report.savingsRate)}</span>
                  <MetricTip id="savingsRate" />
                </span>
                {achievement !== null && (
                  <span className="flex items-center gap-1">
                    · 계획 대비 <span className="font-semibold text-brand tabular-nums">{formatPercent(achievement)}</span>
                    <MetricTip id="achievement" />
                  </span>
                )}
              </>
            }
          />
          <Separator />
          <dl className="flex flex-col gap-3">
            <Metric label="총수입" tip="income" amount={report.income} />
            <Metric label="소비지출" tip="consumption" amount={report.consumption} />
            <Metric label="원금 상환액" tip="principalRepaid" amount={report.principalRepaid} />
            {report.newBorrowing > 0 && <Metric label="신규 차입" tip="newBorrowing" amount={report.newBorrowing} />}
            <Metric label="투자 평가손익" tip="investmentGain" amount={report.investmentGain} sign />
            <Metric label="기타 평가 변동" tip="otherValuation" amount={report.otherValuation} sign />
            {report.adjustment !== 0 && <Metric label="기초 조정" tip="adjustment" amount={report.adjustment} sign />}
          </dl>
          <div className="rounded-xl bg-secondary/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                순자산 변화
                <MetricTip id="netWorth" />
              </span>
              <Delta amount={report.netWorthChange} className="text-base font-semibold" />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm tabular-nums">
              <Money amount={report.opening.netWorth} compact className="text-muted-foreground" />
              <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
              <span className="sr-only">에서</span>
              <Money amount={report.closing.netWorth} compact className="font-semibold" />
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="plan-vs-actual">
            <h4 id="plan-vs-actual" className="mb-1 text-sm font-semibold">
              계획 대비 실적
            </h4>
            <ul className="divide-y">
              {planComparison(report).map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-body">{row.label}</p>
                    <p className="text-caption text-muted-foreground">
                      계획 <Money amount={row.planned} compact />
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    <Money amount={row.actual} compact className="text-body font-semibold" />
                    <Delta amount={row.diff} compact className="text-caption" />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="pocket-consumption">
            <h4 id="pocket-consumption" className="mb-3 flex items-center gap-1 text-sm font-semibold">
              주머니별 소비
              <MetricTip id="pocketConsumption" />
            </h4>
            <ul className="flex flex-col gap-4">
              {report.pockets.map((pocket) => {
                const usage = pocketUsage(pocket);
                const over = usage !== null && usage > 100;
                const tone = pocketTone(data, pocket.pocket);
                return (
                  <li key={pocket.pocket} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <PocketBadge tone={tone}>{pocketName(data, pocket.pocket)}</PocketBadge>
                      <Money amount={pocket.consumption} className="text-body font-semibold" />
                    </div>
                    <Progress value={usage} tone={over ? "warning" : tone} aria-label={`${pocket.name} 계획 대비 소비`} />
                    <p className="flex justify-between gap-3 text-caption text-muted-foreground">
                      <span>
                        계획 <Money amount={pocket.plannedConsumption} compact />
                      </span>
                      <span className={cn("tabular-nums", over && "font-medium text-warning-foreground")}>
                        {usage === null ? "" : formatPercent(usage)}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, tip, amount, sign }: { label: string; tip?: MetricId; amount: Won; sign?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {tip && <MetricTip id={tip} />}
      </dt>
      <dd className="text-base font-semibold">
        <Money amount={amount} sign={sign} />
      </dd>
    </div>
  );
}
