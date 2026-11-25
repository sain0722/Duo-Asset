import * as React from "react";

import type { Won } from "@/lib/finance/types";
import { formatCompactWon, formatWon } from "@/lib/format";
import { cn } from "@/lib/utils";

type MoneyProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** 원 단위 정수. null/undefined 는 "미확인"으로 보고 0원과 구분해 "—" 로 표시한다. */
  amount: Won | null | undefined;
  /** 만 원 미만을 반올림한 요약 표기("1억 2,346만 원"). 기본은 정확한 값("123,456,789원"). */
  compact?: boolean;
  /** 양수에 + 를 붙인다. */
  sign?: boolean;
};

/** 금액 표기. 글자 크기·굵기는 className 이나 부모에서 정한다. */
function Money({ amount, compact = false, sign = false, className, ...props }: MoneyProps) {
  if (amount == null) {
    return (
      <span data-slot="money" className={cn("text-muted-foreground", className)} {...props}>
        <span aria-hidden>—</span>
        <span className="sr-only">미확인</span>
      </span>
    );
  }

  const format = compact ? formatCompactWon : formatWon;
  return (
    <span data-slot="money" className={cn("whitespace-nowrap tabular-nums", className)} {...props}>
      {format(amount, { sign })}
    </span>
  );
}

type DeltaProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** 변화량(원). 양수는 증가, 음수는 감소. null/undefined 는 "미확인". */
  amount: Won | null | undefined;
  compact?: boolean;
};

/**
 * 금액 증감. 증가는 ▲ + 붉은색, 감소는 ▼ + 푸른색(한국 관례), 0 은 중립.
 * 색은 방향만 뜻한다. 좋고 나쁨(부채 증가 등)은 문구로 설명한다.
 */
function Delta({ amount, compact = false, className, ...props }: DeltaProps) {
  if (amount == null) return <Money amount={amount} className={className} {...props} />;

  const direction = amount > 0 ? "up" : amount < 0 ? "down" : "flat";
  const format = compact ? formatCompactWon : formatWon;

  return (
    <span
      data-slot="delta"
      data-direction={direction}
      className={cn(
        "inline-flex items-baseline gap-[0.3em] font-medium whitespace-nowrap tabular-nums",
        direction === "up" && "text-up",
        direction === "down" && "text-down",
        direction === "flat" && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {direction !== "flat" && (
        <>
          <svg aria-hidden viewBox="0 0 10 8" className={cn("h-[0.55em] w-[0.7em] shrink-0 self-center fill-current", direction === "down" && "rotate-180")}>
            <path d="M5 0.5 9.5 7.5H0.5Z" />
          </svg>
          <span className="sr-only">{direction === "up" ? "증가" : "감소"}</span>
        </>
      )}
      {format(Math.abs(amount))}
    </span>
  );
}

export { Delta, Money };
export type { DeltaProps, MoneyProps };
