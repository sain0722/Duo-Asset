import * as React from "react";

import { cn } from "@/lib/utils";

/** 돈이 속한 주머니. 구성원 1 · 구성원 2 · 공동. 색은 --member-1 · --member-2 · --joint 토큰. */
type PocketTone = "member-1" | "member-2" | "joint";

const dotClassName: Record<PocketTone, string> = {
  "member-1": "bg-member-1",
  "member-2": "bg-member-2",
  joint: "bg-joint",
};

/** 차트 등에서 같은 색을 쓸 때: pocketColor("joint") → "var(--joint)" */
function pocketColor(tone: PocketTone): string {
  return `var(--${tone})`;
}

type PocketBadgeProps = React.ComponentProps<"span"> & {
  tone: PocketTone;
};

/** 색 점 + 이름. 글자는 본문 색 그대로 두고 점만 색을 가진다. */
function PocketBadge({ tone, className, children, ...props }: PocketBadgeProps) {
  return (
    <span data-slot="pocket-badge" className={cn("inline-flex max-w-full min-w-0 items-center gap-1.5 text-sm font-medium", className)} {...props}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dotClassName[tone])} />
      <span className="truncate">{children}</span>
    </span>
  );
}

export { PocketBadge, pocketColor };
export type { PocketBadgeProps, PocketTone };
