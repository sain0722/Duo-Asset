"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CHART_COLORS, MoneyChart } from "@/components/chart";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Delta, Money } from "@/components/money";
import { PageContainer, PageHeader } from "@/components/page";
import { PocketBadge } from "@/components/pocket-badge";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Stat } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { basisText, currentPosition, history, pocketName, pocketTone, positionView } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import { ASSET_KINDS, pocketOf } from "@/lib/finance/meta";
import { JOINT } from "@/lib/finance/types";
import { formatMonthOnly, formatPercent } from "@/lib/format";
import { todayInSeoul } from "@/lib/month";
import { cn } from "@/lib/utils";

import { AssetFormDialog } from "./asset-form-dialog";
import { ASSET_INFO } from "./info";
import { CompositionBar } from "./composition";
import {
  COMPOSITION_GROUPS,
  compositionHistory,
  daysUntil,
  ddayLabel,
  groupAssets,
  positionChange,
  valuationOf,
  type AssetRow,
  type PocketFilter,
} from "./derive";

export function AssetsView() {
  const data = useHousehold();
  const position = currentPosition(data);
  const points = history(data);
  const [filter, setFilter] = useState<PocketFilter>("all");
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);

  const lines = position.report?.assetLines ?? [];
  const { groups, archived } = groupAssets(data.assets, lines, filter);
  const unconfirmed = lines.filter((line) => !line.confirmed).length;
  const view = positionView(data);
  const change = positionChange(view, (totals) => totals.assets);

  function openAdd() {
    setAddKey((key) => key + 1);
    setAdding(true);
  }

  const filterOptions = [
    { value: "all", label: "전체" },
    ...data.members.map((member) => ({ value: member.id, label: member.name })),
    { value: JOINT, label: "공동" },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="자산"
        actions={
          <Button onClick={openAdd}>
            <Plus aria-hidden />
            자산 추가
          </Button>
        }
      />
      <SectionTabs items={SECTION_TABS.assets} aria-label="자산 메뉴" />

      {data.assets.length === 0 ? (
        <Card>
          <EmptyState
            title="아직 등록한 자산이 없어요"
            description="통장·예금·투자 계좌부터 하나씩 추가하면 총자산과 구성이 바로 계산됩니다."
            action={
              <Button variant="secondary" onClick={openAdd}>
                <Plus aria-hidden />
                자산 추가
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <Card>
              <CardContent className="flex flex-col gap-6">
                <Stat
                  size="lg"
                  label="총자산"
                  info={<InfoTip title="총자산">{ASSET_INFO.total}</InfoTip>}
                  value={<Money amount={position.totals.assets} />}
                  sub={
                    <>
                      {/* 기준 표기는 한 줄을 차지하고, 증감은 다음 줄에 (홈과 같은 표기) */}
                      {view && <span className="w-full">{basisText(view.basis)}</span>}
                      {change && (
                        <>
                          <span>{formatMonthOnly(change.since)} 말보다</span>
                          <Delta amount={change.amount} />
                        </>
                      )}
                    </>
                  }
                />
                <CompositionBar byKind={position.totals.byKind} />
                <Separator />
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6">
                  <SummaryItem label="가용자산" info={ASSET_INFO.liquid} amount={position.totals.liquid} />
                  <SummaryItem label="금융자산" info={ASSET_INFO.financial} amount={position.totals.financial} />
                </dl>
                {unconfirmed > 0 && position.asOf && view?.basis.kind !== "closed" && (
                  <p className="-mt-2 text-caption text-muted-foreground">
                    {formatMonthOnly(position.asOf)} 값을 아직 확인하지 않은 자산 {unconfirmed}개는 지난달 값으로 계산했어요.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-3">
                <CardTitle>자산 목록</CardTitle>
                <SegmentedControl
                  aria-label="주머니"
                  fullWidth
                  size="sm"
                  options={filterOptions}
                  value={filter}
                  onValueChange={setFilter}
                  className="sm:w-auto sm:max-w-sm"
                />
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">이 주머니에는 자산이 없어요.</p>}
                {groups.map((group) => (
                  <section key={group.kind} aria-label={group.label}>
                    <div className="flex items-baseline justify-between gap-3 pb-1">
                      <h4 className="text-sm font-semibold text-muted-foreground">{group.label}</h4>
                      <Money amount={group.total} className="text-sm text-muted-foreground" />
                    </div>
                    <ul className="divide-y">
                      {group.rows.map((row) => (
                        <AssetListItem key={row.asset.id} row={row} />
                      ))}
                    </ul>
                  </section>
                ))}
                {archived.length > 0 && <ArchivedAssets rows={archived} />}
              </CardContent>
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:sticky lg:top-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1">
                  순자산 추이
                  <InfoTip title="순자산">{ASSET_INFO.netWorth}</InfoTip>
                </CardTitle>
                {points.length >= 2 && <CardDescription>월말 기준 · 이번 달은 잠정</CardDescription>}
              </CardHeader>
              <CardContent>
                {points.length < 2 ? (
                  <EmptyState
                    className="py-6"
                    title="두 달 이상 기록되면 추이를 보여 드려요"
                    description="매달 정산하면 월말 순자산이 여기에 쌓입니다."
                  />
                ) : (
                  <MoneyChart
                    type="area"
                    label="월별 순자산 추이"
                    data={points.map((point) => ({ month: point.month, netWorth: point.report.closing.netWorth }))}
                    xKey="month"
                    series={[{ key: "netWorth", label: "순자산" }]}
                    height={200}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>자산 구성 추이</CardTitle>
                <CardDescription>월말 평가금액</CardDescription>
              </CardHeader>
              <CardContent>
                <MoneyChart
                  type="bar"
                  stacked
                  label="월별 자산 구성"
                  data={compositionHistory(points)}
                  xKey="month"
                  series={COMPOSITION_GROUPS.map((group, index) => ({ key: group.id, label: group.label, color: CHART_COLORS[index] }))}
                  height={220}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <AssetFormDialog key={addKey} open={adding} onOpenChange={setAdding} />
    </PageContainer>
  );
}

function SummaryItem({ label, info, amount }: { label: string; info: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
      <dt className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
        {label}
        <InfoTip title={label}>{info}</InfoTip>
      </dt>
      <dd className="text-base font-semibold sm:text-lg">
        <Money amount={amount} />
      </dd>
    </div>
  );
}

function AssetListItem({ row }: { row: AssetRow }) {
  const data = useHousehold();
  const { asset, line } = row;
  const pocket = pocketOf(asset.owner_member_id);
  const valuation = ASSET_KINDS[asset.kind].tracking === "valuation" && line !== null;
  const { gain, rate } = line ? valuationOf(line.value, line.principal) : { gain: 0, rate: null };
  const days = asset.maturity_date ? daysUntil(asset.maturity_date, todayInSeoul()) : null;

  return (
    <li>
      <Link
        href={`/assets/${asset.id}`}
        className={cn(
          "-mx-2 flex min-h-15 items-center gap-3 rounded-xl px-2 py-3 transition-colors",
          "outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-body font-medium">{asset.name}</p>
          <div className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
            <PocketBadge tone={pocketTone(data, pocket)} className="text-caption font-normal">
              {pocketName(data, pocket)}
            </PocketBadge>
            {days !== null && days >= 0 && <span className="tabular-nums">만기 {ddayLabel(days)}</span>}
            {days !== null && days < 0 && <span>만기 지남</span>}
            {line && !line.confirmed && <span>지난달 값</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Money amount={line?.value} className="text-body font-semibold" />
          {valuation && (
            <span className="flex items-center gap-1.5 text-caption">
              <Delta amount={gain} compact />
              {rate !== null && <span className="text-muted-foreground tabular-nums">{formatPercent(rate)}</span>}
            </span>
          )}
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
      </Link>
    </li>
  );
}

function ArchivedAssets({ rows }: { rows: AssetRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <Button
        variant="ghost"
        className="-mx-2 w-[calc(100%+1rem)] justify-between px-2 text-sm text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        보관한 자산 {rows.length}개
        <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <ul className="divide-y opacity-80">
          {rows.map((row) => (
            <AssetListItem key={row.asset.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}
