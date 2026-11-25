"use client";

import { Progress as ProgressPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/** 채움 색. 트랙은 같은 색을 옅게 쓴다. */
const toneClassName = {
  brand: "bg-brand/15 [&>[data-slot=progress-indicator]]:bg-brand",
  ink: "bg-primary/10 [&>[data-slot=progress-indicator]]:bg-primary",
  warning: "bg-warning/20 [&>[data-slot=progress-indicator]]:bg-warning",
  "member-1": "bg-member-1/15 [&>[data-slot=progress-indicator]]:bg-member-1",
  "member-2": "bg-member-2/15 [&>[data-slot=progress-indicator]]:bg-member-2",
  joint: "bg-joint/20 [&>[data-slot=progress-indicator]]:bg-joint",
} as const;

type ProgressProps = Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "value" | "max"> & {
  /** 0~100. 범위를 넘으면 잘라서 그린다. null 이면 값 없음(빈 막대). */
  value: number | null;
  tone?: keyof typeof toneClassName;
};

function Progress({ className, value, tone = "brand", ...props }: ProgressProps) {
  const percent = value == null ? 0 : Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value == null ? null : percent}
      className={cn("relative h-2 w-full overflow-hidden rounded-full", toneClassName[tone], className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
export type { ProgressProps };
