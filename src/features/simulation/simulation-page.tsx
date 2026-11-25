"use client";

import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Delta, Money } from "@/components/money";
import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { baseScenario, simulateScenario, simulationInputFor } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import { resolveAssumptions, simulate } from "@/lib/finance";
import type { FutureEvent } from "@/lib/finance/types";
import { formatYm } from "@/lib/format";

import { AssumptionsPanel } from "./assumptions-panel";
import { EventsPanel } from "./events-panel";
import { METRIC_LABELS, ProjectionChart, type Metric } from "./projection-chart";
import { horizonRows, plannedMonthlyInvestment, storedAssumptions } from "./projection";
import { ScenarioControls } from "./scenario-controls";
import { useAssumptionDraft, useScenarioWriter } from "./use-scenario";

const METRICS: Metric[] = ["netWorth", "cash", "assets", "liabilities"];
const HORIZONS = ["5", "10", "20", "30"] as const;

const METRIC_TITLES: Record<Metric, string> = { ...METRIC_LABELS, cash: "현금성 자산" };

const METRIC_INFO: Record<Metric, string> = {
  netWorth: "총자산 − 총부채.",
  cash: "현금·입출금, 예금, 적금의 합. 음수가 되면 자금 부족입니다.",
  assets: "현금성 자산 + 투자자산 + 부동산·보증금·분양 납부금·자동차 등.",
  liabilities: "부채 남은 원금의 합. 예정대로 상환한다고 봅니다.",
};

export function SimulationPage() {
  const data = useHousehold();
  const base = baseScenario(data);

  return (
    <PageContainer>
      <PageHeader title="미래 시뮬레이션" description="가정에 따른 예상이며, 실제 기록은 바뀌지 않습니다." />
      <SectionTabs items={SECTION_TABS.goals} aria-label="목표 메뉴" />
      {base ? (
        <Simulation baseId={base.id} />
      ) : (
        <Card>
          <EmptyState title="기본 시나리오가 없습니다" description="백업을 복원했다면 새로고침해 주세요." />
        </Card>
      )}
    </PageContainer>
  );
}

function Simulation({ baseId }: { baseId: string }) {
  const data = useHousehold();
  const scenarios = useMemo(
    () => [...data.scenarios].sort((a, b) => Number(b.is_base) - Number(a.is_base) || a.sort_order - b.sort_order),
    [data.scenarios],
  );
  const base = scenarios.find((s) => s.id === baseId) ?? scenarios[0];
  const [selectedId, setSelectedId] = useState(baseId);
  const selected = scenarios.find((s) => s.id === selectedId) ?? base;
  const isBase = selected.id === base.id;
  const [metric, setMetric] = useState<Metric>("netWorth");

  const write = useScenarioWriter();
  const draft = useAssumptionDraft(selected, write);

  // 조정 중인 가정으로 즉시 다시 계산한다 (저장은 손을 멈춘 뒤)
  const input = useMemo(() => simulationInputFor(data, selected, { assumptions: draft.values }), [data, selected, draft.values]);
  const result = useMemo(() => simulate(input), [input]);
  const baseResult = useMemo(() => (isBase ? null : simulateScenario(data, base)), [data, base, isBase]);
  const baseValues = isBase ? null : resolveAssumptions(base.assumptions);

  const rows = horizonRows(result.points, baseResult?.points ?? null, [1, 5, 10]);
  const payoffs = result.milestones.filter((m) => m.kind === "debt_paid_off");
  const shortfall = result.milestones.find((m) => m.kind === "cash_shortfall");
  const changedCount = Object.keys(storedAssumptions(draft.values)).filter((k) => k !== "horizonYears").length;

  function toggleEvent(event: FutureEvent, included: boolean) {
    const excluded = included
      ? selected.excluded_event_ids.filter((id) => id !== event.id)
      : [...selected.excluded_event_ids, event.id];
    void write(selected, { excluded_event_ids: excluded });
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ScenarioControls scenarios={scenarios} selected={selected} base={base} onSelect={setSelectedId} />

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1">
                {METRIC_TITLES[metric]} 예상
                <InfoTip title={METRIC_TITLES[metric]}>{METRIC_INFO[metric]}</InfoTip>
              </CardTitle>
              <CardDescription>
                {formatYm(input.startMonth)}부터 {draft.values.horizonYears}년
                {isBase ? "" : ` · ${base.name}과 비교`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <SegmentedControl
                  size="sm"
                  fullWidth
                  className="sm:inline-grid sm:w-auto"
                  aria-label="지표"
                  options={METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
                  value={metric}
                  onValueChange={setMetric}
                />
                <SegmentedControl
                  size="sm"
                  fullWidth
                  className="sm:inline-grid sm:w-auto"
                  aria-label="기간"
                  options={HORIZONS.map((y) => ({ value: y, label: `${y}년` }))}
                  value={String(draft.values.horizonYears) as (typeof HORIZONS)[number]}
                  onValueChange={(y) => draft.update({ horizonYears: Number(y) })}
                />
              </div>
              <ProjectionChart
                metric={metric}
                points={result.points}
                basePoints={baseResult?.points ?? null}
                selectedLabel={selected.name}
                baseLabel={base.name}
                milestones={result.milestones}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1">
                예상 순자산
                <InfoTip title="순자산">총자산 − 총부채. 그 달 말 기준 예상값입니다.</InfoTip>
              </CardTitle>
              {!isBase && <CardAction className="text-caption text-muted-foreground">{base.name} 대비</CardAction>}
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl className="grid gap-4 sm:grid-cols-3">
                {rows.map((row) => (
                  <div key={row.years} className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
                    <dt className="text-sm text-muted-foreground">
                      {row.years}년 뒤 <span className="text-caption tabular-nums">· {formatYm(row.month)}</span>
                    </dt>
                    <dd className="flex flex-col items-end sm:items-start">
                      <Money amount={row.netWorth} compact className="text-lg font-semibold" />
                      {row.diff !== null && <Delta amount={row.diff} compact className="text-caption" />}
                    </dd>
                  </div>
                ))}
              </dl>

              {shortfall && (
                <p className="flex gap-2 rounded-xl bg-warning/12 px-3.5 py-3 text-sm text-warning-foreground">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    <strong className="font-semibold">{formatYm(shortfall.month)} 현금성 자산 부족 예상</strong>
                    <span className="block">
                      그 달 <Money amount={shortfall.amount ?? null} compact /> 모자랍니다. 지출 시점이나 대출 조건을 조정해 보세요.
                    </span>
                  </span>
                </p>
              )}

              {payoffs.length > 0 && (
                <div className="flex flex-col gap-2 border-t pt-4">
                  <p className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    상환 완료
                    <InfoTip title="풀리는 월 여유 자금">
                      부채가 끝나면 그 달부터 평소 월 납부액만큼 매월 여유 자금이 늘어납니다. 만기일시상환은 매월 내던 이자만 풀립니다.
                    </InfoTip>
                  </p>
                  <ul className="flex flex-col gap-2 text-sm">
                    {payoffs.map((m, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate">{m.label}</span>
                          <span className="text-caption text-muted-foreground tabular-nums">{formatYm(m.month)}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          월 <Money amount={m.amount ?? null} compact sign className="font-semibold" /> 여유
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <AssumptionsPanel
            values={draft.values}
            onChange={draft.update}
            baseValues={baseValues}
            plannedInvestment={plannedMonthlyInvestment(data.planItems, data.assets, input.startMonth)}
            dirty={draft.dirty}
            changedCount={changedCount}
          />
          <EventsPanel scenario={selected} startMonth={input.startMonth} onToggle={toggleEvent} />
        </div>
      </div>
    </div>
  );
}
