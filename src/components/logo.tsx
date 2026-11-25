import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 로고 마크: 겹친 두 원(두 사람)과 겹친 부분(함께 관리하는 돈).
 * 원은 글자색(currentColor), 겹친 부분만 brand. 크기는 className 의 높이(h-*)로 정한다(가로 28 : 세로 19).
 * 도형을 바꾸면 scripts/generate-icons.mjs 도 함께 고치고 아이콘을 다시 만든다.
 */
function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg data-slot="logo-mark" viewBox="0 0 28 19" aria-hidden className={cn("h-5 w-auto shrink-0", className)} {...props}>
      <circle cx="18.5" cy="9.5" r="8.5" fill="currentColor" fillOpacity="0.32" />
      <circle cx="9.5" cy="9.5" r="8.5" fill="currentColor" />
      <path d="M14 2.289a8.5 8.5 0 0 1 0 14.422 8.5 8.5 0 0 1 0-14.422z" className="fill-brand" />
    </svg>
  );
}

type LogoProps = React.ComponentProps<"span"> & {
  /** sm: 상단 바·사이드바 · lg: 로그인 화면 */
  size?: "sm" | "lg";
};

/** 마크 + "DuoAsset" 글자. */
function Logo({ size = "sm", className, ...props }: LogoProps) {
  return (
    <span data-slot="logo" className={cn("inline-flex items-center text-foreground", size === "lg" ? "gap-3" : "gap-2", className)} {...props}>
      <LogoMark className={size === "lg" ? "h-7" : "h-[1.125rem]"} />
      <span className={cn("leading-none font-bold tracking-tight", size === "lg" ? "text-2xl" : "text-[1.0625rem]")}>DuoAsset</span>
    </span>
  );
}

export { Logo, LogoMark };
export type { LogoProps };
