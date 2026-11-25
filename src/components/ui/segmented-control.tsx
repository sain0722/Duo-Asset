"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

type SegmentedControlProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  /** 2~4개. 더 많으면 NativeSelect 를 쓴다. */
  options: readonly { value: T; label: React.ReactNode; disabled?: boolean }[];
  /** 보이는 라벨이 따로 없으면 반드시 넣는다. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** 부모 폭을 채우고 항목을 같은 폭으로 나눈다. */
  fullWidth?: boolean;
  size?: "sm" | "default";
  disabled?: boolean;
  className?: string;
};

/** 2~4개 중 하나를 고르는 전환 컨트롤(보기 방식, 기간, 본인/배우자 등). */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  fullWidth = false,
  size = "default",
  disabled,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      orientation="horizontal"
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      disabled={disabled}
      className={cn(
        "inline-grid auto-cols-fr grid-flow-col items-center gap-0.5 rounded-xl bg-secondary p-1",
        fullWidth && "grid w-full",
        disabled && "opacity-50",
        className,
      )}
      {...aria}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "relative inline-flex items-center justify-center rounded-lg px-3.5 font-semibold whitespace-nowrap text-muted-foreground",
            "transition-colors outline-none hover:text-foreground",
            "focus-visible:ring-[3px] focus-visible:ring-ring/40",
            "disabled:pointer-events-none disabled:opacity-45",
            "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-xs",
            "dark:data-[state=checked]:bg-foreground/12",
            // 트랙 포함 높이: default 44px, sm 36px. 터치 영역은 어느 쪽이든 44px 가 되도록 위아래로 넓힌다.
            "after:absolute after:inset-x-0",
            size === "default" ? "h-9 text-sm after:-inset-y-1" : "h-7 px-3 text-caption after:-inset-y-2",
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export { SegmentedControl };
export type { SegmentedControlProps };
