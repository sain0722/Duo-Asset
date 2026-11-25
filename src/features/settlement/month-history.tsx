"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { Money } from "@/components/money";
import { Card } from "@/components/ui/card";
import { history } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import type { Ym } from "@/lib/finance/types";
import { formatMonthOnly, formatYm } from "@/lib/format";
import { ymParts } from "@/lib/month";
import { cn } from "@/lib/utils";

/** 정산 이력: 달 목록(최근순)과 핵심 수치. 누르면 그 달로 이동한다. */
export function MonthHistory({ data, selected, onSelect }: { data: HouseholdData; selected: Ym; onSelect: (ym: Ym) => void }) {
  const points = [...history(data)].reverse();
  const thisYear = ymParts(points[0]?.month ?? selected).year;

  return (
    <ul className="flex flex-col">
      {points.map(({ month, provisional, report }) => {
        const active = month === selected;
        // 정산이 끝나지 않은 달의 흐름 지표는 잠정값이라 보여 주지 않는다
        const settled = !report.isBaseline && report.complete;
        const status = report.isBaseline ? "기준 월" : !provisional ? "마감" : report.complete ? "마감 전" : "정산 전";
        return (
          <li key={month}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(month)}
              className={cn(
                "flex w-full flex-col gap-1 rounded-xl px-3 py-3 text-left transition-colors outline-none",
                "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                active && "bg-accent",
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-2">
                  <span className="text-body font-semibold tabular-nums">
                    {ymParts(month).year === thisYear ? formatMonthOnly(month) : formatYm(month)}
                  </span>
                  <span className={cn("text-caption", provisional && !report.isBaseline ? "text-warning-foreground" : "text-muted-foreground")}>
                    {status}
                  </span>
                </span>
                <Money amount={report.closing.netWorth} compact className="text-sm font-semibold" />
              </span>
              <span className="flex flex-wrap gap-x-2.5 text-caption text-muted-foreground tabular-nums">
                {settled ? (
                  <>
                    <span>
                      수입 <Money amount={report.income} compact />
                    </span>
                    <span>
                      소비 <Money amount={report.consumption} compact />
                    </span>
                    <span>
                      저축 <Money amount={report.savings} compact className="text-foreground" />
                    </span>
                  </>
                ) : (
                  <span>{report.isBaseline ? "잔액만 기록" : "수입·소비는 정산 후 표시"}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 모바일: 월 전환 아래 접이식 이력 */
export function MonthHistoryDisclosure(props: { data: HouseholdData; selected: Ym; onSelect: (ym: Ym) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Card className="gap-0 py-0 sm:gap-0 sm:py-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-5 text-left text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span>
          정산 이력 <span className="text-muted-foreground tabular-nums">{props.data.months.length}개월</span>
        </span>
        <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={id} className="px-2 pb-2">
          <MonthHistory
            {...props}
            onSelect={(ym) => {
              setOpen(false);
              props.onSelect(ym);
            }}
          />
        </div>
      )}
    </Card>
  );
}
