"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import type { Won } from "@/lib/finance/types";
import { formatCompactWon, formatWon, formatYm, formatYmShort } from "@/lib/format";
import { isYm } from "@/lib/month";
import { cn } from "@/lib/utils";

import { moneyAxis } from "./chart-axis";

/*
 * Recharts 공용 래퍼.
 * - 색은 CSS 변수(--chart-1..6, --member-1 등)만 쓰므로 라이트/다크가 자동으로 바뀐다.
 * - 계열 색은 정해진 순서로 배정한다. 같은 대상은 어느 차트에서나 같은 색을 쓴다.
 * - y축은 하나만 쓴다. 단위가 다른 값은 차트를 나눈다.
 */

/** 계열 기본 색. 순서대로 배정하고 6개를 넘기지 않는다(넘으면 "기타"로 묶거나 표로 보여 준다). */
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

/** 축 눈금용 짧은 금액: 120000000 → "1.2억", 48000000 → "4,800만", 5000 → "5,000" */
function formatAxisWon(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 100_000_000) return `${sign}${numberFormat.format(abs / 100_000_000)}억`;
  if (abs >= 10_000) return `${sign}${numberFormat.format(abs / 10_000)}만`;
  return `${sign}${numberFormat.format(abs)}`;
}

function formatXTick(value: unknown): string {
  return typeof value === "string" && isYm(value) ? formatYmShort(value) : String(value);
}

function formatXTitle(value: unknown): string {
  return typeof value === "string" && isYm(value) ? formatYm(value) : String(value);
}

/* ------------------------------------------------------------------ 컨테이너 */

type ChartContainerProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** 차트가 무엇을 보여 주는지 한 문장으로. 스크린 리더가 읽는다. */
  label: string;
  /** 높이(px). 축 눈금 영역을 포함한다. */
  height?: number;
  /** Recharts 차트 요소 하나(<LineChart> 등) */
  children: React.ReactElement;
};

/** 반응형 차트 틀. 폭은 부모를 따르고, 축·격자·글자 스타일을 토큰에 맞춘다. */
function ChartContainer({ label, height = 240, className, children, ...props }: ChartContainerProps) {
  return (
    <div
      data-slot="chart"
      role="figure"
      aria-label={label}
      className={cn(
        "w-full text-xs tabular-nums",
        "[&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none",
        "[&_.recharts-surface:focus-visible]:rounded-md [&_.recharts-surface:focus-visible]:ring-[3px] [&_.recharts-surface:focus-visible]:ring-ring/40",
        className,
      )}
      style={{ height }}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** <CartesianGrid {...chartGridProps} /> — 가로 실선만, 아주 옅게 */
const chartGridProps = { vertical: false, stroke: "var(--border)", strokeWidth: 1 } as const;

/** <XAxis {...chartXAxisProps} dataKey="month" /> */
const chartXAxisProps = {
  axisLine: false,
  tickLine: false,
  tickMargin: 10,
  minTickGap: 16,
  // 눈금이 겹치면 N개마다 하나씩 고르게 보여 주고, 마지막(가장 최근) 눈금은 항상 남긴다.
  interval: "equidistantPreserveEnd",
  tick: { fill: "var(--muted-foreground)" },
  tickFormatter: formatXTick,
} as const;

/** <YAxis {...chartMoneyYAxisProps} /> — 금액 축(만·억 단위) */
const chartMoneyYAxisProps = {
  axisLine: false,
  tickLine: false,
  tickMargin: 6,
  tickCount: 4,
  width: "auto",
  tick: { fill: "var(--muted-foreground)" },
  tickFormatter: formatAxisWon,
} as const;

/* -------------------------------------------------------------------- 툴팁 */

type ChartSeries = { key: string; label: string; color: string };

type ChartTooltipContentProps = Partial<TooltipContentProps<number | string, string>> & {
  /**
   * 차트의 계열 목록. 넘기면 값이 없는(null) 계열도 "미확인"으로 함께 보여 준다.
   * 생략하면 Recharts 가 넘겨준 계열만 보여 준다(값이 없는 계열은 빠진다).
   */
  series?: readonly ChartSeries[];
  /** 제목(x값) 표기. 기본: 월 키면 "2026년 11월", 아니면 그대로. */
  formatTitle?: (value: unknown) => string;
  /** 값 표기. 기본: 만·억 단위 요약("1억 2,346만 원"). */
  formatValue?: (value: Won) => string;
  /** 계열 표식 모양. 선 차트는 "line", 막대·영역은 "square". */
  indicator?: "line" | "square";
};

/** 툴팁 내용. 그 지점의 모든 계열을 값 중심으로 보여 준다. <Tooltip content={<ChartTooltipContent />} /> */
function ChartTooltipContent({
  active,
  payload,
  label,
  series,
  formatTitle = formatXTitle,
  formatValue = formatCompactWon,
  indicator = "line",
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload as Record<string, unknown> | undefined;
  const items = series
    ? series.map((item) => ({ key: item.key, name: item.label, color: item.color, value: row?.[item.key] }))
    : payload.map((item) => ({ key: String(item.dataKey), name: item.name, color: item.color, value: item.value as unknown }));

  return (
    <div className="min-w-36 rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-pop">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{formatTitle(label)}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-caption">
            <span
              aria-hidden
              className={cn("shrink-0", indicator === "line" ? "h-0.5 w-3 rounded-full" : "size-2 rounded-[2px]")}
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            {typeof item.value === "number" ? (
              <span className="ml-auto pl-3 font-semibold tabular-nums">{formatValue(item.value)}</span>
            ) : (
              <span className="ml-auto pl-3 text-muted-foreground">미확인</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- 범례 */

type ChartLegendItem = { label: string; color: string };

type ChartLegendProps = React.ComponentProps<"ul"> & {
  items: readonly ChartLegendItem[];
  indicator?: "line" | "square";
};

/** 범례. 계열이 둘 이상이면 항상 보여 준다(색만으로 구분하게 두지 않는다). 글자는 본문 색, 표식만 계열 색. */
function ChartLegend({ items, indicator = "square", className, ...props }: ChartLegendProps) {
  return (
    <ul data-slot="chart-legend" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground", className)} {...props}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("shrink-0", indicator === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]")}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- 금액 차트 */

type DotInfo = { cx?: number; cy?: number; index?: number };

/** 선의 마지막 점에만 표식을 둔다(현재 값의 위치). 표면색 테두리를 둘러 선과 겹쳐도 또렷하게 보인다. */
function renderEndDot(dot: DotInfo, color: string, lastIndex: number) {
  if (dot.index !== lastIndex || dot.cx == null || dot.cy == null) return <g key={dot.index} />;
  return <circle key={dot.index} cx={dot.cx} cy={dot.cy} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />;
}

type MoneyChartSeries<T> = {
  /** 값이 들어 있는 필드 이름. 값은 원 단위 정수, 미확인은 null. */
  key: Extract<keyof T, string>;
  label: string;
  /** 기본: 순서대로 --chart-1..6. 주머니별 차트는 pocketColor() 를 넘긴다. */
  color?: string;
};

type MoneyChartProps<T extends object> = {
  /** 차트 설명(스크린 리더용). 예: "최근 12개월 순자산 추이" */
  label: string;
  data: readonly T[];
  /** x축 필드. 보통 월 키('YYYY-MM') */
  xKey: Extract<keyof T, string>;
  /** 표 보기에서 x열의 제목. 기본 "월" */
  xLabel?: string;
  series: readonly MoneyChartSeries<T>[];
  /** line: 추이 비교 · area: 단일 계열 추이 강조 · bar: 월별 크기 비교. 기본 line */
  type?: "line" | "area" | "bar";
  /** 계열을 쌓는다(bar · area). 합계가 의미 있을 때만 쓴다. */
  stacked?: boolean;
  height?: number;
  className?: string;
};

/**
 * 월별 금액 차트. 축·격자·툴팁·범례·표 보기(스크린 리더용)를 한 번에 갖춘다.
 * 대부분의 화면은 이것만 쓰면 되고, 다른 형태가 필요하면 ChartContainer 와 Recharts 를 직접 조합한다.
 */
function MoneyChart<T extends object>({
  label,
  data,
  xKey,
  xLabel = "월",
  series,
  type = "line",
  stacked = false,
  height = 240,
  className,
}: MoneyChartProps<T>) {
  const resolved = series.map((item, index) => ({ ...item, color: item.color ?? CHART_COLORS[index % CHART_COLORS.length] }));
  const indicator = type === "line" ? "line" : "square";
  const rows = data as readonly Record<string, unknown>[];
  const lastIndex = rows.length - 1;

  // 값이 모두 같을 때 같은 눈금 글자가 반복되지 않도록 범위를 정한다 (chart-axis.ts)
  const fromZero = type === "bar" || stacked;
  const yAxis = moneyAxis(
    rows.flatMap((row) => {
      const values = resolved.map((item) => row[item.key]).filter((value): value is number => typeof value === "number");
      return stacked ? [values.reduce((total, value) => total + value, 0)] : values;
    }),
    fromZero,
  );

  const activeDot = { r: 4, stroke: "var(--card)", strokeWidth: 2 };

  const common = {
    data: rows as Record<string, unknown>[],
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
    accessibilityLayer: true,
  };
  const axes = (
    <>
      <CartesianGrid {...chartGridProps} />
      {/* 선·영역은 양 끝 점과 눈금 글자가 잘리지 않도록 여유를 둔다. */}
      <XAxis {...chartXAxisProps} dataKey={xKey} padding={type === "bar" ? undefined : { left: 6, right: 18 }} />
      {/* 선·영역은 변화가 보이도록 값 범위에 맞추고, 막대·누적은 길이가 곧 크기이므로 0 에서 시작한다. */}
      <YAxis {...chartMoneyYAxisProps} {...yAxis} />
    </>
  );
  const tooltip = (cursor: React.ComponentProps<typeof Tooltip>["cursor"]) => (
    <Tooltip
      cursor={cursor}
      isAnimationActive={false}
      wrapperStyle={{ outline: "none", zIndex: 10 }}
      content={<ChartTooltipContent indicator={indicator} series={resolved} />}
    />
  );
  const lineCursor = { stroke: "var(--input)", strokeWidth: 1 };

  let chart: React.ReactElement;
  if (type === "bar") {
    chart = (
      <BarChart {...common} barCategoryGap="28%" barGap={2}>
        {axes}
        {tooltip({ fill: "var(--muted)", fillOpacity: 0.7, stroke: "none" })}
        {resolved.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={item.color}
            stackId={stacked ? "stack" : undefined}
            maxBarSize={24}
            // 누적 막대는 표면색 틈(2px)으로 조각을 나누고, 맨 위 조각만 끝을 둥글린다.
            stroke={stacked ? "var(--card)" : undefined}
            strokeWidth={stacked ? 2 : 0}
            radius={!stacked || index === resolved.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    );
  } else if (type === "area") {
    chart = (
      <AreaChart {...common}>
        {axes}
        {tooltip(lineCursor)}
        {resolved.map((item) => (
          <Area
            key={item.key}
            dataKey={item.key}
            name={item.label}
            type="monotone"
            stroke={item.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={item.color}
            fillOpacity={stacked ? 0.22 : 0.1}
            stackId={stacked ? "stack" : undefined}
            dot={stacked ? false : (dot: DotInfo) => renderEndDot(dot, item.color, lastIndex)}
            activeDot={activeDot}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );
  } else {
    chart = (
      <LineChart {...common}>
        {axes}
        {tooltip(lineCursor)}
        {resolved.map((item) => (
          <Line
            key={item.key}
            dataKey={item.key}
            name={item.label}
            type="monotone"
            stroke={item.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={(dot: DotInfo) => renderEndDot(dot, item.color, lastIndex)}
            activeDot={activeDot}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  }

  return (
    <div data-slot="money-chart" className={cn("flex flex-col gap-3", className)}>
      {resolved.length > 1 && <ChartLegend items={resolved} indicator={indicator} />}
      <ChartContainer label={label} height={height}>
        {chart}
      </ChartContainer>

      {/* 표 보기: 차트와 같은 값을 스크린 리더가 읽을 수 있게 한다. <table> 은 overflow 로 잘리지 않으므로 div 로 감싸 숨긴다. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{xLabel}</th>
              {resolved.map((item) => (
                <th key={item.key} scope="col">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[xKey])}>
                <th scope="row">{formatXTitle(row[xKey])}</th>
                {resolved.map((item) => {
                  const value = row[item.key];
                  return <td key={item.key}>{typeof value === "number" ? formatWon(value) : "미확인"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export {
  CHART_COLORS,
  ChartContainer,
  ChartLegend,
  ChartTooltipContent,
  MoneyChart,
  chartGridProps,
  chartMoneyYAxisProps,
  moneyAxis,
  chartXAxisProps,
  formatAxisWon,
};
export type { ChartLegendItem, ChartSeries, MoneyChartProps, MoneyChartSeries };
