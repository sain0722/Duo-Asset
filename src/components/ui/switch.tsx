"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors outline-none",
        "after:absolute after:-inset-x-1 after:-inset-y-2",
        "focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-6 rounded-full bg-card shadow-sm transition-transform",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
          "dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
