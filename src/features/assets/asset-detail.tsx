"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { MoneyChart } from "@/components/chart";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Delta, Money } from "@/components/money";
import { PageContainer, PageHeader } from "@/components/page";
import { PocketBadge } from "@/components/pocket-badge";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { currentPosition, goalsView, history, pocketName, pocketTone } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import type { HouseholdData } from "@/lib/data/types";
import { ASSET_KINDS, LIQUIDITY_LABELS, pocketOf } from "@/lib/finance/meta";
import { formatDate, formatMonthOnly, formatPercent, formatYm, formatYmShort } from "@/lib/format";
import { currentYm, todayInSeoul } from "@/lib/month";
import { cn } from "@/lib/utils";

import { AssetActions } from "./asset-actions";
import { ASSET_INFO } from "./info";
import { assetHistory, daysUntil, ddayLabel, valuationOf } from "./derive";

const PRINCIPAL_INFO = "지금까지 넣은 돈 − 뺀 돈입니다. 세법상 취득원가가 아닙니다.";
const CONTRIBUTED_INFO = "그 달에 넣은 돈 − 뺀 돈(순투입액의 변화)입니다. 평가 변동은 들어가지 않습니다.";

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const data = useHousehold();
  const asset = data.assets.find((candidate) => candidate.id === id);

  if (!asset) {
    return (
      <PageContainer>
        <BackLink />
        <EmptyState
          title="자산을 찾을 수 없어요"
          description="삭제되었거나 다른 가구의 자산입니다."
          action={
            <Button variant="secondary" asChild>
              <Link href="/assets">자산 목록으로</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const position = currentPosition(data);
  const line = position.report?.assetLines.find((candidate) => candidate.assetId === asset.id) ?? null;
  const rows = assetHistory(history(data), asset.id);
  const valuation = ASSET_KINDS[asset.kind].tracking === "valuation";
  const pocket = pocketOf(asset.owner_member_id);
  const current = line ? valuationOf(line.value, line.principal) : null;
  const days = asset.maturity_date ? daysUntil(asset.maturity_date, todayInSeoul()) : null;
  const valuedOn = latestValuedOn(data, asset.id);

  const goals = goalsView(data, currentYm())
    .progress.flatMap((progress) => {
      const allocation = progress.allocations.find((a) => a.assetId === asset.id);
      const goal = data.goals.find((g) => g.id === progress.goalId);
      return allocation && goal && !goal.is_archived ? [{ goal, allocation }] : [];
    });
  const savingPlans = data.planItems.filter((item) => item.kind === "saving" && item.asset_id === asset.id && item.is_active);
  const debts = data.liabilities.filter((liability) => liability.withdraw_asset_id === asset.id && liability.is_active);

  return (
    <PageContainer>
      <BackLink />
      <PageHeader
        className="-mt-2"
        title={asset.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PocketBadge tone={pocketTone(data, pocket)} className="font-normal">
              {pocketName(data, pocket)}
            </PocketBadge>
            <span aria-hidden>·</span>
            {ASSET_KINDS[asset.kind].label}
            <span aria-hidden>·</span>
            {LIQUIDITY_LABELS[asset.liquidity]}
            {!asset.is_active && <Badge variant="outline">보관됨</Badge>}
          </span>
        }
        actions={<AssetActions asset={asset} line={line} onDeleted={() => router.replace("/assets")} />}
      />

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:row-span-2">
          <CardContent className="flex flex-col gap-5">
            <Stat
              size="lg"
              label={valuation ? "평가금액" : "잔액"}
              value={<Money amount={line?.value} />}
              sub={
                <>
                  {position.asOf && <span>{formatYm(position.asOf)} 기준</span>}
                  {valuedOn && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{formatDate(valuedOn)} 기준</span>
                    </>
                  )}
                  {line && !line.confirmed && <Badge variant="warning">이번 달 미확인 · 지난달 값</Badge>}
                </>
              }
            />
            {(valuation || days !== null || asset.memo) && <Separator />}
            <dl className="flex flex-col gap-3 text-sm">
              {valuation && line && current && (
                <>
                  <Row label="순투입액" info={PRINCIPAL_INFO}>
                    <Money amount={line.principal} />
                  </Row>
                  <Row label="평가손익" info={ASSET_INFO.gain}>
                    <span className="flex items-baseline gap-2">
                      <Delta amount={current.gain} />
                      {current.rate !== null && <span className="text-muted-foreground tabular-nums">{formatPercent(current.rate)}</span>}
                    </span>
                  </Row>
                </>
              )}
              {asset.maturity_date && days !== null && (
                <Row label="만기일">
                  <span className="tabular-nums">
                    {formatDate(asset.maturity_date)}
                    <span className="ml-2 text-muted-foreground">{days >= 0 ? ddayLabel(days) : "지남"}</span>
                  </span>
                </Row>
              )}
            </dl>
            {asset.memo && <p className="text-sm whitespace-pre-line text-muted-foreground">{asset.memo}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{valuation ? "평가금액·순투입액 추이" : "잔액 추이"}</CardTitle>
            <CardDescription>월말 기준 · 이번 달은 잠정</CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length < 2 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">두 달 이상 기록이 쌓이면 추이를 보여 드려요.</p>
            ) : (
              <MoneyChart
                type={valuation ? "line" : "area"}
                label={`${asset.name} 월별 추이`}
                data={rows.map((row) => ({
                  month: row.month,
                  value: row.confirmed ? row.value : null,
                  principal: row.confirmed ? row.principal : null,
                }))}
                xKey="month"
                series={
                  valuation
                    ? [
                        { key: "value", label: "평가금액" },
                        { key: "principal", label: "순투입액" },
                      ]
                    : [{ key: "value", label: "잔액" }]
                }
                height={220}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>월별 기록</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryTable rows={rows} valuation={valuation} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>연결된 계획</CardTitle>
            <CardDescription>이 자산을 쓰는 목표·저축 계획</CardDescription>
          </CardHeader>
          <CardContent>
            {goals.length + savingPlans.length + debts.length === 0 ? (
              <p className="text-sm text-muted-foreground">연결된 목표나 저축 계획이 없어요.</p>
            ) : (
              <ul className="-my-2.5 divide-y">
                {goals.map(({ goal, allocation }) => (
                  <LinkRow key={goal.id} href="/goals" label={goal.name} kind="목표 배정">
                    <Money amount={allocation.allocated} compact />
                  </LinkRow>
                ))}
                {savingPlans.map((item) => (
                  <LinkRow key={item.id} href="/plan" label={item.name} kind={`${pocketName(data, pocketOf(item.member_id))} 저축 계획`}>
                    <span>
                      <Money amount={item.amount} compact />
                      <span className="text-muted-foreground">{item.months_of_year ? "" : " / 월"}</span>
                    </span>
                  </LinkRow>
                ))}
                {debts.map((liability) => (
                  <LinkRow key={liability.id} href="/liabilities" label={liability.name} kind="이 계좌에서 출금">
                    <span className="text-muted-foreground">부채</span>
                  </LinkRow>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

/**
 * 지금 보이는 값을 담은 스냅샷의 평가 기준일. 없으면(그 달 말일 기준) null.
 * 열린 달만 monthData 에 있으므로 값이 마감된 달의 것이면 표시하지 않는다.
 */
function latestValuedOn(data: HouseholdData, assetId: string): string | null {
  for (const month of data.months.toReversed()) {
    const snapshot = data.monthData[month.id]?.assetSnapshots.find((s) => s.asset_id === assetId);
    if (snapshot) return snapshot.valued_on;
  }
  return null;
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 self-start text-muted-foreground">
      <Link href="/assets">
        <ChevronLeft aria-hidden />
        자산
      </Link>
    </Button>
  );
}

function Row({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {label}
        {info && <InfoTip title={label}>{info}</InfoTip>}
      </dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

function LinkRow({ href, label, kind, children }: { href: string; label: string; kind: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2.5 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="min-w-0">
          <span className="block truncate text-body font-medium">{label}</span>
          <span className="block text-caption text-muted-foreground">{kind}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold">{children}</span>
      </Link>
    </li>
  );
}

function HistoryTable({ rows, valuation }: { rows: ReturnType<typeof assetHistory>; valuation: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">아직 기록이 없어요.</p>;
  const head = "py-2 text-right text-caption font-medium text-muted-foreground";
  const cell = "py-2.5 text-right tabular-nums";
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th scope="col" className={cn(head, "text-left")}>
            월
          </th>
          <th scope="col" className={head}>
            {valuation ? "평가금액" : "잔액"}
          </th>
          <th scope="col" className={head}>
            <span className="inline-flex items-center gap-0.5">
              순입금
              <InfoTip title="순입금">{CONTRIBUTED_INFO}</InfoTip>
            </span>
          </th>
          {valuation && (
            <th scope="col" className={head}>
              평가손익
            </th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.toReversed().map((row) => (
          <tr key={row.month}>
            <th scope="row" className="py-2.5 text-left font-normal tabular-nums">
              <span className="sm:hidden">{formatYmShort(row.month)}</span>
              <span className="hidden sm:inline">{formatYm(row.month)}</span>
              {row.provisional && <span className="ml-1 text-caption text-muted-foreground">잠정</span>}
            </th>
            {!row.confirmed ? (
              <td colSpan={valuation ? 3 : 2} className={cn(cell, "text-muted-foreground")}>
                {formatMonthOnly(row.month)} 값 미확인
              </td>
            ) : (
              <>
                <td className={cn(cell, "font-semibold")}>
                  <Money amount={row.value} compact />
                </td>
                <td className={cell}>
                  {row.isBaseline ? (
                    <span className="text-muted-foreground">기준 월</span>
                  ) : row.adjustment !== 0 && row.contributed === 0 ? (
                    <span className="text-muted-foreground">기존 자산 등록</span>
                  ) : (
                    <Money amount={row.contributed} compact sign />
                  )}
                </td>
                {valuation && (
                  <td className={cell}>{row.isBaseline ? <span className="text-muted-foreground">—</span> : <Delta amount={row.gain} compact />}</td>
                )}
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
