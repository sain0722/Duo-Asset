"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageContainer, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { canClose, findMonth, latestMonth, reportFor, workingMonth } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import type { Ym } from "@/lib/finance/types";
import { isYm } from "@/lib/month";

import { ClosedMonthView } from "./closed-month";
import { MonthHistory, MonthHistoryDisclosure } from "./month-history";
import { OpenMonthView } from "./open-month";

/** 월 정산. 기본은 정산할 달(가장 이른 열린 달)이고, ?month=YYYY-MM 으로 다른 달을 연다. */
export function SettlementScreen() {
  const data = useHousehold();
  const router = useRouter();
  const pathname = usePathname();
  const param = useSearchParams().get("month");

  const fallback = workingMonth(data) ?? latestMonth(data);
  const month = (param && isYm(param) && findMonth(data, param)) || fallback;
  const select = (ym: Ym) => router.replace(`${pathname}?month=${ym}`);
  // PC 왼쪽 열: 이력 아래에 열린 달의 진행·마감 카드를 붙인다 (OpenMonthView 가 채운다)
  const [progressSlot, setProgressSlot] = useState<HTMLDivElement | null>(null);

  const header = <PageHeader title="월 정산" description="잔액과 수입만 확인하면 소비·저축이 계산됩니다." />;

  if (!month) {
    return (
      <PageContainer>
        {header}
        <Card>
          <EmptyState title="아직 정산할 달이 없어요" description="가구를 만들면 첫 달(기준 월)이 열립니다." />
        </Card>
      </PageContainer>
    );
  }

  const report = reportFor(data, month);
  const first = data.months[0].month;
  const last = data.months.at(-1)!.month;
  const badge =
    month.status === "closed" ? (
      <Badge>마감</Badge>
    ) : report.isBaseline ? (
      <Badge variant="outline">기준 월</Badge>
    ) : !canClose(data, month) ? (
      <Badge variant="outline">대기</Badge>
    ) : report.complete ? (
      <Badge variant="brand">마감 가능</Badge>
    ) : (
      <Badge variant="warning">정산 중</Badge>
    );

  return (
    <PageContainer>
      {header}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:self-stretch">
          <aside aria-label="정산 이력">
            <Card className="gap-2 py-3 sm:gap-2 sm:py-3">
              <h2 className="px-5 pt-1 text-sm font-semibold text-muted-foreground">정산 이력</h2>
              <div className="px-2">
                <MonthHistory data={data} selected={month.month} onSelect={select} />
              </div>
            </Card>
          </aside>
          <div ref={setProgressSlot} className="lg:sticky lg:top-8" />
        </div>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <div className="flex items-center justify-between gap-3">
            <MonthSwitcher value={month.month} onChange={select} min={first} max={last} className="-ml-2.5" />
            {badge}
          </div>
          <div className="lg:hidden">
            <MonthHistoryDisclosure data={data} selected={month.month} onSelect={select} />
          </div>
          {month.status === "closed" ? (
            <ClosedMonthView key={month.id} data={data} month={month} report={report} />
          ) : (
            <OpenMonthView key={month.id} data={data} month={month} report={report} onSelectMonth={select} desktopSlot={progressSlot} />
          )}
        </div>
      </div>
    </PageContainer>
  );
}
