"use client";

import { useState } from "react";

import { MoneyChart } from "@/components/chart";
import { EmptyState } from "@/components/empty-state";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { HistoryPoint } from "@/lib/data/derive";
import { formatMonthOnly } from "@/lib/format";

import { trendView, type TrendMetric, type TrendRange } from "./home-model";

const METRICS = [
  { value: "netWorth", label: "순자산" },
  { value: "assets", label: "총자산" },
  { value: "liabilities", label: "총부채" },
] as const satisfies readonly { value: TrendMetric; label: string }[];

const RANGES = [
  { value: "6", label: "6개월" },
  { value: "12", label: "1년" },
  { value: "all", label: "전체" },
] as const satisfies readonly { value: TrendRange; label: string }[];

function provisionalText(months: string[]): string {
  if (months.length === 0) return "월말 기준";
  const first = formatMonthOnly(months[0]);
  const last = formatMonthOnly(months[months.length - 1]);
  return `월말 기준 · ${months.length === 1 ? first : `${first}~${last}`}은 잠정치`;
}

export function TrendCard({ points, className }: { points: HistoryPoint[]; className?: string }) {
  const [metric, setMetric] = useState<TrendMetric>("netWorth");
  const [range, setRange] = useState<TrendRange>("12");

  if (points.length < 2) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>자산 추이</CardTitle>
        </CardHeader>
        <EmptyState
          className="py-6"
          title="두 달 이상 기록되면 추이를 보여 드려요"
          description="매달 정산하면 월말 순자산이 여기에 쌓입니다."
        />
      </Card>
    );
  }

  const view = trendView(points, metric, range);
  const label = METRICS.find((item) => item.value === metric)!.label;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>자산 추이</CardTitle>
        <CardDescription>{provisionalText(view.provisional)}</CardDescription>
        {points.length > 6 && (
          <CardAction>
            <SegmentedControl size="sm" aria-label="기간" options={RANGES} value={range} onValueChange={setRange} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SegmentedControl
          size="sm"
          fullWidth
          className="sm:w-auto sm:self-start"
          aria-label="지표"
          options={METRICS}
          value={metric}
          onValueChange={setMetric}
        />
        <MoneyChart
          type="area"
          label={`월별 ${label} 추이`}
          data={view.rows}
          xKey="month"
          series={[{ key: "value", label }]}
        />
      </CardContent>
    </Card>
  );
}
