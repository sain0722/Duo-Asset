"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbCount = (value ?? defaultValue ?? [min]).length;

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex h-11 w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/12">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }, (_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          data-slot="slider-thumb"
          // 접근성 이름은 실제 슬라이더 역할을 가진 손잡이에 붙인다.
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={cn(
            "relative block size-6 shrink-0 rounded-full border-2 border-primary bg-card shadow-sm transition-shadow outline-none",
            "after:absolute after:-inset-2.5",
            "hover:ring-4 hover:ring-primary/10 focus-visible:ring-4 focus-visible:ring-ring/35",
            "dark:bg-background",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
