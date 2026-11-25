"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Ym } from "@/lib/finance/types";
import { formatYm } from "@/lib/format";
import { addMonths, compareYm } from "@/lib/month";
import { cn } from "@/lib/utils";

type MonthSwitcherProps = {
  value: Ym;
  onChange: (value: Ym) => void;
  /** 이보다 이전 달로는 가지 못한다. */
  min?: Ym;
  /** 이보다 이후 달로는 가지 못한다. */
  max?: Ym;
  className?: string;
};

const arrowClassName = cn(
  "grid size-11 shrink-0 place-content-center rounded-xl text-foreground transition-colors outline-none",
  "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
  "disabled:pointer-events-none disabled:text-muted-foreground/40",
);

/** ‹ 2026년 11월 › 형태의 월 전환. */
function MonthSwitcher({ value, onChange, min, max, className }: MonthSwitcherProps) {
  const canGoPrev = min == null || compareYm(value, min) > 0;
  const canGoNext = max == null || compareYm(value, max) < 0;

  return (
    <div data-slot="month-switcher" role="group" aria-label="월 선택" className={cn("inline-flex items-center", className)}>
      <button type="button" className={arrowClassName} disabled={!canGoPrev} onClick={() => onChange(addMonths(value, -1))} aria-label="이전 달">
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <span aria-live="polite" className="min-w-[7.25rem] text-center text-base font-semibold tabular-nums">
        {formatYm(value)}
      </span>
      <button type="button" className={arrowClassName} disabled={!canGoNext} onClick={() => onChange(addMonths(value, 1))} aria-label="다음 달">
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}

export { MonthSwitcher };
export type { MonthSwitcherProps };
