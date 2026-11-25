import { CHART_COLORS } from "@/components/chart";
import { Money } from "@/components/money";
import type { BalanceTotals } from "@/lib/finance/types";
import { formatPercent } from "@/lib/format";

import { compositionOf } from "./derive";

/** 자산 구성: 한 줄 누적 막대 + 범례. 색은 묶음 순서(chart-1..6)에 고정된다. */
export function CompositionBar({ byKind }: { byKind: BalanceTotals["byKind"] }) {
  const parts = compositionOf(byKind).filter((part) => part.amount > 0);
  if (parts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="자산 구성">
        {parts.map((part) => (
          <div
            key={part.id}
            className="h-full min-w-1 first:rounded-l-full last:rounded-r-full"
            style={{ width: `${part.percent ?? 0}%`, backgroundColor: CHART_COLORS[part.index] }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {parts.map((part) => (
          <li key={part.id} className="flex min-w-0 items-center gap-2 text-caption">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: CHART_COLORS[part.index] }} />
            <span className="truncate text-muted-foreground">{part.label}</span>
            <span className="ml-auto font-medium tabular-nums">{part.percent == null ? "—" : formatPercent(part.percent, 0)}</span>
            <span className="sr-only">
              <Money amount={part.amount} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
