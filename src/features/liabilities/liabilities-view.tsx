"use client";

import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Delta, Money } from "@/components/money";
import { PageContainer, PageHeader } from "@/components/page";
import { PocketBadge } from "@/components/pocket-badge";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { basisText, currentPosition, planForMonth, pocketName, pocketTone, positionView } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import { pocketOf } from "@/lib/finance/meta";
import { formatCompactWon, formatMonthOnly, formatYm } from "@/lib/format";
import { addMonths } from "@/lib/month";
import { cn } from "@/lib/utils";

import { positionChange } from "@/features/assets/derive";

import { debtPlanTotals, expenseReleases, payoffInfo, releaseTimeline, scheduleStart, type Release } from "./derive";
import { LiabilityFormDialog } from "./liability-form-dialog";
import { LiabilityItem, type LiabilityItemModel } from "./liability-item";

const INFO = {
  total: "부채 남은 원금의 합입니다. 이번 달 잔액을 아직 확인하지 않은 부채는 지난달 값으로 계산합니다.",
  scheduled:
    "부채 일정으로 계산한 이번 달 납부 예정액입니다. 원금 상환은 현금과 부채를 함께 줄여 순자산이 그대로이고, 이자는 소비지출입니다.",
  release: "부채가 끝나면 그다음 달부터 평소 월 납부액만큼(만기일시상환은 매월 내던 이자만큼) 매월 여유 자금이 늘어납니다.",
};

export function LiabilitiesView() {
  const data = useHousehold();
  const position = currentPosition(data);
  const asOf = position.asOf;
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);

  function openAdd() {
    setAddKey((key) => key + 1);
    setAdding(true);
  }

  const header = (
    <>
      <PageHeader
        title="부채·고정지출"
        actions={
          <Button onClick={openAdd}>
            <Plus aria-hidden />
            부채 추가
          </Button>
        }
      />
      <SectionTabs items={SECTION_TABS.assets} aria-label="자산 메뉴" />
      <LiabilityFormDialog key={addKey} open={adding} onOpenChange={setAdding} />
    </>
  );

  if (!asOf || !position.report) return <PageContainer>{header}</PageContainer>;

  const plan = planForMonth(data, asOf);
  const scheduled = debtPlanTotals(plan);
  const view = positionView(data);
  const change = positionChange(view, (totals) => totals.liabilities);

  const models: LiabilityItemModel[] = data.liabilities
    .toSorted((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((liability) => {
      const line = position.report!.liabilityLines.find((l) => l.liabilityId === liability.id) ?? null;
      const start = line ? scheduleStart(line, asOf) : null;
      return {
        liability,
        line,
        planned: plan.lines.find((l) => l.kind === "debt" && l.liabilityId === liability.id) ?? null,
        payoff: start ? payoffInfo(liability, start.from, start.balance) : null,
      };
    });
  const active = models.filter((model) => model.liability.is_active);
  const archived = models.filter((model) => !model.liability.is_active);

  const debtReleases: Release[] = active.flatMap(({ liability, payoff }) =>
    payoff?.endMonth && payoff.freed > 0
      ? [
          {
            key: `debt:${liability.id}`,
            source: "debt" as const,
            name: liability.name,
            pocket: pocketOf(liability.payer_member_id),
            endMonth: payoff.endMonth,
            freedFrom: addMonths(payoff.endMonth, 1),
            amount: payoff.freed,
          },
        ]
      : [],
  );
  const timeline = releaseTimeline([...debtReleases, ...expenseReleases(data.planItems, asOf)]);

  return (
    <PageContainer>
      {header}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <Card>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <Stat
                size="lg"
                label="총부채"
                info={<InfoTip title="총부채">{INFO.total}</InfoTip>}
                value={<Money amount={position.totals.liabilities} />}
                sub={
                  <>
                    {/* 기준 표기는 한 줄을 차지하고, 증감은 다음 줄에 (홈과 같은 표기) */}
                    {view && <span className="w-full">{basisText(view.basis)}</span>}
                    {change && change.amount !== 0 && (
                      <>
                        <span>{formatMonthOnly(change.since)} 말보다</span>
                        <Delta amount={change.amount} />
                      </>
                    )}
                  </>
                }
              />
              <Separator className="sm:hidden" />
              <div className="flex flex-col gap-3">
                <Stat
                  label={`${formatMonthOnly(asOf)} 예정 상환`}
                  info={<InfoTip title="예정 상환액">{INFO.scheduled}</InfoTip>}
                  value={<Money amount={scheduled.payment} />}
                />
                <dl className="flex flex-col gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">원금</dt>
                    <dd className="font-medium">
                      <Money amount={scheduled.principal} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">이자·지급</dt>
                    <dd className="font-medium">
                      <Money amount={scheduled.interest} />
                    </dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>부채</CardTitle>
              <CardDescription>눌러서 상환 일정과 실제 상환을 봅니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {active.length === 0 ? (
                <EmptyState
                  className="py-6"
                  title="갚고 있는 부채가 없어요"
                  description="대출·할부·차용금을 등록하면 끝나는 시점과 그 뒤에 생기는 여유를 알려 드려요."
                  action={
                    <Button variant="secondary" onClick={openAdd}>
                      <Plus aria-hidden />
                      부채 추가
                    </Button>
                  }
                />
              ) : (
                <ul className="-my-1 divide-y">
                  {active.map((model) => (
                    <LiabilityItem key={model.liability.id} model={model} asOf={asOf} />
                  ))}
                </ul>
              )}
              {archived.length > 0 && <Archived models={archived} asOf={asOf} />}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-1">
              여유 자금 변화
              <InfoTip title="풀리는 월 여유 자금">{INFO.release}</InfoTip>
            </CardTitle>
            <CardDescription>부채·고정지출이 끝나면 매월 쓸 수 있는 돈</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">끝나는 날이 정해진 부채나 고정지출이 없어요.</p>
            ) : (
              <ol className="relative flex flex-col">
                {timeline.map((entry, index) => (
                  <li key={entry.key} className="relative flex gap-3 pb-5 last:pb-0">
                    {/* 시점을 잇는 세로선 */}
                    {index < timeline.length - 1 && <span aria-hidden className="absolute top-3 bottom-0 left-[5px] w-px bg-border" />}
                    <span aria-hidden className="mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-foreground/70 bg-card" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-caption font-medium text-muted-foreground tabular-nums">{formatYm(entry.freedFrom)}부터</p>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-body font-medium">{entry.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums">+{formatCompactWon(entry.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground">
                        <span className="flex min-w-0 items-center gap-2">
                          <Badge variant="neutral" className="h-5 px-1.5">
                            {entry.source === "debt" ? "부채" : "고정지출"}
                          </Badge>
                          <PocketBadge tone={pocketTone(data, entry.pocket)} className="text-caption font-normal">
                            {pocketName(data, entry.pocket)}
                          </PocketBadge>
                        </span>
                        <span className={cn("shrink-0 tabular-nums", index === timeline.length - 1 && "font-semibold text-foreground")}>
                          누적 매월 +{formatCompactWon(entry.cumulative)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Separator />
            <p className="text-caption text-muted-foreground">
              고정지출과 끝나는 달은{" "}
              <Link href="/plan" className="font-medium text-brand underline-offset-4 hover:underline">
                월급·배분
              </Link>
              에서 고칩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function Archived({ models, asOf }: { models: LiabilityItemModel[]; asOf: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-2 border-t pt-2">
      <Button
        variant="ghost"
        className="-mx-2 w-[calc(100%+1rem)] justify-between px-2 text-sm text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        보관한 부채 {models.length}개
        <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <ul className="divide-y opacity-80">
          {models.map((model) => (
            <LiabilityItem key={model.liability.id} model={model} asOf={asOf} />
          ))}
        </ul>
      )}
    </section>
  );
}
