import type { Won } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export interface BarSegment {
  key: string;
  label: string;
  amount: Won;
  /** 배경색 클래스 (토큰만) */
  className: string;
}

/**
 * 쓰는 돈 · 원금 · 납입 · 저축 · 남는 돈에 쓰는 색. 범례 점과 막대가 같은 클래스를 쓴다.
 * 저축은 잉크색: brand(틸)는 구성원 2 색과 가까워 같은 막대에서 구분되지 않는다.
 */
export const SEGMENT_COLORS = {
  spend: "bg-foreground/55",
  debt: "bg-foreground/25",
  contribution: "bg-joint",
  saving: "bg-primary",
  "member-1": "bg-member-1",
  "member-2": "bg-member-2",
  joint: "bg-joint",
} as const;

/**
 * 한 줄 누적 막대. 금액 비율대로 칸을 나눌 뿐 값을 새로 계산하지 않는다.
 * 음수·0 인 칸은 그리지 않는다.
 */
export function AllocationBar({ segments, label, className }: { segments: BarSegment[]; label: string; className?: string }) {
  const visible = segments.filter((segment) => segment.amount > 0);
  const total = visible.reduce((sum, segment) => sum + segment.amount, 0);
  return (
    <div role="img" aria-label={label} className={cn("flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted", className)}>
      {total > 0 &&
        visible.map((segment) => (
          <div
            key={segment.key}
            className={cn("h-full min-w-1 first:rounded-l-full last:rounded-r-full", segment.className)}
            style={{ flexGrow: segment.amount, flexBasis: 0 }}
          />
        ))}
    </div>
  );
}

export function SegmentDot({ className }: { className: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />;
}
