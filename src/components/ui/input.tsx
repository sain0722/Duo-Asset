import * as React from "react";

import { cn } from "@/lib/utils";

/** 입력 컨트롤(Input · Textarea · NativeSelect · MoneyInput)이 함께 쓰는 테두리·포커스·오류 스타일 */
const fieldClassName = cn(
  "w-full min-w-0 rounded-xl border border-input bg-card text-base text-foreground",
  "transition-[border-color,box-shadow] duration-150 outline-none",
  "placeholder:text-muted-foreground/75",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
  "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70",
  "dark:bg-foreground/[0.04]",
);

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldClassName, "h-12 px-3.5", className)} {...props} />;
}

export { Input, fieldClassName };
