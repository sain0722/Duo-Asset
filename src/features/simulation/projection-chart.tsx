"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import {
  CHART_COLORS,
  ChartContainer,
  ChartLegend,
  chartGridProps,
  chartMoneyYAxisProps,
  chartXAxisProps,
} from "@/components/chart";
import type { SimulationMilestone, SimulationPoint, Ym } from "@/lib/finance/types";
import { formatCompactWon, formatYm } from "@/lib/format";

export type Metric = "netWorth" | "cash" | "assets" | "liabilities";

export const METRIC_LABELS: Record<Metric, string> = {
  netWorth: "순자산",
  cash: "현금성",
  assets: "총자산",
  liabilities: "부채",
};

type Row = { month: Ym; selected: number; base?: number };
type Series = { key: "base" | "selected"; label: string; color: string };

type ProjectionChartProps = {
  metric: Metric;
  points: SimulationPoint[];
  /** 비교할 기본 시나리오. 선택한 것이 기본이면 null */
  basePoints: SimulationPoint[] | null;
  selectedLabel: string;
  baseLabel: string;
  milestones: SimulationMilestone[];
};

/** 기본 시나리오는 늘 chart-1, 비교 시나리오는 chart-2 (색은 대상에 붙는다) */
export function ProjectionChart({ metric, points, basePoints, selectedLabel, baseLabel, milestones }: ProjectionChartProps) {
  const rows: Row[] = points.map((point, i) => ({
    month: point.month,
    selected: point[metric],
    ...(basePoints ? { base: basePoints[i]?.[metric] } : {}),
  }));
  const series: Series[] = basePoints
    ? [
        { key: "base", label: baseLabel, color: CHART_COLORS[0] },
        { key: "selected", label: selectedLabel, color: CHART_COLORS[1] },
      ]
    : [{ key: "selected", label: selectedLabel, color: CHART_COLORS[0] }];
  const byMonth = new Map<Ym, SimulationMilestone[]>();
  for (const milestone of milestones) byMonth.set(milestone.month, [...(byMonth.get(milestone.month) ?? []), milestone]);

  const label = `${selectedLabel} ${METRIC_LABELS[metric]} 예상 추이`;

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        indicator="line"
        items={[
          ...series,
          ...(milestones.length > 0 ? [{ label: "이벤트·상환 완료", color: "var(--muted-foreground)" }] : []),
        ]}
      />
      <ChartContainer label={label} height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid {...chartGridProps} />
          <XAxis {...chartXAxisProps} dataKey="month" padding={{ left: 6, right: 18 }} />
          <YAxis {...chartMoneyYAxisProps} domain={["auto", "auto"]} />
          {[...byMonth.entries()].map(([month, items]) => {
            const shortfall = items.some((m) => m.kind === "cash_shortfall");
            return (
              <ReferenceLine
                key={month}
                x={month}
                stroke={shortfall ? "var(--warning)" : "var(--muted-foreground)"}
                strokeOpacity={shortfall ? 1 : 0.45}
                strokeDasharray="3 3"
              />
            );
          })}
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--input)", strokeWidth: 1 }}
            wrapperStyle={{ outline: "none", zIndex: 10 }}
            content={(props) => <ProjectionTooltip {...props} series={series} byMonth={byMonth} />}
          />
          {series.map((item) => (
            <Line
              key={item.key}
              dataKey={item.key}
              name={item.label}
              type="monotone"
              stroke={item.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>

      <div className="sr-only">
        <table>
          <caption>{label} (연말 기준)</caption>
          <tbody>
            {rows
              .filter((row) => row.month.endsWith("-12"))
              .map((row) => (
                <tr key={row.month}>
                  <th scope="row">{formatYm(row.month)}</th>
                  {series.map((item) => (
                    <td key={item.key}>
                      {item.label} {formatCompactWon(row[item.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectionTooltip({
  active,
  payload,
  label,
  series,
  byMonth,
}: Partial<TooltipContentProps<ValueType, NameType>> & {
  series: Series[];
  byMonth: Map<Ym, SimulationMilestone[]>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  const notes = byMonth.get(String(label)) ?? [];
  return (
    <div className="max-w-64 min-w-36 rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-pop">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{formatYm(String(label))}</p>
      <ul className="flex flex-col gap-1">
        {series.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-caption">
            <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="truncate text-muted-foreground">{item.label}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums">{formatCompactWon(row[item.key] ?? 0)}</span>
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 border-t pt-2 text-caption">
          {notes.map((note, i) => (
            <li key={i} className={note.kind === "cash_shortfall" ? "text-warning-foreground" : undefined}>
              {note.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
