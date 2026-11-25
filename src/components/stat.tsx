import * as React from "react";

import { cn } from "@/lib/utils";

type StatProps = Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  /** 보통 <Money /> */
  value: React.ReactNode;
  /** 값 아래 보조 줄(전월 대비 증감, 달성률 등) */
  sub?: React.ReactNode;
  /** 라벨 옆 도움말. 보통 <InfoTip /> */
  info?: React.ReactNode;
  /** lg: 화면에 하나뿐인 대표 숫자 · md: 지표 카드(기본) · sm: 목록 안의 작은 지표 */
  size?: "sm" | "md" | "lg";
};

const valueClassName = {
  sm: "text-lg font-semibold tabular-nums tracking-tight",
  md: "num-display text-2xl font-bold",
  // 좁은 화면에서는 폭에 맞춰 줄어든다(360px 에서 10억 단위 금액까지 한 줄에 들어간다).
  lg: "num-display text-[clamp(1.625rem,8vw,2rem)] font-bold sm:text-[2.5rem]",
} as const;

/** 지표: 라벨 + 큰 값 + 보조 줄. 숫자가 주인공이고 나머지는 조용하게 둔다. */
function Stat({ label, value, sub, info, size = "md", className, ...props }: StatProps) {
  return (
    <div data-slot="stat" className={cn("flex min-w-0 flex-col", size === "lg" ? "gap-1.5" : "gap-1", className)} {...props}>
      <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        {info}
      </div>
      <div className={cn("min-w-0 text-foreground", valueClassName[size])}>{value}</div>
      {sub != null && <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}

export { Stat };
export type { StatProps };
