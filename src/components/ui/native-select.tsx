import { ChevronDown } from "lucide-react";
import * as React from "react";

import { fieldClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 스타일만 입힌 <select>. 모바일에서는 OS 기본 선택기가 뜬다.
 * 선택지는 <option> 을 그대로 자식으로 넣는다.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full", className)}>
      <select
        data-slot="native-select"
        className={cn(fieldClassName, "h-12 appearance-none truncate pr-10 pl-3.5 [&:has(option[value='']:checked)]:text-muted-foreground")}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
