"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { MoneyChart } from "@/components/chart";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Delta, Money } from "@/components/money";
import { MonthSwitcher } from "@/components/month-switcher";
import { PocketBadge, pocketColor } from "@/components/pocket-badge";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Ym } from "@/lib/finance/types";
import { formatDate, formatPercent } from "@/lib/format";

/* 아래 금액·이름은 모두 화면을 보여 주기 위한 가상의 값이다. */

const netWorthTrend = [
  { month: "2025-12", netWorth: 301_400_000 },
  { month: "2026-01", netWorth: 304_900_000 },
  { month: "2026-02", netWorth: 309_200_000 },
  { month: "2026-03", netWorth: 307_600_000 },
  { month: "2026-04", netWorth: 314_300_000 },
  { month: "2026-05", netWorth: 319_800_000 },
  { month: "2026-06", netWorth: 324_100_000 },
  { month: "2026-07", netWorth: 329_500_000 },
  { month: "2026-08", netWorth: 333_700_000 },
  { month: "2026-09", netWorth: 338_900_000 },
  { month: "2026-10", netWorth: 344_050_000 },
  { month: "2026-11", netWorth: 348_200_000 },
];

const savingsByPocket = [
  { month: "2026-06", member1: 700_000, member2: 500_000, joint: 820_000 },
  { month: "2026-07", member1: 700_000, member2: 500_000, joint: 910_000 },
  { month: "2026-08", member1: 900_000, member2: null, joint: 640_000 }, // 미확인(null)
  { month: "2026-09", member1: 700_000, member2: 650_000, joint: 880_000 },
  { month: "2026-10", member1: 700_000, member2: 500_000, joint: 760_000 },
  { month: "2026-11", member1: 850_000, member2: 500_000, joint: 1_000_000 },
];

const pockets = [
  { tone: "member-1", name: "지훈", available: 1_180_000, budget: 800_000, spent: 496_000, usedPercent: 62 },
  { tone: "member-2", name: "서연", available: null, budget: 700_000, spent: null, usedPercent: null },
  { tone: "joint", name: "공동", available: 388_000, budget: 1_500_000, spent: 1_612_000, usedPercent: 107.5 },
] as const;

const upcoming = [
  { date: "2027-03-25", title: "자동차 할부 종료", note: "매달 쓸 수 있는 돈", delta: 450_000 },
  { date: "2027-06-30", title: "아파트 입주 잔금", note: "일회성 지출", delta: -120_000_000 },
  { date: "2028-01-01", title: "육아휴직 시작", note: "월수입", delta: -2_600_000 },
];

const ranges = [
  { value: "6", label: "6개월" },
  { value: "12", label: "1년" },
] as const;

export function KitOverview() {
  const [month, setMonth] = useState<Ym>("2026-11");
  const [range, setRange] = useState<(typeof ranges)[number]["value"]>("12");

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex items-center justify-between gap-3">
        <MonthSwitcher value={month} onChange={setMonth} min="2025-12" max="2026-11" className="-ml-2.5" />
        <Badge variant="warning">정산 전</Badge>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        {/* 대표 숫자 */}
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-1 flex-col gap-6">
            <Stat
              size="lg"
              label="순자산"
              info={<InfoTip title="순자산">총자산에서 총부채를 뺀 금액입니다. 비현금 복지는 포함하지 않습니다.</InfoTip>}
              value={<Money amount={348_200_000} />}
              sub={
                <>
                  지난달보다 <Delta amount={4_150_000} />
                </>
              }
            />
            <Separator className="mt-auto" />
            <dl className="grid gap-3 sm:grid-cols-3 sm:gap-6">
              {[
                { label: "총자산", amount: 412_000_000 },
                { label: "총부채", amount: 63_800_000 },
                { label: "가용자산", amount: 58_400_000 },
              ].map((item) => (
                <div key={item.label} className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
                  <dt className="text-sm font-medium text-muted-foreground">{item.label}</dt>
                  <dd className="text-base font-semibold sm:text-lg">
                    <Money amount={item.amount} />
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {/* 진행률 */}
        <Card>
          <CardContent className="flex flex-1 flex-col gap-5">
            <Stat
              label="이번 달 저축"
              info={<InfoTip title="실제 저축액">이번 달 저축성 자산에 새로 넣은 금액입니다. 투자 평가손익은 포함하지 않습니다.</InfoTip>}
              value={<Money amount={2_350_000} />}
              sub={
                <>
                  목표 <Money amount={2_000_000} />
                </>
              }
            />
            <div className="flex flex-col gap-2">
              <Progress value={100} aria-label="저축 목표 달성률" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">달성률</span>
                <span className="font-semibold text-brand tabular-nums">{formatPercent(117.5)}</span>
              </div>
            </div>
            <Separator className="mt-auto" />
            <dl className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">합산 월수입</dt>
                <dd className="font-semibold">
                  <Money amount={7_420_000} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">저축률</dt>
                <dd className="font-semibold tabular-nums">{formatPercent(31.7)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* 추이 차트 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>순자산 추이</CardTitle>
            <CardDescription>월말 기준</CardDescription>
            <CardAction>
              <SegmentedControl size="sm" aria-label="기간" options={ranges} value={range} onValueChange={setRange} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <MoneyChart
              type="area"
              label="월별 순자산 추이"
              data={netWorthTrend.slice(-Number(range))}
              xKey="month"
              series={[{ key: "netWorth", label: "순자산" }]}
            />
          </CardContent>
        </Card>

        {/* 주머니 */}
        <Card>
          <CardHeader>
            <CardTitle>생활비</CardTitle>
            <CardDescription>이번 달 예산 대비 사용</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {pockets.map((pocket) => {
              const over = pocket.usedPercent != null && pocket.usedPercent > 100;
              return (
                <div key={pocket.tone} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <PocketBadge tone={pocket.tone}>{pocket.name}</PocketBadge>
                    <div className="flex items-center gap-2">
                      {over && <Badge variant="warning">예산 초과</Badge>}
                      <Money amount={pocket.spent} className="text-body font-semibold" />
                    </div>
                  </div>
                  <Progress
                    value={pocket.usedPercent}
                    tone={over ? "warning" : pocket.tone}
                    aria-label={`${pocket.name} 생활비 사용률`}
                  />
                  <p className="flex justify-between text-caption text-muted-foreground">
                    <span>
                      예산 <Money amount={pocket.budget} />
                    </span>
                    <span className="tabular-nums">{pocket.usedPercent == null ? "잔액 입력 전" : formatPercent(pocket.usedPercent)}</span>
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 누적 막대 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>월별 저축</CardTitle>
            <CardDescription>누가 얼마나 모았는지</CardDescription>
          </CardHeader>
          <CardContent>
            <MoneyChart
              type="bar"
              stacked
              label="최근 6개월 주머니별 저축액"
              data={savingsByPocket}
              xKey="month"
              height={220}
              series={[
                { key: "member1", label: "지훈", color: pocketColor("member-1") },
                { key: "member2", label: "서연", color: pocketColor("member-2") },
                { key: "joint", label: "공동", color: pocketColor("joint") },
              ]}
            />
          </CardContent>
        </Card>

        {/* 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>다가오는 일</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="-my-3 divide-y">
              {upcoming.map((event) => (
                <li key={event.title} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium">{event.title}</p>
                    <p className="text-caption text-muted-foreground tabular-nums">{formatDate(event.date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Delta amount={event.delta} compact className="text-body" />
                    <p className="text-caption text-muted-foreground">{event.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* 빈 상태 · 불러오는 중 */}
        <Card className="lg:col-span-2">
          <EmptyState
            title="아직 목표가 없어요"
            description="비상금, 입주 잔금처럼 모으려는 돈을 목표로 등록하면 달성 시점을 알려 드려요."
            action={
              <Button variant="secondary">
                <Plus aria-hidden />
                목표 추가
              </Button>
            }
          />
        </Card>
        <Card aria-busy aria-label="불러오는 중">
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-2 w-full rounded-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
